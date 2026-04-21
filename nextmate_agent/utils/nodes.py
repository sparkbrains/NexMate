from datetime import datetime, timezone

from langchain_core.runnables import RunnableConfig

from nextmate_agent.utils.config import get_settings
from nextmate_agent.utils.llm import get_chat_model, parse_json_object
from nextmate_agent.utils.memory_store import append_jsonl, read_jsonl
from nextmate_agent.utils.prompts import (
    CHAT_SYSTEM_PROMPT,
    SUMMARY_SYSTEM_PROMPT,
    build_chat_user_prompt,
    build_summary_user_prompt,
)
from nextmate_agent.utils.state import NextMateState


def _thread_id_from_config(config: RunnableConfig | None) -> str:
    if not config:
        return "default"
    configurable = config.get("configurable", {})
    thread_id = configurable.get("thread_id", "default")
    return str(thread_id)


def load_memory_node(state: NextMateState, config: RunnableConfig) -> NextMateState:
    settings = get_settings()
    thread_id = _thread_id_from_config(config)
    entries = read_jsonl(settings.summary_store_path)
    thread_entries = [entry for entry in entries if str(entry.get("thread_id", "default")) == thread_id]
    return {"memory_entries": thread_entries}


def build_memory_context_node(state: NextMateState) -> NextMateState:
    settings = get_settings()
    entries = state.get("memory_entries", [])
    window = entries[-settings.memory_window :]

    if not window:
        return {"memory_context": "No prior memory available yet."}

    lines: list[str] = []
    for item in window:
        summary = item.get("summary", "")
        mood = item.get("mood", "unknown")
        created_at = item.get("created_at", "")
        lines.append(f"- ({created_at}) mood={mood}: {summary}")

    return {"memory_context": "\n".join(lines)}


def generate_reply_node(state: NextMateState) -> NextMateState:
    llm = get_chat_model()
    user_input = state.get("user_input", "")
    memory_context = state.get("memory_context", "No prior memory available yet.")
    recent_history = state.get("chat_history", [])[-8:]
    history_context = "\n".join(
        [f"- {message.get('role', 'unknown')}: {message.get('content', '')}" for message in recent_history]
    )
    if not history_context:
        history_context = "No previous messages in this thread yet."

    content = build_chat_user_prompt(
        user_input=user_input,
        memory_context=memory_context,
        history_context=history_context,
    )
    reply = llm.invoke(
        [
            {"role": "system", "content": CHAT_SYSTEM_PROMPT},
            {"role": "user", "content": content},
        ]
    ).content

    assistant_reply = (reply or "").strip()
    return {
        "assistant_reply": assistant_reply,
        "chat_history": [
            {"role": "user", "content": user_input},
            {"role": "assistant", "content": assistant_reply},
        ],
    }


def summarize_turn_node(state: NextMateState) -> NextMateState:
    llm = get_chat_model()
    user_input = state.get("user_input", "")
    assistant_reply = state.get("assistant_reply", "")

    content = build_summary_user_prompt(user_input=user_input, assistant_reply=assistant_reply)
    raw = llm.invoke(
        [
            {"role": "system", "content": SUMMARY_SYSTEM_PROMPT},
            {"role": "user", "content": content},
        ]
    ).content

    summary = parse_json_object(raw if isinstance(raw, str) else "")
    summary["created_at"] = datetime.now(timezone.utc).isoformat()
    return {"turn_summary": summary}


def persist_summary_node(state: NextMateState, config: RunnableConfig) -> NextMateState:
    settings = get_settings()
    thread_id = _thread_id_from_config(config)
    summary = state.get("turn_summary", {})
    if summary:
        summary["thread_id"] = thread_id
        append_jsonl(settings.summary_store_path, summary)
    return {}
