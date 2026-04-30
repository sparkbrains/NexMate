from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from apps.db import get_connection


MOOD_SCORES = {
    "very_positive": 1.0,
    "positive": 0.7,
    "calm": 0.3,
    "neutral": 0.0,
    "mixed": -0.1,
    "stressed": -0.5,
    "negative": -0.7,
    "very_negative": -1.0,
}


def _score_from_summary(row: dict[str, Any]) -> float:
    if "mood_score" in row:
        try:
            return float(row["mood_score"])
        except (TypeError, ValueError):
            pass
    mood = str(row.get("mood", "neutral")).strip().lower()
    return MOOD_SCORES.get(mood, 0.0)


def _checkin_streak(entries: list[dict[str, Any]]) -> int:
    if not entries:
        return 0

    dates = {row["created_at"].date() for row in entries if row.get("created_at")}
    if not dates:
        return 0

    streak = 0
    cursor = datetime.now(timezone.utc).date()
    while cursor in dates:
        streak += 1
        cursor = cursor - timedelta(days=1)
    return streak


def get_dashboard_kpis(user_id: int) -> dict[str, Any]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT mood, signals, raw_summary, created_at
                FROM journal_entries
                WHERE user_id = %s
                ORDER BY created_at ASC
                """,
                (user_id,),
            )
            summaries = cur.fetchall()

    mood_counter = Counter()
    signal_counter = Counter()
    scores: list[float] = []
    by_day_scores: dict[str, list[float]] = defaultdict(list)
    by_day_moods: dict[str, Counter[str]] = defaultdict(Counter)

    for row in summaries:
        mood = str(row.get("mood", "neutral")).strip().lower()
        mood_counter[mood] += 1

        raw_summary = row.get("raw_summary", {}) or {}
        merged_row = {"mood": mood, **raw_summary}
        score = _score_from_summary(merged_row)
        scores.append(score)

        created_at = row.get("created_at")
        if created_at:
            day_key = created_at.date().isoformat()
            by_day_scores[day_key].append(score)
            by_day_moods[day_key][mood] += 1

        for signal in row.get("signals", []) or []:
            cleaned = str(signal).strip().lower()
            if cleaned:
                signal_counter[cleaned] += 1

    now = datetime.now(timezone.utc).date()
    weekly_trend: list[dict[str, Any]] = []
    for day_offset in range(6, -1, -1):
        day = (now - timedelta(days=day_offset)).isoformat()
        day_scores = by_day_scores.get(day, [])
        daily_score = round(sum(day_scores) / len(day_scores), 3) if day_scores else None
        weekly_trend.append({"day": day, "score": daily_score})

    avg_score = round(sum(scores) / len(scores), 3) if scores else 0.0
    mood_breakdown = dict(mood_counter.most_common())
    top_signals = [{"signal": signal, "count": count} for signal, count in signal_counter.most_common(5)]
    calendar_moods = []
    for day in sorted(by_day_scores.keys()):
        day_scores = by_day_scores[day]
        if not day_scores:
            continue
        dominant_mood, _ = by_day_moods[day].most_common(1)[0]
        calendar_moods.append(
            {
                "day": day,
                "score": round(sum(day_scores) / len(day_scores), 3),
                "mood": dominant_mood,
                "count": len(day_scores),
            }
        )

    return {
        "total_entries": len(summaries),
        "avg_mood_score": avg_score,
        "checkin_streak_days": _checkin_streak(summaries),
        "mood_breakdown": mood_breakdown,
        "top_signals": top_signals,
        "weekly_trend": weekly_trend,
        "calendar_moods": calendar_moods,
    }
