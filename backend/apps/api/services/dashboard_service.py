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
                SELECT mood, key_facts, raw_summary, created_at
                FROM journal_entries_v2
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

        for fact in row.get("key_facts", []) or []:
            cleaned = str(fact).strip().lower()
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


def _fetch_v2_entries(user_id: int, since: datetime | None = None) -> list[dict[str, Any]]:
    query = """
        SELECT thread_id, mood, triggers, core_theme, intensity, raw_summary, created_at
        FROM journal_entries_v2
        WHERE user_id = %s
    """
    params: list[Any] = [user_id]
    if since is not None:
        query += " AND created_at >= %s"
        params.append(since)
    query += " ORDER BY created_at ASC"

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, tuple(params))
            return cur.fetchall()


def _fetch_loops(user_id: int) -> list[dict[str, Any]]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT loop_id, loop_name, core_belief, trigger, valence,
                       first_detected_at, last_detected_at, detection_count, description
                FROM loops
                WHERE user_id = %s
                ORDER BY last_detected_at DESC
                """,
                (user_id,),
            )
            return cur.fetchall()


def _thread_count_in_window(user_id: int, since: datetime) -> int:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT COUNT(DISTINCT thread_id) AS cnt
                FROM thread_messages
                WHERE user_id = %s AND created_at >= %s
                """,
                (user_id, since),
            )
            row = cur.fetchone()
    return int(row["cnt"]) if row and row.get("cnt") is not None else 0


