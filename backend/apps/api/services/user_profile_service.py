import asyncio
import logging
from datetime import date
from typing import Any

from apps.db import get_connection, utc_now
from apps.api.services.prompt_pack_service import list_prompt_answers
from nextmate_agent.utils.llm import ainvoke_with_logging, get_chat_model

logger = logging.getLogger(__name__)

MIN_ANSWERS_TO_GENERATE = 0

# On the very first generation for a user (no cached profile yet), how
# far back to bootstrap from -- same as the old full-regeneration
# behavior. After that, only genuinely new answers get sent.
BOOTSTRAP_MAX_ANSWERS = 90


def _load_cached_profile_sync(user_id: int) -> dict[str, Any] | None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT summary_text, source_answer_count, generated_date, covers_through_date
                FROM user_profile_summary
                WHERE user_id = %s
                """,
                (user_id,),
            )
            row = cur.fetchone()
    if not row:
        return None
    return {
        "summary_text": row["summary_text"],
        "source_answer_count": row["source_answer_count"],
        "generated_date": row["generated_date"],
        "covers_through_date": row["covers_through_date"],
    }


def _save_profile_sync(
    user_id: int, summary_text: str, answer_count: int, today: date, covers_through_date: date
) -> None:
    now = utc_now()
    with get_connection(autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO user_profile_summary
                    (user_id, summary_text, source_answer_count, generated_date, covers_through_date, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (user_id) DO UPDATE SET
                    summary_text = EXCLUDED.summary_text,
                    source_answer_count = EXCLUDED.source_answer_count,
                    generated_date = EXCLUDED.generated_date,
                    covers_through_date = EXCLUDED.covers_through_date,
                    updated_at = EXCLUDED.updated_at
                """,
                (user_id, summary_text, answer_count, today, covers_through_date, now, now),
            )


def _fetch_answers_since_sync(user_id: int, since_date: date | None) -> list[dict[str, Any]]:
    """Chronological (oldest first), unlike list_prompt_answers -- for
    incremental updates we want new answers presented in the order they
    happened."""
    query = """
        SELECT id, prompt_id, prompt_text, category, answer_text, answered_date, created_at
        FROM prompt_pack_answers
        WHERE user_id = %s
    """
    params: list[Any] = [user_id]
    if since_date is not None:
        query += " AND answered_date > %s"
        params.append(since_date)
    query += " ORDER BY answered_date ASC"

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, tuple(params))
            rows = cur.fetchall()

    return [
        {
            "id": int(r["id"]),
            "prompt_id": r["prompt_id"],
            "prompt_text": r["prompt_text"],
            "category": r["category"],
            "answer_text": r["answer_text"],
            "answered_date": r["answered_date"],
            "created_at": r["created_at"],
        }
        for r in rows
    ]


def _format_answers(answers: list[dict[str, Any]]) -> str:
    lines = []
    for a in answers:
        lines.append(f"[{a['category']}] {a['prompt_text']}\nAnswer: {a['answer_text']}")
    return "\n\n".join(lines)


