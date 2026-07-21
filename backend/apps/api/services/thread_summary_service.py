"""Thread-level compaction, via two independent mechanisms:

1. TOKEN-THRESHOLD (compact_thread / should_compact) -- mid-conversation,
   fires while a thread is ACTIVELY being chatted in, once its chat_history
   estimate crosses THREAD_SUMMARY_TRIGGER_TOKENS. Purpose: bound
   generate_reply/choose_response_mode prompt size for very long single
   sessions. Trims the live chat_history via the __replace__ state marker.

2. IDLE-SWEEP (summarize_stale_threads) -- runs opportunistically on every
   turn, for OTHER threads belonging to the same user (never the current
   one). Once a thread has gone quiet for IDLE window and has messages not
   yet folded into its summary, this summarizes just the delta and merges it
   into that thread's persisted summary. This is what actually populates
   thread_summaries for SHORT threads that never trip the token threshold --
   without it, cross-thread recall silently never has anything to surface.

   Reads directly from thread_messages (DB), never touches LangGraph state
   for the thread being summarized -- the current thread's live chat_history
   is completely unaffected by this running.
"""
import re
from datetime import datetime, timezone
from typing import Any

from apps.db import get_connection
from nextmate_agent.utils.config import get_settings
from nextmate_agent.utils.llm import get_fast_chat_model, invoke_with_logging
from nextmate_agent.utils.tokens import estimate_chat_history_tokens, estimate_tokens
from nextmate_agent.utils.prompts import (
    THREAD_SUMMARY_SYSTEM_PROMPT,
    build_thread_summary_prompt,
)


_NO_CONTENT_PATTERN = re.compile(
    r"no (conversation|messages|content)|nothing (to|worth) summariz|there (is|was)n?'?t? (any|no) (conversation|content)",
    re.IGNORECASE,
)

# Below this many total characters of combined new message content, skip
# calling the LLM entirely rather than spend a call finding out there's
# nothing substantive -- cheap pre-filter for trivial test/filler exchanges.
_MIN_SUBSTANTIVE_CHARS = 40


def get_thread_summary(user_id: int, thread_id: str) -> dict[str, Any] | None:
    if not thread_id:
        return None
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT thread_id, summary_text, token_estimate, turns_summarized, updated_at
                FROM thread_summaries
                WHERE user_id = %s AND thread_id = %s
                """,
                (user_id, thread_id),
            )
            row = cur.fetchone()

    if not row:
        return None

    return {
        "thread_id": str(row["thread_id"]),
        "summary_text": str(row["summary_text"]),
        "token_estimate": int(row["token_estimate"]),
        "turns_summarized": int(row["turns_summarized"]),
        "updated_at": row["updated_at"].isoformat()
        if hasattr(row["updated_at"], "isoformat")
        else str(row["updated_at"]),
    }


def save_thread_summary(
    user_id: int, thread_id: str, summary_text: str, new_turns_folded: int
) -> None:
    token_estimate = estimate_tokens(summary_text)
    with get_connection(autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO thread_summaries (thread_id, user_id, summary_text, token_estimate, turns_summarized, status, updated_at)
                VALUES (%s, %s, %s, %s, %s, 'active', now())
                ON CONFLICT (thread_id) DO UPDATE
                SET summary_text = EXCLUDED.summary_text,
                    token_estimate = EXCLUDED.token_estimate,
                    turns_summarized = thread_summaries.turns_summarized + EXCLUDED.turns_summarized,
                    status = 'active',
                    updated_at = now()
                """,
                (thread_id, user_id, summary_text, token_estimate, new_turns_folded),
            )


def should_compact(chat_history: list[dict], trigger_tokens: int | None = None) -> bool:
    if not chat_history:
        return False
    if trigger_tokens is None:
        trigger_tokens = get_settings().thread_summary_trigger_tokens
    return estimate_chat_history_tokens(chat_history) > trigger_tokens


