from dataclasses import dataclass
from typing import Any, Callable

from apps.db import get_connection, utc_now
from apps.api.services.loop_service import list_loops
from apps.api.services.journal_log_service import compute_streak, list_journal_entries


@dataclass(frozen=True)
class Badge:
    key: str
    title: str
    description: str
    icon: str
    points: int
    check: Callable[[dict[str, Any]], bool]


def _loops_resolved(stats: dict[str, Any]) -> int:
    return stats["loops"]["resolved"]


def _loops_detected(stats: dict[str, Any]) -> int:
    return stats["loops"]["total"]


def _journal_entries(stats: dict[str, Any]) -> int:
    return stats["entry_count"]


def _longest_streak(stats: dict[str, Any]) -> int:
    return stats["streak"]["longest"]


# Ordered roughly by how early a user is likely to earn them. Streak
# thresholds use `longest` (not `current`) so a badge stays unlocked even
# after a streak later breaks -- badges are permanent milestones, not live
# status indicators.
BADGE_CATALOG: list[Badge] = [
    Badge(
        key="first_loop_detected",
        title="Self-Aware",
        description="Nextmate spotted your first pattern.",
        icon="loops",
        points=5,
        check=lambda s: _loops_detected(s) >= 1,
    ),
    Badge(
        key="first_journal_entry",
        title="First Page",
        description="Wrote your first journal entry.",
        icon="book",
        points=5,
        check=lambda s: _journal_entries(s) >= 1,
    ),
    Badge(
        key="first_loop_resolved",
        title="Loop Breaker",
        description="Resolved your first loop.",
        icon="trophy",
        points=10,
        check=lambda s: _loops_resolved(s) >= 1,
    ),
    Badge(
        key="journal_streak_7",
        title="Week Streak",
        description="Journaled 7 days in a row.",
        icon="sparkle",
        points=10,
        check=lambda s: _longest_streak(s) >= 7,
    ),
    Badge(
        key="five_loops_resolved",
        title="Pattern Master",
        description="Resolved 5 loops.",
        icon="trophy",
        points=10,
        check=lambda s: _loops_resolved(s) >= 5,
    ),
    Badge(
        key="journal_streak_30",
        title="Full Moon",
        description="Journaled 30 days in a row.",
        icon="sparkle",
        points=10,
        check=lambda s: _longest_streak(s) >= 30,
    ),
]


def _gather_stats(user_id: int) -> dict[str, Any]:
    return {
        "loops": list_loops(user_id),
        "streak": compute_streak(user_id),
        "entry_count": len(list_journal_entries(user_id)),
    }


def _load_unlocked(user_id: int) -> dict[str, Any]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT badge_key, unlocked_at FROM user_badges WHERE user_id = %s",
                (user_id,),
            )
            rows = cur.fetchall()
    return {r["badge_key"]: r["unlocked_at"] for r in rows}


def _unlock_badges(user_id: int, keys: list[str], now) -> None:
    if not keys:
        return
    with get_connection() as conn:
        with conn.cursor() as cur:
            for key in keys:
                cur.execute(
                    """
                    INSERT INTO user_badges (user_id, badge_key, unlocked_at)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (user_id, badge_key) DO NOTHING
                    """,
                    (user_id, key, now),
                )
        conn.commit()


def get_rewards(user_id: int) -> dict[str, Any]:
    """Returns every badge in the catalog with its unlock status.

    Badge unlock state isn't tracked at the point of the triggering action
    (resolving a loop, hitting a streak, ...) -- there's no event hook for
    that today. Instead, same as loop state and journal streaks elsewhere in
    this codebase, it's derived from current stats on read, and any newly
    earned badge is persisted here so its unlocked_at date is stable once
    granted.
    """
    stats = _gather_stats(user_id)
    unlocked = _load_unlocked(user_id)

    newly_unlocked: list[str] = []
    for badge in BADGE_CATALOG:
        if badge.key in unlocked:
            continue
        if badge.check(stats):
            newly_unlocked.append(badge.key)

    if newly_unlocked:
        now = utc_now()
        _unlock_badges(user_id, newly_unlocked, now)
        for key in newly_unlocked:
            unlocked[key] = now

    badges = [
        {
            "key": badge.key,
            "title": badge.title,
            "description": badge.description,
            "icon": badge.icon,
            "points": badge.points,
            "unlocked": badge.key in unlocked,
            "unlocked_at": unlocked[badge.key].isoformat() if badge.key in unlocked else None,
            "just_unlocked": badge.key in newly_unlocked,
        }
        for badge in BADGE_CATALOG
    ]
    total_points = sum(badge.points for badge in BADGE_CATALOG if badge.key in unlocked)

    return {
        "badges": badges,
        "unlocked_count": len(unlocked),
        "total_count": len(BADGE_CATALOG),
        "points": total_points,
    }
