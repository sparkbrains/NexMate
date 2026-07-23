import asyncio
import logging
from typing import Any

from nextmate_agent.agent import checkpoint_thread_id, get_reply_graph, get_summary_graph
from nextmate_agent.utils.nodes import run_idle_thread_sweep
# from nextmate_agent.guardrails import screen_user_input, GuardrailViolation

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
    # Apply guardrails: toxic language + jailbreak detection (blocking), PII redaction (non-blocking).
    # try:
    #     user_message = await screen_user_input(user_message)
    # except GuardrailViolation as exc:
    #     logger.info(
    #         "Guardrail blocked message for user_id=%s thread_id=%s",
    #         user_id,
    #         thread_id,
    #     )
    #     return exc.user_message, {"error": "guardrail_blocked"}

    try:
        internal_thread_id = checkpoint_thread_id(user_id, thread_id)
        payload = await asyncio.to_thread(
            get_reply_graph().invoke,
            {"user_input": user_message, "thread_id": thread_id},
            {"configurable": {"thread_id": internal_thread_id, "user_id": user_id}},
        )
        assistant_reply = str(payload.get("assistant_reply", "")).strip()

        # Fired unconditionally, regardless of the toxicity outcome below --
        # this matches where manage_cross_thread_memory used to sit in the
        # graph (before detect_explicit_advice ran), so a toxic-blocked
        # message still triggers the idle-sweep exactly as it did before.
        # This is housekeeping for OTHER threads, not this turn's content,
        # so it doesn't need to wait on (or be gated by) anything about the
        # current message.
        asyncio.create_task(
            _sweep_stale_threads_background(user_id=user_id, thread_id=thread_id)
        )

        toxic_detected = payload.get("toxic_language_detected", False)
        if not toxic_detected:
            asyncio.create_task(
                _persist_summary_background(
                    user_id=user_id,
                    thread_id=thread_id,
                    user_message=user_message,
                    assistant_reply=assistant_reply,
                )
            )
            return assistant_reply, {}
        else:
            return assistant_reply, {"error": "toxic_blocked"}
    except Exception as exc:
        logger.exception(
            "Assistant reply generation failed for user_id=%s thread_id=%s",
            user_id,
            thread_id,
        )
        return _fallback_reply_for_error(exc), {"error": "generation_failed"}


async def _sweep_stale_threads_background(user_id: int, thread_id: str) -> None:
    """Runs the idle-sweep (summarize OTHER quiet threads not yet reflected
    in their thread_summary) as a fire-and-forget background task, the same
    way _persist_summary_background already decouples turn-summary writes
    from the user's wait time. Previously this ran synchronously inside
    manage_cross_thread_memory_node, in the reply graph the user was
    waiting on -- moved out since it's bookkeeping for threads the user
    isn't currently looking at, not something the current reply needs.

    thread_id here is the raw UUID (same value generate_assistant_reply
    receives and passes to checkpoint_thread_id), matching what
    run_idle_thread_sweep's exclude_thread_id expects -- it should never
    summarize the thread the user is actively in.
    """
    try:
        summarized_count = await asyncio.to_thread(
            run_idle_thread_sweep,
            user_id,
            thread_id,
        )
        if summarized_count:
            logger.info(
                "Idle thread sweep summarized %s other thread(s) for user_id=%s (excluded thread_id=%s)",
                summarized_count,
                user_id,
                thread_id,
            )
    except Exception:
        logger.exception(
            "Idle thread sweep failed for user_id=%s (excluded thread_id=%s)",
            user_id,
            thread_id,
        )
        # Background sweep failures should not block chat delivery -- same
        # as summary persistence failures below.


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