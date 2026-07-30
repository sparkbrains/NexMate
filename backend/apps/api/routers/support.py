import json
import logging
import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.concurrency import run_in_threadpool

from apps.api.services.support_bot_service import stream_support_reply
from apps.api.services.support_chat_log_service import (
    log_support_exchange,
    resolve_user_id_from_token,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/support", tags=["support"])

MAX_HISTORY_MESSAGES = 20
MAX_MESSAGE_LENGTH = 2000


@router.websocket("/ws")
async def support_chat_ws(websocket: WebSocket) -> None:
    token = websocket.query_params.get("token")
    await websocket.accept()

    user_id: int | None = None
    if token:
        try:
            user_id = await run_in_threadpool(resolve_user_id_from_token, token)
        except Exception as exc:  # noqa: BLE001
            logger.exception("support widget token lookup failed: %s", exc)
            user_id = None

    history: list[dict[str, str]] = []
    session_id = str(uuid.uuid4())

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "Invalid message format."})
                continue

            text = (payload.get("content") or "").strip()
            if not text:
                continue
            if len(text) > MAX_MESSAGE_LENGTH:
                await websocket.send_json({"type": "error", "message": "Message is too long."})
                continue

            history.append({"role": "user", "content": text})
            history = history[-MAX_HISTORY_MESSAGES:]

            full_reply = ""
            try:
                async for delta in stream_support_reply(history):
                    full_reply += delta
                    await websocket.send_json({"type": "chunk", "content": delta})
            except Exception as exc:  # noqa: BLE001
                logger.exception("support bot generation failed: %s", exc)
                await websocket.send_json({
                    "type": "error",
                    "message": "Sorry, something went wrong on our end. Please try again in a moment.",
                })
                continue

            history.append({"role": "assistant", "content": full_reply})
            history = history[-MAX_HISTORY_MESSAGES:]
            await websocket.send_json({"type": "done"})

            try:
                await run_in_threadpool(log_support_exchange, session_id, text, full_reply, user_id=user_id)
            except Exception as exc:  # noqa: BLE001
                logger.exception("failed to persist support chat log: %s", exc)

    except WebSocketDisconnect:
        pass
