import re
import uuid
from typing import Any

from apps.db import get_connection, utc_now
from nextmate_agent.agent import delete_thread_checkpoints
from nextmate_agent.utils.llm import get_chat_model, invoke_with_logging


def normalize_thread_id(thread_id: str) -> str:
    """Extract the UUID part from a potentially full thread ID."""
    if not thread_id:
        return ""
    if ":" in thread_id:
        parts = thread_id.split(":")
        # Format: user:{user_id}:thread:{uuid}
        if len(parts) >= 4 and parts[0] == "user" and parts[2] == "thread":
            return parts[3]
    return thread_id


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


def summarize_thread_messages(messages: list[dict[str, Any]], thread_id: str) -> str:
    """Summarize the first 4 messages of a thread to create a title."""
    if not messages:
        return "New thread"

    def _short_title(text: str, max_words: int = 6, max_chars: int = 40) -> str:
        title = " ".join(str(text or "").replace("\n", " ").split()).strip().strip('"').strip("'")
        if not title:
            return "New thread"

        words = title.split()
        if len(words) > max_words:
            title = " ".join(words[:max_words])

        if len(title) > max_chars:
            title = title[:max_chars].rstrip()

        # Avoid ending on a trailing conjunction or article
        bad_tail = {"and", "or", "but", "so", "for", "nor", "yet", "with", "to", "the", "a", "an"}
        tail_words = title.split()
        while len(tail_words) > 1 and tail_words[-1].lower() in bad_tail:
            tail_words = tail_words[:-1]
            title = " ".join(tail_words)

        return title or "New thread"

    # Take first 4 messages
    first_messages = messages[:4]

    # Build conversation text
    conversation_lines = []
    for msg in first_messages:
        role = str(msg.get("role", "unknown"))
        content = str(msg.get("content", "")).strip()
        if content:
            conversation_lines.append(f"{role}: {content}")

    if not conversation_lines:
        return "New thread"

    conversation_text = "\n".join(conversation_lines)

    # Use LLM to summarize only if we have enough context (at least 4 messages)
    if len(messages) >= 4:
        try:
            llm = get_chat_model()
            system_prompt = """You create concise, meaningful titles for conversations.
Return ONLY the title as plain text. No quotes, no markdown, no explanation.
Use all four example messages together; do not base the title only on the first message.
The title should be 3-6 words and no more than 40 characters."""

            user_prompt = f"""Create a short title for this conversation using all four messages below:

{conversation_text}

Return ONLY the title. 3-6 words maximum and no more than 40 characters."""

            response, _ = invoke_with_logging(
                llm,
                [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "thread_title_generation",
                thread_id,
            )

            title = _short_title(str(response))
            if title and title != "New thread":
                return title
        except Exception:
            # Fallback if summarization fails
            pass

    # Fallback: derive a short phrase from the first 4 messages rather than only the first message
    fallback_contents = [str(m.get("content", "")).strip() for m in first_messages if str(m.get("content", "")).strip()]
    if fallback_contents:
        title = " | ".join(fallback_contents[:4])
    else:
        title = "New thread"

    return _short_title(title)


def save_thread_title(user_id: int, thread_id: str, title: str) -> None:
    """Save or update a thread title in the threads table."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            # Check if thread exists
            cur.execute(
                """
                SELECT thread_id FROM threads WHERE thread_id = %s
                """,
                (thread_id,),
            )
            existing = cur.fetchone()

            if existing:
                # Update existing thread
                cur.execute(
                    """
                    UPDATE threads
                    SET title = %s, updated_at = %s
                    WHERE thread_id = %s
                    """,
                    (title, utc_now(), thread_id),
                )
            else:
                # Insert new thread
                cur.execute(
                    """
                    INSERT INTO threads (thread_id, user_id, title, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (thread_id, user_id, title, utc_now(), utc_now()),
                )
        conn.commit()


def get_thread_title(user_id: int, thread_id: str) -> str | None:
    """Get a thread title from the threads table if it exists."""
    norm_id = normalize_thread_id(thread_id)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT title FROM threads
                WHERE user_id = %s AND (thread_id = %s OR thread_id = %s)
                """,
                (user_id, norm_id, thread_id),
            )
            row = cur.fetchone()
            if row:
                return str(row["title"]).strip() if row["title"] else None
    return None


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


def list_threads(user_id: int) -> list[dict[str, Any]]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            # Get all threads from threads table
            cur.execute(
                """
                SELECT thread_id, title, updated_at
                FROM threads
                WHERE user_id = %s
                ORDER BY updated_at DESC
                """,
                (user_id,),
            )
            thread_rows = cur.fetchall()

            # Get all thread messages to count and preview
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

    # Group messages by thread (using normalized IDs)
    grouped: dict[str, list[dict[str, Any]]] = {}
    message_tids = set()
    for row in message_rows:
        tid = normalize_thread_id(str(row["thread_id"]).strip())
        if not tid:
            continue
        grouped.setdefault(tid, []).append(row)
        message_tids.add(tid)

    # Create core_theme lookup
    core_theme_lookup: dict[str, str] = {}
    for row in core_theme_rows:
        full_thread_id = str(row["thread_id"]).strip()
        core_theme = str(row["core_theme"]).strip()
        uuid_part = normalize_thread_id(full_thread_id)
        if uuid_part:
            core_theme_lookup[uuid_part] = core_theme

    # Map thread_rows by normalized ID
    thread_map = {}
    for t_row in thread_rows:
        norm_tid = normalize_thread_id(str(t_row["thread_id"]).strip())
        thread_map[norm_tid] = t_row

    # Combine all unique thread IDs from both tables
    all_norm_tids = set(thread_map.keys()) | message_tids
    
    threads: list[dict[str, Any]] = []
    for norm_tid in all_norm_tids:
        t_row = thread_map.get(norm_tid)
        items = grouped.get(norm_tid, [])
        
        # Use the ID from the threads table if available, otherwise use the one from messages
        raw_tid = str(t_row["thread_id"]).strip() if t_row else (str(items[0]["thread_id"]).strip() if items else norm_tid)
        
        cached_title = (str(t_row["title"]).strip() if t_row and t_row["title"] else None)
        core_theme = core_theme_lookup.get(norm_tid)

        # Priority logic:
        # 1. If we have 4+ messages, we want the high-quality thread summary.
        # 2. If we have a cached title and it's not a placeholder, use it.
        # 3. Otherwise, use core_theme if it exists.
        # 4. Fallback to temporary summary.

        title = None
        
        # Check if we should (re)summarize now
        should_summarize = len(items) >= 4
        is_cached_placeholder = cached_title in ("New thread", "Untitled") or (cached_title and cached_title.startswith("Daily Question:"))

        if should_summarize and (not cached_title or is_cached_placeholder):
            title = summarize_thread_messages(items, raw_tid)
            save_thread_title(user_id, raw_tid, title)
        elif cached_title:
            title = cached_title
        if not title:
            if core_theme:
                title = core_theme
            elif cached_title:
                title = cached_title
            else:
                title = summarize_thread_messages(items, raw_tid)

        if len(title) > 56:
            title = title[:56] + "…"

        preview = "New thread"
        if items:
            last = items[-1]
            last_content = str(last["content"]).strip()
            preview = last_content[:70] if last_content else "New thread"
        
        updated_at = t_row["updated_at"] if t_row else (items[-1]["created_at"] if items else utc_now())
        if items and items[-1]["created_at"] > updated_at:
            updated_at = items[-1]["created_at"]

        threads.append(
            {
                "thread_id": raw_tid,
                "updated_at": updated_at.isoformat(),
                "title": title,
                "preview": preview,
                "message_count": len(items),
            }
        )

    threads.sort(key=lambda x: x["updated_at"], reverse=True)
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

    messages = [
        {
            "role": str(row["role"]),
            "content": str(row["content"]),
            "created_at": row["created_at"].isoformat(),
        }
        for row in rows
    ]
    print(f"get_thread_messages returning {len(messages)} messages for thread {thread_id}")
    for msg in messages:
        print(f"  - role: {msg['role']}, content: {msg['content'][:50]}...")
    return messages


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

    # Save initial title to the threads table immediately
    save_thread_title(user_id, thread_id, title)
    
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
