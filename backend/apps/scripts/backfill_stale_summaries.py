"""One-off backfill for thread summaries left stale by the background-task
GC bug in chat_service.py (fire-and-forget asyncio.create_task() calls with
no held reference could be garbage collected before running, so
_sweep_stale_threads_background silently failed to run for an unknown
period of time).

This does NOT touch summarize_stale_threads/find_stale_threads at all --
those only sweep OTHER users' threads relative to some "current" thread
and require an idle-minutes threshold. Instead this walks every thread for
every user directly and calls generate_summary_now(), the exact same
synchronous, always-completes path the manual "call the API" workaround
already uses -- so this script produces identical results to you manually
hitting GET /api/threads/{id}/summary for every stale thread, just without
doing it by hand one at a time.

Safe to re-run: generate_summary_now() is a no-op (fast DB-only check, no
LLM call) for any thread that's already fully caught up.

Usage:
    python -m apps.api.scripts.backfill_stale_summaries
    python -m apps.api.scripts.backfill_stale_summaries --dry-run
    python -m apps.api.scripts.backfill_stale_summaries --user-id 42
"""
import argparse
import logging
import sys
import time

from apps.db import get_connection
from apps.api.services.thread_summary_service import generate_summary_now

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger("backfill_stale_summaries")

# Same normalization as thread_summary_service.find_stale_threads -- some
# rows in thread_messages historically got written with the composite
# checkpoint format ("user:<id>:thread:<uuid>") instead of a raw UUID.
_NORMALIZE_THREAD_ID_SQL = """
    CASE
        WHEN tm.thread_id ~ '^user:[0-9]+:thread:[0-9a-fA-F-]{36}$'
            THEN split_part(tm.thread_id, ':', 4)
        ELSE tm.thread_id
    END
"""
_VALID_UUID_REGEX = r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'


def _all_user_threads(user_id: int | None) -> list[tuple[int, str]]:
    """Every (user_id, thread_id) pair that has at least one message,
    across ALL users unless a specific user_id is given. Deliberately not
    filtered by idle_minutes or "has new messages since summary" here --
    generate_summary_now() already does that check per-thread and no-ops
    cheaply, so it's simpler and safer to just hand it every thread once
    than to duplicate that filtering logic in two places."""
    query = f"""
        SELECT DISTINCT tm.user_id, {_NORMALIZE_THREAD_ID_SQL} AS thread_id
        FROM thread_messages tm
        WHERE {_NORMALIZE_THREAD_ID_SQL} ~ %s
    """
    params: list = [_VALID_UUID_REGEX]
    if user_id is not None:
        query += " AND tm.user_id = %s"
        params.append(user_id)
    query += " ORDER BY tm.user_id"

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, tuple(params))
            rows = cur.fetchall()

    return [(int(r["user_id"]), str(r["thread_id"])) for r in rows]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="List threads that would be processed without calling the LLM or writing anything.",
    )
    parser.add_argument(
        "--user-id",
        type=int,
        default=None,
        help="Only backfill threads for this user_id. Default: all users.",
    )
    parser.add_argument(
        "--sleep-seconds",
        type=float,
        default=0.0,
        help="Optional delay between threads, to stay under LLM provider rate limits on large backfills.",
    )
    args = parser.parse_args()

    pairs = _all_user_threads(args.user_id)
    logger.info("Found %d thread(s) to check.", len(pairs))

    if args.dry_run:
        for user_id, thread_id in pairs:
            logger.info("[dry-run] would check user_id=%s thread_id=%s", user_id, thread_id)
        return 0

    checked = 0
    updated = 0
    failed = 0

    for user_id, thread_id in pairs:
        checked += 1
        try:
            before = None
            result = generate_summary_now(user_id, thread_id)
            if result is not None:
                updated += 1
            logger.info(
                "[%d/%d] user_id=%s thread_id=%s -> %s",
                checked,
                len(pairs),
                user_id,
                thread_id,
                "ok" if result is not None else "no messages / nothing to summarize",
            )
        except Exception:
            failed += 1
            logger.exception(
                "[%d/%d] FAILED user_id=%s thread_id=%s",
                checked,
                len(pairs),
                user_id,
                thread_id,
            )
        if args.sleep_seconds:
            time.sleep(args.sleep_seconds)

    logger.info(
        "Done. checked=%d updated_or_confirmed=%d failed=%d",
        checked,
        updated,
        failed,
    )
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())