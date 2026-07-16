from typing import Annotated, Any, TypedDict


# Safety ceiling ONLY -- not the normal trim mechanism. manage_thread_summary_node
# (via the __replace__ marker) is what actually trims chat_history once the
# token-based compaction threshold is hit. This cap just prevents unbounded
# growth in the rare case compaction keeps failing (e.g. fast model errors
# repeatedly) -- it should almost never be the thing that fires in practice.
_HARD_SAFETY_MESSAGE_CAP = 300


def _reduce_chat_history(
    existing: list[dict[str, str]] | None, new
) -> list[dict[str, str]]:
    if existing is None:
        existing = []
    if isinstance(new, dict) and new.get("__replace__"):
        return new["value"]
    combined = existing + new
    if len(combined) > _HARD_SAFETY_MESSAGE_CAP:
        return combined[-_HARD_SAFETY_MESSAGE_CAP:]
    return combined


def _reduce_response_mode_history(
    existing: list[str] | None, new: list[str]
) -> list[str]:
    if existing is None:
        existing = []
    return existing + new


class NextMateState(TypedDict, total=False):
    user_input: str
    memory_entries: list[dict[str, Any]]
    chat_history: Annotated[list[dict[str, str]], _reduce_chat_history]
    memory_context: str
    detected_loops: str
    loop_info: list[dict[str, Any]]
    response_mode: str
    response_mode_history: Annotated[list[str], _reduce_response_mode_history]
    assistant_reply: str
    turn_summary: dict[str, Any]
    thread_id: str
    thread_uuid: str
    stored_loops: list[dict[str, Any]]
    active_loop: dict[str, Any]
    toxic_language_detected: bool
    prompt_injection_detected: bool
    pii_detected: bool
    crisis_detected: bool
    # Per-thread compaction (thread_summary_service.py)
    thread_summary: str
    # Cross-thread digest (cross_thread_memory_service.py)
    active_thread_summaries: list[dict[str, Any]]
    memory_digest: dict[str, Any] | None