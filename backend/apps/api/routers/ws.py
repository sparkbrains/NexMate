import asyncio
import logging
import os
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from apps.api.config import STREAM_CHUNK_SIZE, STREAM_DELAY_SECONDS
from apps.api.services.auth_service import consume_ws_ticket, get_user_by_token
from apps.api.services.chat_service import generate_assistant_reply
from apps.api.services.thread_service import append_thread_message, chunk_text
from apps.api.services.thread_summary_service import generate_summary_now


router = APIRouter()
logger = logging.getLogger(__name__)

# How often an already-open socket re-checks that its session is still
# valid. Without this, revoking a session (logout elsewhere, password
# change/reset) has no effect on a socket that's already connected.
WS_SESSION_REVALIDATION_SECONDS = int(os.getenv("WS_SESSION_REVALIDATION_SECONDS", "300"))

# How long a socket can sit with no incoming message before the server
# closes it. Closing (rather than leaving it open) matters for two
# reasons: it stops an abandoned tab from holding a connection open
# forever, and it reuses the existing WebSocketDisconnect handler below
# (which already flushes a thread summary on disconnect) so a
# conversation that goes quiet still gets "closed out" even if the user
# never explicitly navigates away.
WS_IDLE_TIMEOUT_SECONDS = int(os.getenv("WS_IDLE_TIMEOUT_SECONDS", "300"))

# Distinct from 4401 (auth rejected) so the frontend can tell "you got
# logged out" apart from "you went quiet" and react differently.
WS_IDLE_TIMEOUT_CLOSE_CODE = 4408

# Tasks must be held onto until completion, or asyncio may garbage-collect
# them mid-run since create_task() only keeps a weak reference internally.
_background_tasks: set[asyncio.Task] = set()


def _fire_and_forget(coro) -> None:
    task = asyncio.create_task(coro)
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


async def _watch_session(websocket: WebSocket, token: str, user_id: int, thread_id: str) -> None:
    """Periodically re-checks that the session behind this connection is
    still valid, and closes the socket if it's been revoked or expired.
    """
    try:
        while True:
            await asyncio.sleep(WS_SESSION_REVALIDATION_SECONDS)
            still_valid = await asyncio.to_thread(get_user_by_token, token)
            if not still_valid:
                logger.info(
                    "Session no longer valid, closing websocket user_id=%s thread_id=%s",
                    user_id,
                    thread_id,
                )
                await websocket.close(code=4401)
                return
    except asyncio.CancelledError:
        pass


async def _watch_idle(websocket: WebSocket, activity: dict, user_id: int, thread_id: str) -> None:
    """Closes the socket once WS_IDLE_TIMEOUT_SECONDS has passed since the
    last inbound message. `activity["last"]` is updated by the main receive
    loop on every message; each wake-up here recomputes how much time is
    actually left rather than polling on a fixed interval, so a chatty
    conversation never trips this early and a quiet one closes right on
    schedule instead of up to one poll-interval late.
    """
    try:
        while True:
            remaining = WS_IDLE_TIMEOUT_SECONDS - (time.monotonic() - activity["last"])
            if remaining <= 0:
                logger.info(
                    "Closing idle websocket user_id=%s thread_id=%s (idle >= %ss)",
                    user_id,
                    thread_id,
                    WS_IDLE_TIMEOUT_SECONDS,
                )
                await websocket.close(code=WS_IDLE_TIMEOUT_CLOSE_CODE)
                return
            await asyncio.sleep(remaining)
    except asyncio.CancelledError:
        pass


