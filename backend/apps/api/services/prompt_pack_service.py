from datetime import date
from typing import Any

from apps.db import get_connection, utc_now


# Stable `id` per prompt so answers stay correctly attributed even if the
# list is reordered or edited later. Add new prompts freely -- rotation
# just cycles through whatever's currently in the pack.
PROMPT_PACK: list[dict[str, str]] = [
    {"id": "values_uncompromising", "category": "values",
     "text": "What's one value you'd never compromise on, even under pressure?"},
    {"id": "coping_first_instinct", "category": "coping",
     "text": "When things get overwhelming, what's your first instinct — push through, pull back, or shut down?"},
    {"id": "relationships_recharge", "category": "relationships",
     "text": "Do you recharge more by being around people, or by being alone?"},
    {"id": "growth_hardest_lesson", "category": "growth",
     "text": "What's a lesson you learned the hard way that you're grateful for now?"},
    {"id": "values_proudest", "category": "values",
     "text": "What's something you did recently that you're quietly proud of?"},
    {"id": "coping_ask_for_help", "category": "coping",
     "text": "How easy is it for you to ask for help when you need it?"},
    {"id": "relationships_trust", "category": "relationships",
     "text": "What makes you trust someone — is it consistency, honesty, or something else?"},
    {"id": "growth_avoiding", "category": "growth",
     "text": "Is there something you've been avoiding lately? What's stopping you?"},
    {"id": "values_definition_success", "category": "values",
     "text": "How do you personally define success, separate from what others expect?"},
    {"id": "coping_criticism", "category": "coping",
     "text": "How do you usually react when someone criticizes you?"},
    {"id": "relationships_conflict", "category": "relationships",
     "text": "Do you tend to confront conflict directly, or let it settle on its own?"},
    {"id": "growth_who_you_were", "category": "growth",
     "text": "What's one way you're different from who you were a year ago?"},
    {"id": "values_non_negotiable_time", "category": "values",
     "text": "What's something you always make time for, no matter how busy you are?"},
    {"id": "coping_stress_signal", "category": "coping",
     "text": "What's usually the first sign that you're getting stressed, before you even notice it consciously?"},
    {"id": "relationships_boundaries", "category": "relationships",
     "text": "How comfortable are you setting boundaries with people close to you?"},
]


def get_prompt_for_date(d: date) -> dict[str, str]:
    """Deterministic day -> prompt mapping. Same prompt for everyone on a
    given calendar day, cycles through the whole pack, wraps around."""
    idx = d.toordinal() % len(PROMPT_PACK)
    return PROMPT_PACK[idx]


def get_todays_prompt(user_id: int) -> dict[str, Any]:
    today = date.today()
    p = get_prompt_for_date(today)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT prompt_id, answer_text
                FROM prompt_pack_answers
                WHERE user_id = %s AND answered_date = %s
                """,
                (user_id, today),
            )
            row = cur.fetchone()

    return {
        "prompt_id": p["id"],
        "prompt_text": p["text"],
        "category": p["category"],
        "answered": row is not None,
        "answer_text": row["answer_text"] if row else None,
    }


async def save_prompt_answer(user_id: int, prompt_id: str, answer_text: str) -> dict[str, Any]:
    today = date.today()
    p = get_prompt_for_date(today)

    if p["id"] != prompt_id:
        # Guards against a stale client submitting yesterday's prompt_id
        # after midnight, or a tampered request.
        raise ValueError("This isn't today's prompt anymore")

    cleaned = answer_text.strip()
    if not cleaned:
        raise ValueError("Answer can't be empty")
    if len(cleaned) > 5000:
        raise ValueError("Answer is too long")

    now = utc_now()
    # Insert or update the answer in the DB
    with get_connection(autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO prompt_pack_answers
                    (user_id, prompt_id, prompt_text, category, answer_text, answered_date, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (user_id, answered_date) DO UPDATE SET
                    prompt_id = EXCLUDED.prompt_id,
                    prompt_text = EXCLUDED.prompt_text,
                    category = EXCLUDED.category,
                    answer_text = EXCLUDED.answer_text,
                    created_at = EXCLUDED.created_at
                RETURNING id, created_at
                """,
                (user_id, prompt_id, p["text"], p["category"], cleaned, today, now),
            )
            row = cur.fetchone()

    # Trigger profile summary generation in background
    import asyncio
    from apps.api.services.user_profile_service import get_or_refresh_user_profile
    asyncio.create_task(get_or_refresh_user_profile(user_id))

    return {
        "id": int(row["id"]),
        "prompt_id": prompt_id,
        "prompt_text": p["text"],
        "answer_text": cleaned,
        "created_at": row["created_at"].isoformat(),
    }

def list_prompt_answers(user_id: int, limit: int = 90) -> list[dict[str, Any]]:
    """Recent answers, most recent first -- for a future 'your answers over
    time' view, and eventually the profile-compression step."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, prompt_id, prompt_text, category, answer_text, answered_date, created_at
                FROM prompt_pack_answers
                WHERE user_id = %s
                ORDER BY answered_date DESC
                LIMIT %s
                """,
                (user_id, limit),
            )
            rows = cur.fetchall()

    return [
        {
            "id": int(r["id"]),
            "prompt_id": r["prompt_id"],
            "prompt_text": r["prompt_text"],
            "category": r["category"],
            "answer_text": r["answer_text"],
            "answered_date": r["answered_date"].isoformat(),
            "created_at": r["created_at"].isoformat(),
        }
        for r in rows
    ]