def _message_count_in_window(user_id: int, since: datetime) -> int:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT COUNT(*) AS cnt
                FROM thread_messages
                WHERE user_id = %s AND created_at >= %s
                """,
                (user_id, since),
            )
            row = cur.fetchone()
    return int(row["cnt"]) if row and row.get("cnt") is not None else 0


def _avg(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 2) if values else None


def get_dashboard_insights(user_id: int, days: int = 30) -> dict[str, Any]:
    """Rich dashboard payload sourced from journal_entries_v2 + loops."""
    now = datetime.now(timezone.utc)
    today = now.date()
    window_start = now - timedelta(days=days)
    prev_window_start = now - timedelta(days=days * 2)

    entries = _fetch_v2_entries(user_id, since=prev_window_start)
    all_entries = entries  # both windows
    in_window = [e for e in entries if e["created_at"] >= window_start]
    prev_window = [
        e for e in entries
        if prev_window_start <= e["created_at"] < window_start
    ]

    # Mood breakdown (% over window)
    mood_counter: Counter[str] = Counter()
    intensity_values: list[int] = []
    triggers_counter: Counter[str] = Counter()
    triggers_by_day: dict[str, Counter[str]] = defaultdict(Counter)
    intensity_by_day: dict[str, list[int]] = defaultdict(list)
    mood_by_day: dict[str, Counter[str]] = defaultdict(Counter)

    for row in in_window:
        mood = str(row.get("mood", "neutral")).strip().lower() or "neutral"
        mood_counter[mood] += 1
        try:
            intensity = int(row.get("intensity") or 0)
        except (TypeError, ValueError):
            intensity = 0
        if 1 <= intensity <= 10:
            intensity_values.append(intensity)

        created = row.get("created_at")
        if created:
            day_key = created.date().isoformat()
            if 1 <= intensity <= 10:
                intensity_by_day[day_key].append(intensity)
            mood_by_day[day_key][mood] += 1

        for trig in row.get("triggers", []) or []:
            cleaned = str(trig).strip().lower()
            if not cleaned:
                continue
            triggers_counter[cleaned] += 1
            if created:
                day_key = created.date().isoformat()
                triggers_by_day[day_key][cleaned] += 1

    total = len(in_window)

    # Mood breakdown with percentages
    mood_breakdown = []
    for mood, count in mood_counter.most_common():
        pct = round(count * 100 / total) if total else 0
        mood_breakdown.append({"mood": mood, "count": count, "pct": pct})

    # Intensity distribution 1..10
    intensity_counter = Counter(intensity_values)
    intensity_distribution = [
        {"intensity": i, "count": intensity_counter.get(i, 0)} for i in range(1, 11)
    ]
    intensity_avg = _avg([float(v) for v in intensity_values])
    peak_intensity = max(intensity_values) if intensity_values else None
    low_intensity = min(intensity_values) if intensity_values else None

    # Find peak/low days
    peak_day = None
    low_day = None
    if intensity_by_day:
        day_avgs = {
            d: sum(v) / len(v) for d, v in intensity_by_day.items() if v
        }
        if day_avgs:
            peak_day = max(day_avgs, key=day_avgs.get)
            low_day = min(day_avgs, key=day_avgs.get)

    # Emotion trend (per day, last N days) - returns daily mood mix
    emotion_trend: list[dict[str, Any]] = []
    for offset in range(days - 1, -1, -1):
        day = (today - timedelta(days=offset)).isoformat()
        moods = mood_by_day.get(day, Counter())
        intensities = intensity_by_day.get(day, [])
        emotion_trend.append({
            "day": day,
            "moods": dict(moods),
            "avg_intensity": round(sum(intensities) / len(intensities), 2) if intensities else None,
            "count": sum(moods.values()),
        })

    # Top triggers
    top_triggers = []
    max_trigger_count = max(triggers_counter.values()) if triggers_counter else 0
    for trig, count in triggers_counter.most_common(5):
        pct = round(count * 100 / max_trigger_count) if max_trigger_count else 0
        top_triggers.append({"trigger": trig, "count": count, "pct": pct})

    # Trigger heatmap: top triggers x days
    top_trigger_names = [t["trigger"] for t in top_triggers]
    heatmap = []
    for trig in top_trigger_names:
        cells = []
        for offset in range(days - 1, -1, -1):
            day = (today - timedelta(days=offset)).isoformat()
            cells.append(triggers_by_day.get(day, Counter()).get(trig, 0))
        max_cell = max(cells) if cells else 0
        cells_norm = [round(c / max_cell, 3) if max_cell else 0 for c in cells]
        heatmap.append({"trigger": trig, "cells": cells, "intensity": cells_norm})

    # Growth — this window vs previous
    def _stats(rows: list[dict[str, Any]]) -> dict[str, Any]:
        intensities = []
        thread_ids = set()
        for r in rows:
            try:
                v = int(r.get("intensity") or 0)
                if 1 <= v <= 10:
                    intensities.append(v)
            except (TypeError, ValueError):
                pass
            if r.get("thread_id"):
                thread_ids.add(r["thread_id"])
        return {
            "entries": len(rows),
            "threads": len(thread_ids),
            "avg_intensity": _avg([float(v) for v in intensities]),
        }

    cur_stats = _stats(in_window)
    prev_stats = _stats(prev_window)

    # Loops summary
    loops_rows = _fetch_loops(user_id)
    loops_summary = []
    active_loops = 0
    resolved_loops = 0
    new_in_window = 0
    for loop in loops_rows:
        first = loop.get("first_detected_at")
        last = loop.get("last_detected_at")
        is_resolved = bool(last and (now - last).days > 30)
        if is_resolved:
            resolved_loops += 1
        else:
            active_loops += 1
        if first and first >= window_start:
            new_in_window += 1
        # crude strength: detection_count normalized
        det_count = int(loop.get("detection_count") or 1)
        strength = min(1.0, round(det_count / 12, 2))
        loops_summary.append({
            "loop_id": str(loop.get("loop_id")),
            "name": loop.get("loop_name") or loop.get("core_belief") or "",
            "core_belief": loop.get("core_belief") or "",
            "trigger": loop.get("trigger") or "",
            "valence": loop.get("valence") or "",
            "occurrences": det_count,
            "strength": strength,
            "state": "resolved" if is_resolved else "active",
            "first_detected_at": first.isoformat() if first else None,
            "last_detected_at": last.isoformat() if last else None,
        })

    # Streak (uses all v2 entries)
    streak = _checkin_streak(all_entries)

    # Echo: oldest entry in 60-180 day range
    echo = None
    echo_window_start = now - timedelta(days=180)
    echo_window_end = now - timedelta(days=60)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT user_input, assistant_reply, core_theme, created_at
                FROM journal_entries_v2
                WHERE user_id = %s AND created_at BETWEEN %s AND %s
                ORDER BY created_at ASC
                LIMIT 1
                """,
                (user_id, echo_window_start, echo_window_end),
            )
            row = cur.fetchone()
            if row:
                age_days = (now - row["created_at"]).days
                snippet = (row.get("user_input") or "").strip()
                if len(snippet) > 220:
                    snippet = snippet[:217] + "…"
                echo = {
                    "text": snippet,
                    "date": row["created_at"].date().isoformat(),
                    "age_days": age_days,
                }

    # Today's open question — from latest entry's next_focus or core_theme
    open_question = None
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT next_focus, core_theme
                FROM journal_entries_v2
                WHERE user_id = %s
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (user_id,),
            )
            row = cur.fetchone()
            if row:
                question = (row.get("next_focus") or "").strip() or (row.get("core_theme") or "").strip()
                if question:
                    open_question = question

    # Window meta
    thread_count = _thread_count_in_window(user_id, window_start)
    message_count = _message_count_in_window(user_id, window_start)

    # Per-thread aggregates (across full prev_window+window)
    thread_aggregates: dict[str, dict[str, Any]] = {}
    for row in all_entries:
        tid = row.get("thread_id")
        if not tid:
            continue
        agg = thread_aggregates.setdefault(tid, {
            "thread_id": tid,
            "intensities": [],
            "moods": Counter(),
            "last_at": None,
        })
        try:
            v = int(row.get("intensity") or 0)
            if 1 <= v <= 10:
                agg["intensities"].append(v)
        except (TypeError, ValueError):
            pass
        mood = str(row.get("mood", "")).strip().lower()
        if mood:
            agg["moods"][mood] += 1
        created = row.get("created_at")
        if created and (agg["last_at"] is None or created > agg["last_at"]):
            agg["last_at"] = created

    thread_summaries = {}
    POSITIVE_MOODS = {"very_positive", "positive", "calm"}
    for tid, agg in thread_aggregates.items():
        intensities = agg["intensities"]
        avg_i = round(sum(intensities) / len(intensities)) if intensities else None
        dominant = agg["moods"].most_common(1)[0][0] if agg["moods"] else None
        thread_summaries[tid] = {
            "avg_intensity": avg_i,
            "dominant_mood": dominant,
            "positive": dominant in POSITIVE_MOODS if dominant else False,
        }

    # This-week stats (last 7 days vs prior 7)
    week_start = now - timedelta(days=7)
    prev_week_start = now - timedelta(days=14)
    this_week = [e for e in entries if e["created_at"] >= week_start]
    prev_week = [
        e for e in entries
        if prev_week_start <= e["created_at"] < week_start
    ]
    week_stats = _stats(this_week)
    prev_week_stats = _stats(prev_week)
    days_with_entries_this_week = len({
        e["created_at"].date() for e in this_week if e.get("created_at")
    })

    # Per-day this week (for WeekDots)
    week_days = []
    for offset in range(6, -1, -1):
        day = today - timedelta(days=offset)
        day_key = day.isoformat()
        intensities = intensity_by_day.get(day_key, [])
        moods = mood_by_day.get(day_key, Counter())
        dominant = moods.most_common(1)[0][0] if moods else None
        week_days.append({
            "day": day_key,
            "weekday": day.strftime("%a"),
            "avg_intensity": round(sum(intensities) / len(intensities), 2) if intensities else None,
            "dominant_mood": dominant,
            "count": sum(moods.values()),
        })

    return {
        "window_days": days,
        "total_entries": total,
        "thread_count": thread_count,
        "message_count": message_count,
        "checkin_streak_days": streak,
        "mood_breakdown": mood_breakdown,
        "intensity_distribution": intensity_distribution,
        "intensity_stats": {
            "avg": intensity_avg,
            "peak": peak_intensity,
            "peak_day": peak_day,
            "low": low_intensity,
            "low_day": low_day,
        },
        "emotion_trend": emotion_trend,
        "top_triggers": top_triggers,
        "trigger_heatmap": heatmap,
        "growth": {
            "current": cur_stats,
            "previous": prev_stats,
        },
        "week": {
            "days": week_days,
            "days_with_entries": days_with_entries_this_week,
            "stats": week_stats,
            "previous_stats": prev_week_stats,
        },
        "loops": {
            "items": loops_summary,
            "active": active_loops,
            "resolved": resolved_loops,
            "new_in_window": new_in_window,
        },
        "echo": echo,
        "open_question": open_question,
        "thread_summaries": thread_summaries,
    }