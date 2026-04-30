from datetime import datetime, timezone
from typing import Any

from langchain_core.runnables import RunnableConfig
from psycopg.types.json import Jsonb

from apps.db import get_connection
from nextmate_agent.utils.config import get_settings
from nextmate_agent.utils.llm import get_chat_model, parse_json_object
from nextmate_agent.utils.prompts import (
    CHAT_SYSTEM_PROMPT,
    SUMMARY_SYSTEM_PROMPT,
    build_chat_user_prompt,
    build_summary_user_prompt,
)
from nextmate_agent.utils.state import NextMateState


def _safe_int(value: Any, default: int = -1) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _thread_id_from_state(state: NextMateState) -> str:
    thread_id = str(state.get("thread_id", "")).strip()
    return thread_id or "default"


def _user_id_from_config(config: RunnableConfig | None) -> int:
    if not config:
        return -1
    configurable = config.get("configurable", {})
    try:
        return int(configurable.get("user_id", -1))
    except (TypeError, ValueError):
        return -1


def _parse_created_at(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc)
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value).astimezone(timezone.utc)
        except ValueError:
            pass
    return datetime.now(timezone.utc)


def load_memory_node(state: NextMateState, config: RunnableConfig) -> NextMateState:
    settings = get_settings()
    thread_id = _thread_id_from_state(state)
    user_id = _user_id_from_config(config)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT summary, mood, created_at
                FROM (
                    SELECT summary, mood, created_at
                    FROM journal_entries
                    WHERE user_id = %s AND thread_id = %s
                    ORDER BY created_at DESC
                    LIMIT %s
                ) recent_entries
                ORDER BY created_at ASC
                """,
                (user_id, thread_id, settings.memory_window),
            )
            rows = cur.fetchall()

    entries = [
        {
            "summary": str(row["summary"]),
            "mood": str(row["mood"]),
            "created_at": row["created_at"].isoformat(),
        }
        for row in rows
    ]
    return {"memory_entries": entries}


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
    thread_id = _thread_id_from_state(state)
    user_id = _user_id_from_config(config)
    user_input = str(state.get("user_input", ""))
    assistant_reply = str(state.get("assistant_reply", ""))
    summary = dict(state.get("turn_summary", {}))
    if not summary:
        return {}

    created_at = _parse_created_at(summary.get("created_at"))
    mood = str(summary.get("mood", "unknown")).strip() or "unknown"
    next_focus = str(summary.get("next_focus", "")).strip()
    signals = summary.get("signals", [])
    if not isinstance(signals, list):
        signals = []

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO journal_entries (
                    user_id,
                    thread_id,
                    user_input,
                    assistant_reply,
                    summary,
                    mood,
                    signals,
                    next_focus,
                    raw_summary,
                    created_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    user_id,
                    thread_id,
                    user_input,
                    assistant_reply,
                    str(summary.get("summary", "")).strip(),
                    mood,
                    Jsonb(signals),
                    next_focus,
                    Jsonb(summary),
                    created_at,
                ),
            )
        conn.commit()
    return {}
