import asyncio
import json
import logging
import random
from datetime import datetime, timedelta, timezone
from typing import Any, List, Dict, Optional
from apps.db import get_connection, utc_now
from nextmate_agent.utils.llm import invoke_with_logging, ainvoke_with_logging, get_chat_model

logger = logging.getLogger(__name__)


def get_previous_day_entries(user_id: int, conn: Optional[Any] = None) -> List[Dict[str, Any]]:
    """Get journal entries from the most recent previous day with entries.
    
    Optimized to fetch entries in a single SQL query roundtrip.
    Accepts an optional database connection to reuse an existing transaction context.
    """
    today = datetime.now(timezone.utc).date()
    start_of_today = datetime.combine(today, datetime.min.time()).replace(tzinfo=timezone.utc)

    query = """
        SELECT thread_id, core_theme, user_input, assistant_reply, created_at
        FROM journal_entries_v2
        WHERE user_id = %s
          AND created_at::date = (
              SELECT MAX(created_at::date)
              FROM journal_entries_v2
              WHERE user_id = %s AND created_at < %s
          )
        ORDER BY created_at DESC
    """

    if conn is not None:
        with conn.cursor() as cur:
            cur.execute(query, (user_id, user_id, start_of_today))
            return cur.fetchall()

    with get_connection() as connection:
        with connection.cursor() as cur:
            cur.execute(query, (user_id, user_id, start_of_today))
            return cur.fetchall()


def extract_core_themes(entries: List[Dict[str, Any]]) -> List[str]:
    """Extract unique core themes from entries."""
    themes = set()
    for entry in entries:
        theme = entry.get("core_theme", "").strip() if entry.get("core_theme") else ""
        if theme:
            themes.add(theme)
    return list(themes)


async def generate_question_from_themes_llm(themes: List[str], user_id: int = 0) -> str:
    """Generate a contextual daily question using LLM based on core themes."""
    if not themes:
        return "How are you feeling today?"

    selected_themes = themes[:3] if len(themes) <= 3 else random.sample(themes, 3)

    prompt = f"""You are a thoughtful journaling companion helping someone reflect deeply on their experiences. Based on these core themes from yesterday's journal entries, craft ONE insightful follow-up question that encourages deeper self-exploration.

Core Themes from Yesterday: {', '.join(selected_themes)}

Instructions:
1. FIRST, understand and rephrase the themes in natural language - DO NOT copy them directly
2. Extract the key concepts, emotions, or situations from the themes
3. Create a natural, conversational question that builds on those concepts
4. The question should sound like a genuine continuation of your conversation

IMPORTANT: Generate exactly ONE question only. Do not provide alternatives or multiple versions.

Question Crafting Guidelines:
- Transform technical/awkward theme language into natural, relatable terms
- Focus on the underlying experience, not the exact wording
- Use varied formats: "Thinking about...", "How have you been feeling about...", "What's your relationship with..."
- Keep it warm, conversational, and human-sounding
- Avoid repeating the exact theme wording or awkward phrasing
- 1-2 sentences maximum

Examples of good transformations:
- Theme: "user experienced pressure to stay on top of tasks" → "How have you been managing that pressure to stay on top of things?"
- Theme: "user felt rare sense of self-sufficiency through rest" → "How has that feeling of self-sufficiency been showing up for you since then?"

Generate only the natural, rephrased question:"""

    try:
        llm = get_chat_model()
        messages = [{"role": "user", "content": prompt}]
        content, usage = await ainvoke_with_logging(llm, messages, "daily_question_generation", user_id)
        return content.strip()
    except Exception as exc:
        logger.error(
            "Failed to generate daily question via LLM for user_id=%s: %s. Falling back to template generation.",
            user_id,
            exc,
            exc_info=True,
        )
        return generate_question_from_themes(selected_themes)


def generate_question_from_themes(themes: List[str]) -> str:
    """Generate a question based on core themes (fallback method)."""
    if not themes:
        return "How are you feeling today?"
    
    # Better question templates that are more natural and contextual
    question_templates = [
        "Thinking back to yesterday's reflection on {theme}, how has that perspective been on your mind today?",
        "You mentioned {theme} in our last conversation. What new thoughts or feelings have come up about that since then?",
        "Reflecting on {theme} from yesterday, what insights or realizations have you had since we last spoke?",
        "Yesterday we explored {theme}. How does that topic feel relevant to your current situation?",
        "Following up on {theme} from our previous conversation, what's your relationship with that idea today?",
        "Since we discussed {theme} yesterday, what new perspectives have emerged for you?",
    ]
    
    # Select a random theme and template
    selected_theme = random.choice(themes)
    template = random.choice(question_templates)
    
    return template.format(theme=selected_theme)


