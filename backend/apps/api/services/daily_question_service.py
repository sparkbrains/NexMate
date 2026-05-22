import json
import random
from datetime import datetime, timedelta, timezone
from typing import Any, List, Dict
from apps.db import get_connection, utc_now
from nextmate_agent.utils.llm import invoke_with_logging, get_chat_model


def get_previous_day_entries(user_id: int) -> List[Dict[str, Any]]:
    """Get journal entries from the most recent previous day with entries."""
    today = datetime.now(timezone.utc).date()
    start_of_today = datetime.combine(today, datetime.min.time()).replace(tzinfo=timezone.utc)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT MAX(created_at::date) AS entry_date
                FROM journal_entries_v2
                WHERE user_id = %s AND created_at < %s
                """,
                (user_id, start_of_today),
            )
            row = cur.fetchone()
            if not row or not row.get("entry_date"):
                return []

            previous_day = row["entry_date"]
            start_of_previous_day = datetime.combine(previous_day, datetime.min.time()).replace(tzinfo=timezone.utc)
            end_of_previous_day = datetime.combine(previous_day, datetime.max.time()).replace(tzinfo=timezone.utc)

            cur.execute(
                """
                SELECT thread_id, core_theme, user_input, assistant_reply, created_at
                FROM journal_entries_v2
                WHERE user_id = %s AND created_at BETWEEN %s AND %s
                ORDER BY created_at DESC
                """,
                (user_id, start_of_previous_day, end_of_previous_day),
            )
            return cur.fetchall()


def extract_core_themes(entries: List[Dict[str, Any]]) -> List[str]:
    """Extract unique core themes from entries."""
    themes = set()
    for entry in entries:
        theme = entry.get("core_theme", "").strip()
        if theme:
            themes.add(theme)
    return list(themes)


async def generate_question_from_themes_llm(themes: List[str], user_id: int = 0) -> str:
    """Generate a contextual daily question using LLM based on core themes."""
    if not themes:
        return "How are you feeling today?"

    selected_themes = random.sample(themes, min(3, len(themes)))

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
        content, usage = invoke_with_logging(llm, messages, "daily_question_generation", user_id)
        return content.strip()
    except Exception:
        return "Come back later for today's reflection question."


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


async def get_or_create_daily_question(user_id: int) -> List[Dict[str, Any]]:
    """Get existing daily questions or create new ones. Always returns a list."""
    today = datetime.now(timezone.utc).date()

    # First, expire old pending questions from previous days
    expire_old_pending_questions(user_id)

    # Check if questions already exist for today — fetch ALL of them
    with get_connection() as conn:
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

            # If there are pending questions for today, replace them with new ones
            if existing and any(row["status"] == "pending" for row in existing):
                replace_today_pending_question(user_id)
                existing = []  # Reset to create new questions
            elif existing:
                return [
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
                ]

    # Create new questions from previous day's entries
    entries = get_previous_day_entries(user_id)
    if not entries:
        return []

    themes = extract_core_themes(entries)
    if not themes:
        return []

    # Generate 1 question
    questions_data = []
    themes_subset = random.sample(themes, min(2, len(themes)))
    question_text = await generate_question_from_themes_llm(themes_subset, user_id)
    source_entry = random.choice(entries)
    questions_data.append({
        "question_text": question_text,
        "source_thread_id": source_entry["thread_id"],
        "source_core_themes": themes_subset,
    })

    # Insert each question and collect its ID individually
    inserted = []
    with get_connection() as conn:
        with conn.cursor() as cur:
            for i, q in enumerate(questions_data, 1):
                cur.execute(
                    """
                    INSERT INTO daily_questions
                    (user_id, question_date, question_text, source_thread_id, source_core_themes,
                     status, question_order, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                    """,
                    (
                        user_id, today, q["question_text"], q["source_thread_id"],
                        json.dumps(q["source_core_themes"]), "pending", i, utc_now(), utc_now(),
                    ),
                )
                row = cur.fetchone()
                inserted.append({
                    "id": row["id"],
                    "question_text": q["question_text"],
                    "source_thread_id": q["source_thread_id"],
                    "source_core_themes": q["source_core_themes"],
                    "status": "pending",
                    "answered_at": None,
                })
        conn.commit()

    return inserted


def mark_question_answered(question_id: int) -> bool:
    """Mark a daily question as answered."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE daily_questions 
                SET status = 'answered', answered_at = %s, updated_at = %s
                WHERE id = %s AND status = 'pending'
                """,
                (utc_now(), utc_now(), question_id),
            )
            updated = cur.rowcount > 0
        conn.commit()
    return updated


def expire_old_pending_questions(user_id: int) -> None:
    """Mark pending questions from previous days as expired."""
    today = datetime.now(timezone.utc).date()
    
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE daily_questions 
                SET status = 'expired', expired_at = %s, updated_at = %s
                WHERE user_id = %s 
                AND status = 'pending' 
                AND question_date < %s
                """,
                (utc_now(), utc_now(), user_id, today),
            )
        conn.commit()


def replace_today_pending_question(user_id: int) -> None:
    """Mark today's pending question as expired and replace it with a new one."""
    today = datetime.now(timezone.utc).date()
    
    with get_connection() as conn:
        with conn.cursor() as cur:
            # Mark today's pending question as expired
            cur.execute(
                """
                UPDATE daily_questions 
                SET status = 'expired', expired_at = %s, updated_at = %s
                WHERE user_id = %s 
                AND status = 'pending' 
                AND question_date = %s
                """,
                (utc_now(), utc_now(), user_id, today),
            )
        conn.commit()


def cleanup_expired_questions(days_to_keep: int = 30) -> int:
    """Clean up expired questions older than specified days. Returns count of cleaned questions."""
    cutoff_date = datetime.now(timezone.utc).date() - timedelta(days=days_to_keep)
    
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                DELETE FROM daily_questions 
                WHERE status = 'expired' 
                AND question_date < %s
                """,
                (cutoff_date,),
            )
            deleted_count = cur.rowcount
        conn.commit()
    
    return deleted_count


def get_thread_context_for_question(user_id: int, thread_id: str) -> List[Dict[str, Any]]:
    """Get all messages from a thread to provide context for answering."""
    from apps.api.services.thread_service import get_thread_messages
    return get_thread_messages(user_id, thread_id )
