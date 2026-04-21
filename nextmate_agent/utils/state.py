from operator import add
from typing import Annotated, Any, TypedDict


class NextMateState(TypedDict, total=False):
    user_input: str
    memory_entries: list[dict[str, Any]]
    chat_history: Annotated[list[dict[str, str]], add]
    memory_context: str
    assistant_reply: str
    turn_summary: dict[str, Any]
