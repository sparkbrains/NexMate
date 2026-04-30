import re
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
            cur.execute(
                """
                SELECT thread_id, role, content, created_at
                FROM thread_messages
                WHERE user_id = %s
                ORDER BY created_at ASC
                """,
                (user_id,),
            )
            rows = cur.fetchall()

    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        thread_id = str(row["thread_id"]).strip()
        if not thread_id:
            continue
        grouped.setdefault(thread_id, []).append(row)

    threads: list[dict[str, str]] = []
    for thread_id, items in grouped.items():
        user_messages = [str(x["content"]).strip() for x in items if str(x["role"]) == "user"]
        user_messages = [message for message in user_messages if message]

        if not user_messages:
            title = "New thread"
        else:
            title = " | ".join(user_messages[:2])
            if len(title) > 56:
                title = title[:56] + "…"

        last = items[-1]
        last_content = str(last["content"]).strip()
        preview = last_content[:70] if last_content else "New thread"
        threads.append(
            {
                "thread_id": thread_id,
                "updated_at": last["created_at"].isoformat(),
                "title": title,
                "preview": preview,
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


def delete_thread_everywhere(user_id: int, thread_id: str) -> dict[str, Any]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM thread_messages WHERE user_id = %s AND thread_id = %s",
                (user_id, thread_id),
            )
            removed_messages = cur.rowcount if cur.rowcount > 0 else 0
            cur.execute(
                "DELETE FROM journal_entries WHERE user_id = %s AND thread_id = %s",
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
