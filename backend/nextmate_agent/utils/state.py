from typing import Annotated, Any, TypedDict


def _reduce_chat_history(
    existing: list[dict[str, str]] | None, new: list[dict[str, str]]
) -> list[dict[str, str]]:
    if existing is None:
        existing = []
    combined = existing + new
    # Keep last 24 entries (12 turns) — enough for the 16-message window used in generate_reply
    return combined[-24:]


class NextMateState(TypedDict, total=False):
    user_input: str
    memory_entries: list[dict[str, Any]]
    chat_history: Annotated[list[dict[str, str]], _reduce_chat_history]
    memory_context: str
    detected_loops: str
    loop_info: list[dict[str, Any]]
    response_mode: str
    assistant_reply: str
    turn_summary: dict[str, Any]
    thread_id: str
    stored_loops: list[dict[str, Any]]