@router.websocket("/ws/chat/{thread_id}")
async def chat_socket(websocket: WebSocket, thread_id: str) -> None:
    cleaned_thread_id = thread_id.strip()
    ticket = websocket.query_params.get("ticket", "").strip()
    # The ticket is single-use and short-lived; consuming it hands back the
    # real (long-lived) session token it was minted from, which is what
    # actually authenticates this connection and gets re-checked by the
    # watchdog below. The ticket itself is never reusable past this point.
    token = await asyncio.to_thread(consume_ws_ticket, ticket)
    user = await asyncio.to_thread(get_user_by_token, token or "")
    await websocket.accept()
    if not cleaned_thread_id or not user:
        logger.warning("Rejected websocket connection thread_id=%s authenticated=%s", cleaned_thread_id, bool(user))
        await websocket.close(code=4401)
        return

    logger.info("Websocket connected user_id=%s thread_id=%s", user.id, cleaned_thread_id)

    activity = {"last": time.monotonic()}
    watchdog_task = asyncio.create_task(_watch_session(websocket, token, user.id, cleaned_thread_id))
    idle_task = asyncio.create_task(_watch_idle(websocket, activity, user.id, cleaned_thread_id))

    try:
        while True:
            raw = await websocket.receive_json()
            activity["last"] = time.monotonic()
            user_message = str(raw.get("message", "")).strip()
            
            if len(user_message) > 30000:
                logger.warning("Rejecting oversized message from user_id=%s (length: %s)", user.id, len(user_message))
                await websocket.send_json({
                    "event": "error",
                    "message": "Message is too long. Please shorten it to under 30,000 characters.",
                    "thread_id": cleaned_thread_id
                })
                continue

            if not user_message:
                continue

            logger.info(
                "Received chat message user_id=%s thread_id=%s chars=%s",
                user.id,
                cleaned_thread_id,
                len(user_message),
            )
            await asyncio.to_thread(append_thread_message, user.id, cleaned_thread_id, "user", user_message)
            assistant_reply, turn_summary = await generate_assistant_reply(user.id, cleaned_thread_id, user_message)

            if turn_summary.get("error") == "toxic_blocked":
                await websocket.send_json(
                    {
                        "event": "start",
                        "thread_id": cleaned_thread_id,
                        "role": "assistant",
                    }
                )
                await websocket.send_json(
                    {
                        "event": "chunk",
                        "thread_id": cleaned_thread_id,
                        "role": "assistant",
                        "delta": assistant_reply,
                    }
                )
                await asyncio.to_thread(append_thread_message, user.id, cleaned_thread_id, "assistant", assistant_reply)
                logger.info(
                    "Delivered toxic warning message user_id=%s thread_id=%s",
                    user.id,
                    cleaned_thread_id,
                )
                await websocket.send_json(
                    {
                        "event": "done",
                        "thread_id": cleaned_thread_id,
                        "role": "assistant",
                        "content": assistant_reply,
                        "summary": turn_summary,
                    }
                )
                continue

            await websocket.send_json(
                {
                    "event": "start",
                    "thread_id": cleaned_thread_id,
                    "role": "assistant",
                }
            )

            for delta in chunk_text(assistant_reply, STREAM_CHUNK_SIZE):
                await websocket.send_json(
                    {
                        "event": "chunk",
                        "thread_id": cleaned_thread_id,
                        "role": "assistant",
                        "delta": delta,
                    }
                )
                if STREAM_DELAY_SECONDS > 0:
                    await asyncio.sleep(STREAM_DELAY_SECONDS)

            await asyncio.to_thread(append_thread_message,user.id, cleaned_thread_id, "assistant", assistant_reply)
            logger.info(
                "Delivered assistant reply user_id=%s thread_id=%s chars=%s error=%s",
                user.id,
                cleaned_thread_id,
                len(assistant_reply),
                turn_summary.get("error"),
            )
            await websocket.send_json(
                {
                    "event": "done",
                    "thread_id": cleaned_thread_id,
                    "role": "assistant",
                    "content": assistant_reply,
                    "summary": turn_summary,
                }
            )
    except WebSocketDisconnect:
        logger.info("Websocket disconnected user_id=%s thread_id=%s", user.id, cleaned_thread_id)
        _fire_and_forget(asyncio.to_thread(generate_summary_now, user.id, cleaned_thread_id))
        return
    except Exception:
        logger.exception("Unhandled websocket failure for thread_id=%s", cleaned_thread_id)
        try:
            await websocket.send_json(
                {
                    "event": "error",
                    "thread_id": cleaned_thread_id,
                    "detail": "The conversation stopped because of a server-side error.",
                }
            )
        except Exception:
            pass
        return
    finally:
        watchdog_task.cancel()
        idle_task.cancel()