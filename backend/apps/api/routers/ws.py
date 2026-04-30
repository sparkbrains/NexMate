import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from apps.api.config import STREAM_CHUNK_SIZE, STREAM_DELAY_SECONDS
from apps.api.services.auth_service import get_user_by_token
from apps.api.services.chat_service import generate_assistant_reply
from apps.api.services.thread_service import append_thread_message, chunk_text


router = APIRouter()
logger = logging.getLogger(__name__)


@router.websocket("/ws/chat/{thread_id}")
async def chat_socket(websocket: WebSocket, thread_id: str) -> None:
    cleaned_thread_id = thread_id.strip()
    token = websocket.query_params.get("token", "").strip()
    user = get_user_by_token(token)
    await websocket.accept()
    if not cleaned_thread_id or not user:
        logger.warning("Rejected websocket connection thread_id=%s authenticated=%s", cleaned_thread_id, bool(user))
        await websocket.close(code=4401)
        return

    logger.info("Websocket connected user_id=%s thread_id=%s", user.id, cleaned_thread_id)

    try:
        while True:
            raw = await websocket.receive_json()
            user_message = str(raw.get("message", "")).strip()
            if not user_message:
                continue

            logger.info(
                "Received chat message user_id=%s thread_id=%s chars=%s",
                user.id,
                cleaned_thread_id,
                len(user_message),
            )
            append_thread_message(user.id, cleaned_thread_id, "user", user_message)
            assistant_reply, turn_summary = await generate_assistant_reply(user.id, cleaned_thread_id, user_message)

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

            append_thread_message(user.id, cleaned_thread_id, "assistant", assistant_reply)
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
