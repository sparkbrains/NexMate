import re
import uuid
from typing import Any

from apps.db import get_connection, utc_now
from nextmate_agent.agent import delete_thread_checkpoints


def chunk_text(text: str, chunk_size: int) -> list[str]:
    clean = text or ""
    if not clean:
        return [""]

    tokens = re.findall(r"\S+\s*", clean)
    if not tokens:
        return [clean]

    if chunk_size <= 0:
        chunk_size = 1

    chunks: list[str] = []
    for i in range(0, len(tokens), chunk_size):
        chunks.append("".join(tokens[i : i + chunk_size]))
    return chunks


def append_thread_message(user_id: int, thread_id: str, role: str, content: str) -> None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO thread_messages (user_id, thread_id, role, content, created_at)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (user_id, thread_id, role, content, utc_now()),
            )
        conn.commit()


def list_threads(user_id: int) -> list[dict[str, str]]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            # Get all thread messages
            cur.execute(
                """
                SELECT thread_id, role, content, created_at
                FROM thread_messages
                WHERE user_id = %s
                ORDER BY created_at ASC
                """,
                (user_id,),
            )
            message_rows = cur.fetchall()
            
            # Get first core_theme for each thread
            cur.execute(
                """
                SELECT DISTINCT ON (thread_id) thread_id, core_theme
                FROM journal_entries_v2
                WHERE user_id = %s AND core_theme IS NOT NULL AND core_theme != ''
                ORDER BY thread_id, created_at ASC
                """,
                (user_id,),
            )
            core_theme_rows = cur.fetchall()

    # Group messages by thread
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in message_rows:
        thread_id = str(row["thread_id"]).strip()
        if not thread_id:
            continue
        grouped.setdefault(thread_id, []).append(row)

    # Create core_theme lookup
    core_theme_lookup: dict[str, str] = {}
    for row in core_theme_rows:
        full_thread_id = str(row["thread_id"]).strip()
        core_theme = str(row["core_theme"]).strip()
        
        # Extract UUID from full thread_id format "user:{user_id}:thread:{uuid}"
        if full_thread_id and core_theme and ":" in full_thread_id:
            parts = full_thread_id.split(":")
            if len(parts) >= 4 and parts[0] == "user" and parts[2] == "thread":
                uuid_part = parts[3]
                core_theme_lookup[uuid_part] = core_theme

    threads: list[dict[str, Any]] = []
    for thread_id, items in grouped.items():
        # Use core_theme if available, otherwise fall back to user messages
        if thread_id in core_theme_lookup:
            title = core_theme_lookup[thread_id]
            if len(title) > 56:
                title = title[:56] + "…"
        else:
            user_messages = [str(x["content"]).strip() for x in items if str(x["role"]) == "user"]
            user_messages = [message for message in user_messages if message]

            if user_messages:
                title = " | ".join(user_messages[:2])
                if len(title) > 56:
                    title = title[:56] + "…"
            else:
                title = "New thread"

        last = items[-1]
        last_content = str(last["content"]).strip()
        preview = last_content[:70] if last_content else "New thread"
        threads.append(
            {
                "thread_id": thread_id,
                "updated_at": last["created_at"].isoformat(),
                "title": title,
                "preview": preview,
                "message_count": len(items),
            }
        )

    threads.sort(key=lambda item: item["updated_at"], reverse=True)
    return threads


def get_thread_messages(user_id: int, thread_id: str) -> list[dict[str, str]]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT role, content, created_at
                FROM thread_messages
                WHERE user_id = %s AND thread_id = %s
                ORDER BY created_at ASC
                """,
                (user_id, thread_id),
            )
            rows = cur.fetchall()

    return [
        {
            "role": str(row["role"]),
            "content": str(row["content"]),
            "created_at": row["created_at"].isoformat(),
        }
        for row in rows
    ]


def create_thread(user_id: int, title: str, context: dict[str, Any] = None) -> dict[str, Any]:
    """Create a new thread with optional context."""
    thread_id = str(uuid.uuid4())
    
    with get_connection() as conn:
        with conn.cursor() as cur:
            # Add the question as a bot message to start the conversation
            if context and "question_text" in context:
                cur.execute(
                    """
                    INSERT INTO thread_messages (user_id, thread_id, role, content, created_at)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (user_id, thread_id, "assistant", context["question_text"], utc_now()),
                )
        conn.commit()
    
    return {
        "thread_id": thread_id,
        "title": title,
        "message_count": 1 if context and "question_text" in context else 0,
    }


def delete_thread_everywhere(user_id: int, thread_id: str) -> dict[str, Any]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM thread_messages WHERE user_id = %s AND thread_id = %s",
                (user_id, thread_id),
            )
            removed_messages = cur.rowcount if cur.rowcount > 0 else 0
            cur.execute(
                "DELETE FROM journal_entries_v2 WHERE user_id = %s AND thread_id = %s",
                (user_id, thread_id),
            )
            removed_summaries = cur.rowcount if cur.rowcount > 0 else 0
        conn.commit()

    delete_thread_checkpoints(user_id, thread_id)
    return {
        "user_id": user_id,
        "thread_id": thread_id,
        "removed_messages": removed_messages,
        "removed_summaries": removed_summaries,
        "removed_checkpoints": True,
    }