def compact_thread(
    user_id: int,
    thread_id: str,
    chat_history: list[dict],
    prior_summary: str,
    keep_last_turns: int | None = None,
) -> tuple[str, list[dict]]:
    """MID-CONVERSATION compaction. Summarizes everything in chat_history
    except the last `keep_last_turns` turns, merges into prior_summary,
    persists, and returns (new_summary_text, trimmed_chat_history). Only
    called for the CURRENTLY ACTIVE thread, from manage_thread_summary_node.
    """
    settings = get_settings()
    if keep_last_turns is None:
        keep_last_turns = settings.thread_summary_keep_last_turns

    keep_last_messages = keep_last_turns * 2  # 1 turn = user + assistant message
    if len(chat_history) <= keep_last_messages:
        return prior_summary, chat_history

    to_summarize = chat_history[:-keep_last_messages]
    remaining = chat_history[-keep_last_messages:]

    llm = get_fast_chat_model()
    prompt = build_thread_summary_prompt(prior_summary=prior_summary, messages=to_summarize)
    raw, usage = invoke_with_logging(
        llm,
        [
            {"role": "system", "content": THREAD_SUMMARY_SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        "compact_thread_summary",
        thread_id,
    )

    new_summary = (raw or "").strip()
    if not new_summary or _NO_CONTENT_PATTERN.search(new_summary):
        return prior_summary, chat_history

    save_thread_summary(
        user_id, thread_id, new_summary, new_turns_folded=len(to_summarize) // 2
    )
    return new_summary, remaining


# thread_messages.thread_id has historically sometimes been written in the
# composite checkpoint format ("user:1:thread:<uuid>") instead of the raw
# UUID -- normalize it inline so a malformed row can't crash the whole query,
# and so composite/clean rows for the same underlying thread get merged
# under one identity instead of being treated as two different threads.
_NORMALIZE_THREAD_ID_SQL = """
    CASE
        WHEN tm.thread_id ~ '^user:[0-9]+:thread:[0-9a-fA-F-]{36}$'
            THEN split_part(tm.thread_id, ':', 4)
        ELSE tm.thread_id
    END
"""
_VALID_UUID_REGEX = r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'


def find_stale_threads(
    user_id: int,
    exclude_thread_id: str | None,
    idle_minutes: int,
    max_threads: int,
) -> list[dict[str, Any]]:
    """Find OTHER threads for this user that have gone quiet (no message in
    idle_minutes) and have messages not yet reflected in their thread_summary
    (either no summary exists, or new messages arrived after the last one).

    Tolerant of malformed thread_id values in thread_messages (composite
    checkpoint strings that leaked in instead of raw UUIDs) -- rows that
    don't normalize to a valid UUID are silently excluded rather than
    crashing the query. See the UPDATE cleanup for fixing this at the source.
    """
    query = f"""
        WITH normalized AS (
            SELECT {_NORMALIZE_THREAD_ID_SQL} AS thread_id, tm.created_at
            FROM thread_messages tm
            WHERE tm.user_id = %s
        )
        SELECT n.thread_id,
               MAX(n.created_at) AS last_message_at,
               ts.updated_at AS summary_updated_at
        FROM normalized n
        LEFT JOIN thread_summaries ts ON ts.thread_id = n.thread_id::uuid
        WHERE n.thread_id ~ %s
    """
    params: list[Any] = [user_id, _VALID_UUID_REGEX]
    if exclude_thread_id:
        query += " AND n.thread_id != %s"
        params.append(exclude_thread_id)
    query += """
        GROUP BY n.thread_id, ts.updated_at
        HAVING MAX(n.created_at) < now() - (%s || ' minutes')::interval
           AND (ts.updated_at IS NULL OR MAX(n.created_at) > ts.updated_at)
        ORDER BY MAX(n.created_at) ASC
        LIMIT %s
    """
    params.extend([str(idle_minutes), max_threads])

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, tuple(params))
            rows = cur.fetchall()

    return [
        {
            "thread_id": str(r["thread_id"]),
            "last_message_at": r["last_message_at"],
            "summary_updated_at": r["summary_updated_at"],
        }
        for r in rows
    ]


def _fetch_unsummarized_messages(
    user_id: int, thread_id: str, since: datetime | None
) -> list[dict[str, str]]:
    # Matches both the clean UUID and, defensively, the composite checkpoint
    # format ("user:<id>:thread:<uuid>") in case some rows for this thread
    # were written that way before the cleanup migration/UPDATE ran.
    composite_id = f"user:{user_id}:thread:{thread_id}"
    if since is not None:
        query = """
            SELECT role, content
            FROM thread_messages
            WHERE user_id = %s AND thread_id IN (%s, %s) AND created_at > %s
            ORDER BY created_at ASC
        """
        params = (user_id, thread_id, composite_id, since)
    else:
        query = """
            SELECT role, content
            FROM thread_messages
            WHERE user_id = %s AND thread_id IN (%s, %s)
            ORDER BY created_at ASC
        """
        params = (user_id, thread_id, composite_id)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)
            rows = cur.fetchall()

    return [{"role": str(r["role"]), "content": str(r["content"])} for r in rows]