async def _bootstrap_summary_llm(answers: list[dict[str, Any]], user_id: int) -> str:
    """First-ever generation for this user -- no existing profile to build
    on, so this reasons from their full available history at once."""
    answers_text = _format_answers(answers)

    system_prompt = """You build a concise internal user-context profile from someone's journaling prompt answers.
This profile is used ONLY as background context for an AI companion to understand the person better -
it is never shown to the user directly.

Write 2-4 sentences covering: their core values, how they tend to cope with stress, their relationship
style, and any recurring patterns or themes across their answers. Be specific and grounded in what they
actually said - do not invent details. Write in (" You value...", "You tend to...").
Return ONLY the profile text, no headers, no markdown, no preamble."""

    user_prompt = f"Prompt-pack answers:\n\n{answers_text}\n\nWrite the profile now."

    llm = get_chat_model()
    content, _ = await ainvoke_with_logging(
        llm,
        [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "user_profile_generation_bootstrap",
        user_id,
    )
    return content.strip()


async def _update_summary_llm(
    existing_summary: str, new_answers: list[dict[str, Any]], user_id: int
) -> str:
    """Incremental update: existing profile + only the new answers since
    last time. Prompt is written so the existing profile is the default
    output -- the model should only touch it where the new answers
    genuinely add or contradict something, not rewrite it wholesale."""
    new_answers_text = _format_answers(new_answers)

    system_prompt = """You maintain a persistent internal user-context profile, built from someone's
journaling prompt answers over time. This profile is used ONLY as background context for an AI
companion to understand the person better - it is never shown to the user directly.

You will be given the EXISTING profile and one or more NEW answers that have come in since it was
last updated.

Rules for updating it:
- Treat the existing profile as already-established and correct. Preserve its established
  characterizations, wording, and substance by default.
- Only change something if the new answers add genuinely new, specific information (a new value,
  coping pattern, relationship style, or recurring theme not already captured), or directly
  contradict something currently stated.
- Do not rewrite, rephrase, or "polish" parts of the profile that the new answers have no bearing on.
- Do not remove existing facts just because they no longer feel like the most recent or most
  interesting thing about the person - long-standing traits stay unless contradicted.
- If the new answers don't meaningfully change anything, output the existing profile unchanged.
- The result must still read as ONE coherent 2-4 sentence profile, in third person
  ("You value...", "You tend to..."), not a list of edits or a diff.

Return ONLY the updated profile text, no headers, no markdown, no preamble, no explanation of what
changed."""

    user_prompt = (
        f"EXISTING profile:\n{existing_summary}\n\n"
        f"NEW answers since last update:\n{new_answers_text}\n\n"
        f"Return the updated profile now."
    )

    llm = get_chat_model()
    content, _ = await ainvoke_with_logging(
        llm,
        [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "user_profile_generation_incremental",
        user_id,
    )
    return content.strip()


async def get_or_refresh_user_profile(user_id: int) -> dict[str, Any] | None:
    """Returns the cached profile if already generated today. Otherwise:
    - first time ever -> bootstrap from full history
    - subsequent times -> incrementally update existing profile using
      only answers newer than what it already covers, preserving the
      established crux unless new answers genuinely change something."""
    today = date.today()

    cached = await asyncio.to_thread(_load_cached_profile_sync, user_id)
    if cached and cached["generated_date"] == today:
        return cached

    if cached is None:
        # Bootstrap: no profile yet, reason over full available history.
        all_answers = await asyncio.to_thread(list_prompt_answers, user_id, BOOTSTRAP_MAX_ANSWERS)
        if len(all_answers) < MIN_ANSWERS_TO_GENERATE:
            return None

        chronological = list(reversed(all_answers))  # list_prompt_answers is DESC; want ASC here
        try:
            summary_text = await _bootstrap_summary_llm(chronological, user_id)
        except Exception:
            logger.exception("Failed to bootstrap user profile for user_id=%s", user_id)
            return None

        covers_through_str = max(a["answered_date"] for a in chronological) if chronological else today.isoformat()
        covers_through = date.fromisoformat(covers_through_str)
        await asyncio.to_thread(
            _save_profile_sync, user_id, summary_text, len(all_answers), today, covers_through
        )
        return {
            "summary_text": summary_text,
            "source_answer_count": len(all_answers),
            "generated_date": today,
            "covers_through_date": covers_through,
        }

    # Incremental: only pull answers newer than what's already covered.
    new_answers = await asyncio.to_thread(
        _fetch_answers_since_sync, user_id, cached["covers_through_date"]
    )
    if not new_answers:
        # Nothing new to incorporate -- just refresh generated_date so we
        # don't re-check the DB again today, without an LLM call.
        await asyncio.to_thread(
            _save_profile_sync,
            user_id,
            cached["summary_text"],
            cached["source_answer_count"],
            today,
            cached["covers_through_date"],
        )
        return cached

    try:
        summary_text = await _update_summary_llm(cached["summary_text"], new_answers, user_id)
    except Exception:
        logger.exception("Failed to incrementally update user profile for user_id=%s", user_id)
        return cached

    covers_through_date = max(a["answered_date"] for a in new_answers)
    new_count = cached["source_answer_count"] + len(new_answers)
    await asyncio.to_thread(
        _save_profile_sync, user_id, summary_text, new_count, today, covers_through_date
    )

    return {
        "summary_text": summary_text,
        "source_answer_count": new_count,
        "generated_date": today,
        "covers_through_date": covers_through_date,
    }


async def get_user_profile_text(user_id: int) -> str:
    """Convenience helper for callers that just want the text (or empty
    string), e.g. to splice into a prompt without extra None-checking."""
    profile = await get_or_refresh_user_profile(user_id)
    return profile["summary_text"] if profile else ""