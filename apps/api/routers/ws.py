import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from apps.api.config import STREAM_CHUNK_SIZE, STREAM_DELAY_SECONDS
from apps.api.services.chat_service import generate_assistant_reply
from apps.api.services.thread_service import append_thread_message, chunk_text


router = APIRouter()


@router.websocket("/ws/chat/{thread_id}")
async def chat_socket(websocket: WebSocket, thread_id: str) -> None:
    cleaned_thread_id = thread_id.strip()
    await websocket.accept()
    if not cleaned_thread_id:
        await websocket.close(code=1008)
        return

    try:
        while True:
            raw = await websocket.receive_json()
            user_message = str(raw.get("message", "")).strip()
            if not user_message:
                continue

            append_thread_message(cleaned_thread_id, "user", user_message)
            assistant_reply, turn_summary = await generate_assistant_reply(cleaned_thread_id, user_message)

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

            append_thread_message(cleaned_thread_id, "assistant", assistant_reply)
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
        return