def summarize_stale_threads(
    user_id: int,
    exclude_thread_id: str | None,
    idle_minutes: int | None = None,
    max_threads: int | None = None,
) -> int:
    """Opportunistic idle-sweep. Call on every turn for the CURRENTLY active
    thread -- it summarizes OTHER threads that have gone idle, never the
    current one. Safe to call every turn: find_stale_threads' HAVING clause
    means threads already fully summarized simply won't match, so this is a
    cheap no-op query on most calls. Capped per call (max_threads) so a user
    with many idle threads doesn't trigger a burst of LLM calls on one turn --
    remaining stale threads just get picked up on a later call.

    Returns the number of threads actually summarized this call.
    """
    settings = get_settings()
    if idle_minutes is None:
        idle_minutes = settings.idle_thread_summary_minutes
    if max_threads is None:
        max_threads = settings.max_stale_threads_per_turn

    stale = find_stale_threads(user_id, exclude_thread_id, idle_minutes, max_threads)
    if not stale:
        return 0

    summarized_count = 0
    for entry in stale:
        thread_id = entry["thread_id"]
        since = entry["summary_updated_at"]  # None if no prior summary

        new_messages = _fetch_unsummarized_messages(user_id, thread_id, since)
        if not new_messages:
            continue

        # Cheap pre-filter: skip trivially short/filler content without
        # spending an LLM call. Doesn't mark anything as summarized, so a
        # thread that later accumulates more content will be re-evaluated
        # (combined with new messages) on the next sweep.
        combined_chars = sum(len(m.get("content", "")) for m in new_messages)
        if combined_chars < _MIN_SUBSTANTIVE_CHARS:
            continue

        existing = get_thread_summary(user_id, thread_id)
        prior_summary_text = existing["summary_text"] if existing else ""

        llm = get_fast_chat_model()
        prompt = build_thread_summary_prompt(prior_summary=prior_summary_text, messages=new_messages)
        raw, usage = invoke_with_logging(
            llm,
            [
                {"role": "system", "content": THREAD_SUMMARY_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            "idle_thread_summary",
            thread_id,
        )

        new_summary = (raw or "").strip()

        # Reject empty responses AND valid-but-useless boilerplate ("there's
        # no conversation to summarize") -- neither should be persisted as if
        # it were a real summary. Thread stays eligible for a later sweep.
        if not new_summary or _NO_CONTENT_PATTERN.search(new_summary):
            continue

        save_thread_summary(
            user_id, thread_id, new_summary, new_turns_folded=len(new_messages) // 2
        )
        summarized_count += 1

    return summarized_count