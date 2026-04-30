import asyncio
import logging
from typing import Any

from nextmate_agent.agent import checkpoint_thread_id, get_reply_graph, get_summary_graph

logger = logging.getLogger(__name__)


def _fallback_reply_for_error(exc: Exception) -> str:
    message = str(exc).strip().lower()
    if "401" in message or "authentication" in message or "user not found" in message:
        return (
            "NextMate can't reply right now because the AI provider credentials configured on the "
            "server were rejected. Please update the model API key and try again."
        )
    if "rate limit" in message or "429" in message:
        return (
            "NextMate is temporarily unavailable because the AI provider rate limit was reached. "
            "Please wait a moment and try again."
        )
    return (
        "NextMate hit a temporary model error and couldn't generate a reply just now. "
        "Please try again in a moment."
    )


async def generate_assistant_reply(user_id: int, thread_id: str, user_message: str) -> tuple[str, dict[str, Any]]:
    try:
        internal_thread_id = checkpoint_thread_id(user_id, thread_id)
        payload = await asyncio.to_thread(
            get_reply_graph().invoke,
            {"user_input": user_message, "thread_id": thread_id},
            {"configurable": {"thread_id": internal_thread_id, "user_id": user_id}},
        )
        assistant_reply = str(payload.get("assistant_reply", "")).strip()
        asyncio.create_task(
            _persist_summary_background(
                user_id=user_id,
                thread_id=thread_id,
                user_message=user_message,
                assistant_reply=assistant_reply,
            )
        )
        return assistant_reply, {}
    except Exception as exc:
        logger.exception(
            "Assistant reply generation failed for user_id=%s thread_id=%s",
            user_id,
            thread_id,
        )
        return _fallback_reply_for_error(exc), {"error": "generation_failed"}


async def _persist_summary_background(user_id: int, thread_id: str, user_message: str, assistant_reply: str) -> None:
    try:
        internal_thread_id = checkpoint_thread_id(user_id, thread_id)
        await asyncio.to_thread(
            get_summary_graph().invoke,
            {
                "user_input": user_message,
                "assistant_reply": assistant_reply,
                "thread_id": thread_id,
            },
            {"configurable": {"thread_id": internal_thread_id, "user_id": user_id}},
        )
    except Exception:
        logger.exception(
            "Summary persistence failed for user_id=%s thread_id=%s user_chars=%s reply_chars=%s",
            user_id,
            thread_id,
            len(user_message),
            len(assistant_reply),
        )
        # Background summary failures should not block chat delivery.
        return
