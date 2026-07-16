"""Cross-thread memory: gives a NEW thread ambient awareness of a user's OTHER
threads. Two tiers:

1. Active thread summaries (from thread_summaries, status='active') — recent
   threads, kept at full per-thread summary resolution, newest first.
2. memory_digest — one continuously re-compressed row per user. Once the
   active-summary tier exceeds its token budget, the oldest active summaries
   get folded into the digest via the fast model and marked status='merged'.

This is what actually answers "can a new thread reference a topic from a
different chat" — thread_summary_service.py (per-thread compaction) does not
do this on its own; it only keeps a single thread's own history bounded.
"""
from typing import Any

from apps.db import get_connection
from nextmate_agent.utils.config import get_settings
from nextmate_agent.utils.llm import get_fast_chat_model, invoke_with_logging
from nextmate_agent.utils.tokens import estimate_tokens
from nextmate_agent.utils.prompts import (
    build_digest_merge_system_prompt,
    build_digest_merge_prompt,
)


def get_active_thread_summaries(
    user_id: int, exclude_thread_id: str | None = None
) -> list[dict[str, Any]]:
    """Active (non-merged) thread summaries for this user, newest first.
    Excludes the current thread by default — its own history is already
    surfaced via thread_summary/chat_history, no need to duplicate it here."""
    query = """
        SELECT thread_id, summary_text, token_estimate, turns_summarized, updated_at
        FROM thread_summaries
        WHERE user_id = %s AND status = 'active'
    """
    params: list[Any] = [user_id]
    if exclude_thread_id:
        query += " AND thread_id != %s"
        params.append(exclude_thread_id)
    query += " ORDER BY updated_at DESC"

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, tuple(params))
            rows = cur.fetchall()

    return [
        {
            "thread_id": str(r["thread_id"]),
            "summary_text": str(r["summary_text"]),
            "token_estimate": int(r["token_estimate"]),
            "turns_summarized": int(r["turns_summarized"]),
            "updated_at": r["updated_at"].isoformat()
            if hasattr(r["updated_at"], "isoformat")
            else str(r["updated_at"]),
        }
        for r in rows
    ]


def get_memory_digest(user_id: int) -> dict[str, Any] | None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT user_id, digest_text, token_estimate, thread_count, updated_at
                FROM memory_digest
                WHERE user_id = %s
                """,
                (user_id,),
            )
            row = cur.fetchone()

    if not row:
        return None

    return {
        "digest_text": str(row["digest_text"]),
        "token_estimate": int(row["token_estimate"]),
        "thread_count": int(row["thread_count"]),
        "updated_at": row["updated_at"].isoformat()
        if hasattr(row["updated_at"], "isoformat")
        else str(row["updated_at"]),
    }


def _save_memory_digest(user_id: int, digest_text: str, new_threads_folded: int) -> None:
    token_estimate = estimate_tokens(digest_text)
    with get_connection(autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO memory_digest (user_id, digest_text, token_estimate, thread_count, updated_at)
                VALUES (%s, %s, %s, %s, now())
                ON CONFLICT (user_id) DO UPDATE
                SET digest_text = EXCLUDED.digest_text,
                    token_estimate = EXCLUDED.token_estimate,
                    thread_count = memory_digest.thread_count + EXCLUDED.thread_count,
                    updated_at = now()
                """,
                (user_id, digest_text, token_estimate, new_threads_folded),
            )


def _mark_threads_merged(thread_ids: list[str]) -> None:
    if not thread_ids:
        return
    with get_connection(autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE thread_summaries SET status = 'merged' WHERE thread_id = ANY(%s)",
                (thread_ids,),
            )


def ensure_digest_exists(user_id: int) -> None:
    """Make sure a memory digest row exists for the user.
    For brand‑new users we insert an empty digest so later code can rely
    on its presence without special‑casing.
    """
    if get_memory_digest(user_id) is None:
        _save_memory_digest(user_id, "", 0)

def fold_into_digest(
    user_id: int, overflow_summaries: list[dict[str, Any]], prior_digest: dict[str, Any] | None
) -> dict[str, Any]:
    """Merge overflow thread summaries into the digest via the fast model,
    persist, mark the folded threads as merged. Returns the new digest dict.
    Safe no-op (returns prior digest unchanged) if the LLM call fails."""
    settings = get_settings()
    prior_text = prior_digest["digest_text"] if prior_digest else ""

    llm = get_fast_chat_model()
    system_prompt = build_digest_merge_system_prompt(settings.digest_token_target)
    prompt = build_digest_merge_prompt(prior_digest=prior_text, overflow_summaries=overflow_summaries)

    raw, usage = invoke_with_logging(
        llm,
        [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ],
        "fold_into_digest",
        f"user:{user_id}",
    )

    new_digest_text = (raw or "").strip()
    if not new_digest_text:
        # Fast model failed to produce anything usable — bail safely, leave
        # the overflow threads active so they're retried next time budget fills.
        return prior_digest or {"digest_text": "", "token_estimate": 0, "thread_count": 0, "updated_at": ""}

    _save_memory_digest(user_id, new_digest_text, new_threads_folded=len(overflow_summaries))
    _mark_threads_merged([s["thread_id"] for s in overflow_summaries])

    return {
        "digest_text": new_digest_text,
        "token_estimate": estimate_tokens(new_digest_text),
        "thread_count": (prior_digest["thread_count"] if prior_digest else 0) + len(overflow_summaries),
        "updated_at": "just now",
    }


def build_cross_thread_context(
    user_id: int, exclude_thread_id: str | None = None
) -> dict[str, Any]:
    """Main entry point. Fetches active thread summaries + digest, folds
    overflow into the digest if the active tier exceeds its token budget,
    and returns what should be injected into memory_context:
    {"active_thread_summaries": [...kept, newest first...], "memory_digest": {...} | None}
    """
    settings = get_settings()
    budget = settings.cross_thread_context_token_budget

    active_summaries = get_active_thread_summaries(user_id, exclude_thread_id=exclude_thread_id)

    # Ensure a digest row exists for brand‑new users
    ensure_digest_exists(user_id)
    digest = get_memory_digest(user_id)

    digest_tokens = digest["token_estimate"] if digest else 0
    running_total = digest_tokens
    keep: list[dict[str, Any]] = []
    overflow: list[dict[str, Any]] = []

    # Determine threads newer than the current digest
    new_threads: list[dict[str, Any]] = []
    for row in active_summaries:
        if digest is None or row["updated_at"] > digest["updated_at"]:
            new_threads.append(row)

    if len(new_threads) >= 2:
        # Force folding of these new/updated threads
        overflow = new_threads
        keep = [r for r in active_summaries if r not in overflow]
    else:
        # Token‑budget selection as before
        for row in active_summaries:  # newest first
            if running_total + row["token_estimate"] <= budget:
                keep.append(row)
                running_total += row["token_estimate"]
            else:
                overflow.append(row)

    if overflow:
        digest = fold_into_digest(user_id, overflow, digest)

    return {"active_thread_summaries": keep, "memory_digest": digest}