def _load_daily_question_context_sync(user_id: int) -> Dict[str, Any]:
    today = datetime.now(timezone.utc).date()

    with get_connection() as conn:
        expire_old_pending_questions(user_id, conn=conn)

        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, question_text, source_thread_id, source_core_themes, status, answered_at
                FROM daily_questions
                WHERE user_id = %s AND question_date = %s
                ORDER BY question_order ASC
                """,
                (user_id, today),
            )
            existing = cur.fetchall()

            if existing:
                return {
                    "existing": [
                        {
                            "id": row["id"],
                            "question_text": row["question_text"],
                            "source_thread_id": row["source_thread_id"],
                            "source_core_themes": (
                                json.loads(row["source_core_themes"])
                                if isinstance(row["source_core_themes"], str)
                                else row["source_core_themes"]
                            ),
                            "status": row["status"],
                            "answered_at": row["answered_at"].isoformat() if row["answered_at"] else None,
                        }
                        for row in existing
                    ],
                    "entries": None,
                }

        entries = get_previous_day_entries(user_id, conn=conn)

    return {"existing": None, "entries": entries}


def _insert_daily_question_sync(
    user_id: int, question_text: str, source_thread_id: str, themes_subset: List[str]
) -> int:
    today = datetime.now(timezone.utc).date()
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO daily_questions
                (user_id, question_date, question_text, source_thread_id, source_core_themes,
                 status, question_order, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    user_id, today, question_text, source_thread_id,
                    json.dumps(themes_subset), "pending", 1, utc_now(), utc_now(),
                ),
            )
            row = cur.fetchone()
            question_id = row["id"]
        conn.commit()
    return question_id


async def get_or_create_daily_question(user_id: int) -> List[Dict[str, Any]]:
    """Get existing daily questions or create new ones. Always returns a list."""
    ctx = await asyncio.to_thread(_load_daily_question_context_sync, user_id)

    if ctx["existing"] is not None:
        return ctx["existing"]

    entries = ctx["entries"]
    if not entries:
        return []

    themes = extract_core_themes(entries)
    if not themes:
        return []

    themes_subset = random.sample(themes, min(2, len(themes)))
    question_text = await generate_question_from_themes_llm(themes_subset, user_id)
    source_entry = random.choice(entries)
    source_thread_id = source_entry["thread_id"]

    question_id = await asyncio.to_thread(
        _insert_daily_question_sync, user_id, question_text, source_thread_id, themes_subset
    )

    return [
        {
            "id": question_id,
            "question_text": question_text,
            "source_thread_id": source_thread_id,
            "source_core_themes": themes_subset,
            "status": "pending",
            "answered_at": None,
        }
    ]

def mark_question_answered(question_id: int, conn: Optional[Any] = None) -> bool:
    """Mark a daily question as answered."""
    query = """
        UPDATE daily_questions 
        SET status = 'answered', answered_at = %s, updated_at = %s
        WHERE id = %s AND status = 'pending'
    """
    now_ts = utc_now()
    params = (now_ts, now_ts, question_id)

    if conn is not None:
        with conn.cursor() as cur:
            cur.execute(query, params)
            return cur.rowcount > 0

    with get_connection() as connection:
        with connection.cursor() as cur:
            cur.execute(query, params)
            updated = cur.rowcount > 0
        connection.commit()
    return updated


def expire_old_pending_questions(user_id: int, conn: Optional[Any] = None) -> None:
    """Mark pending questions from previous days as expired."""
    today = datetime.now(timezone.utc).date()
    query = """
        UPDATE daily_questions 
        SET status = 'expired', expired_at = %s, updated_at = %s
        WHERE user_id = %s 
        AND status = 'pending' 
        AND question_date < %s
    """
    now_ts = utc_now()
    params = (now_ts, now_ts, user_id, today)

    if conn is not None:
        with conn.cursor() as cur:
            cur.execute(query, params)
        return

    with get_connection() as connection:
        with connection.cursor() as cur:
            cur.execute(query, params)
        connection.commit()


def replace_today_pending_question(user_id: int, conn: Optional[Any] = None) -> None:
    """Mark today's pending question as expired and replace it with a new one."""
    today = datetime.now(timezone.utc).date()
    query = """
        UPDATE daily_questions 
        SET status = 'expired', expired_at = %s, updated_at = %s
        WHERE user_id = %s 
        AND status = 'pending' 
        AND question_date = %s
    """
    now_ts = utc_now()
    params = (now_ts, now_ts, user_id, today)

    if conn is not None:
        with conn.cursor() as cur:
            cur.execute(query, params)
        return

    with get_connection() as connection:
        with connection.cursor() as cur:
            cur.execute(query, params)
        connection.commit()


def cleanup_expired_questions(days_to_keep: int = 30, conn: Optional[Any] = None) -> int:
    """Clean up expired questions older than specified days. Returns count of cleaned questions."""
    cutoff_date = datetime.now(timezone.utc).date() - timedelta(days=days_to_keep)
    query = """
        DELETE FROM daily_questions 
        WHERE status = 'expired' 
        AND question_date < %s
    """

    if conn is not None:
        with conn.cursor() as cur:
            cur.execute(query, (cutoff_date,))
            return cur.rowcount

    with get_connection() as connection:
        with connection.cursor() as cur:
            cur.execute(query, (cutoff_date,))
            deleted_count = cur.rowcount
        connection.commit()

    return deleted_count


def get_thread_context_for_question(user_id: int, thread_id: str) -> List[Dict[str, Any]]:
    """Get all messages from a thread to provide context for answering."""
    from apps.api.services.thread_service import get_thread_messages
    return get_thread_messages(user_id, thread_id)

