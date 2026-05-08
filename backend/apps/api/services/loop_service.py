from datetime import datetime, timedelta, timezone
from typing import Any

from apps.db import get_connection


RESOLVED_AFTER_DAYS = 30


def _classify_state(last_detected_at: datetime | None) -> str:
    if not last_detected_at:
        return "active"
    age_days = (datetime.now(timezone.utc) - last_detected_at).days
    return "resolved" if age_days > RESOLVED_AFTER_DAYS else "active"


def _strength(detection_count: int) -> float:
    return round(min(1.0, max(0.0, (detection_count or 0) / 12)), 2)


def _summarize_loop(row: dict[str, Any]) -> dict[str, Any]:
    last = row.get("last_detected_at")
    first = row.get("first_detected_at")
    state = _classify_state(last)
    detection_count = int(row.get("detection_count") or 0)
    matched = row.get("matched_entries") or []
    triggers_set: set[str] = set()
    moods_counter: dict[str, int] = {}
    thread_ids: set[str] = set()
    for m in matched:
        if not isinstance(m, dict):
            continue
        if m.get("thread_id"):
            thread_ids.add(str(m["thread_id"]))
        mood = (m.get("mood") or "").strip().lower()
        if mood:
            moods_counter[mood] = moods_counter.get(mood, 0) + 1
    if row.get("trigger"):
        triggers_set.add(str(row["trigger"]).strip().lower())
    return {
        "loop_id": str(row.get("loop_id")),
        "name": row.get("loop_name") or row.get("core_belief") or "",
        "core_belief": row.get("core_belief") or "",
        "trigger": row.get("trigger") or "",
        "valence": row.get("valence") or "",
        "state": state,
        "strength": _strength(detection_count),
        "occurrences": max(detection_count, len(matched)),
        "first_detected_at": first.isoformat() if first else None,
        "last_detected_at": last.isoformat() if last else None,
        "thread_count": len(thread_ids),
        "triggers": sorted(triggers_set),
        "dominant_mood": max(moods_counter, key=moods_counter.get) if moods_counter else None,
        "description": row.get("description") or "",
        "suggestion": row.get("suggestion") or "",
    }


def list_loops(user_id: int) -> dict[str, Any]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT loop_id, loop_name, core_belief, trigger, valence,
                       first_detected_at, last_detected_at, detection_count,
                       matched_entries, description, suggestion
                FROM loops
                WHERE user_id = %s
                ORDER BY last_detected_at DESC NULLS LAST
                """,
                (user_id,),
            )
            rows = cur.fetchall()

    items = [_summarize_loop(r) for r in rows]
    active = sum(1 for i in items if i["state"] == "active")
    resolved = sum(1 for i in items if i["state"] == "resolved")
    return {
        "items": items,
        "total": len(items),
        "active": active,
        "resolved": resolved,
    }


def get_loop(user_id: int, loop_id: str) -> dict[str, Any] | None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT loop_id, loop_name, core_belief, trigger, valence,
                       first_detected_at, last_detected_at, detection_count,
                       detection_dates, matched_entries, description, suggestion
                FROM loops
                WHERE user_id = %s AND loop_id::text = %s
                """,
                (user_id, str(loop_id)),
            )
            row = cur.fetchone()
    if not row:
        return None

    summary = _summarize_loop(row)
    matched_raw = row.get("matched_entries") or []
    occurrences: list[dict[str, Any]] = []
    for entry in matched_raw:
        if not isinstance(entry, dict):
            continue
        occurrences.append({
            "date": entry.get("date") or "",
            "summary": entry.get("summary") or "",
            "mood": entry.get("mood") or "",
            "thread_id": entry.get("thread_id") or "",
        })
    occurrences.sort(key=lambda o: o.get("date") or "", reverse=True)

    detection_dates = row.get("detection_dates") or []
    if not isinstance(detection_dates, list):
        detection_dates = []

    first = row.get("first_detected_at")
    last = row.get("last_detected_at")
    span_days = (last - first).days if first and last else 0

    co_triggers: dict[str, int] = {}
    co_moods: dict[str, int] = {}
    for o in occurrences:
        m = (o.get("mood") or "").strip().lower()
        if m:
            co_moods[m] = co_moods.get(m, 0) + 1

    intensities: list[int] = []
    if occurrences:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT intensity, triggers
                    FROM journal_entries_v2
                    WHERE user_id = %s AND thread_id = ANY(%s)
                    """,
                    (user_id, [o["thread_id"] for o in occurrences if o.get("thread_id")] or [""]),
                )
                for r in cur.fetchall():
                    try:
                        v = int(r.get("intensity") or 0)
                        if 1 <= v <= 10:
                            intensities.append(v)
                    except (TypeError, ValueError):
                        pass
                    for t in r.get("triggers", []) or []:
                        cleaned = str(t).strip().lower()
                        if not cleaned or cleaned == summary["trigger"]:
                            continue
                        co_triggers[cleaned] = co_triggers.get(cleaned, 0) + 1

    avg_intensity = round(sum(intensities) / len(intensities), 1) if intensities else None

    return {
        **summary,
        "detection_dates": [d if isinstance(d, str) else "" for d in detection_dates],
        "entries": occurrences,
        "avg_intensity": avg_intensity,
        "span_days": span_days,
        "co_triggers": [
            {"trigger": k, "count": v}
            for k, v in sorted(co_triggers.items(), key=lambda kv: kv[1], reverse=True)[:5]
        ],
        "co_moods": [
            {"mood": k, "count": v}
            for k, v in sorted(co_moods.items(), key=lambda kv: kv[1], reverse=True)[:5]
        ],
    }


def mark_resolved(user_id: int, loop_id: str) -> bool:
    """Mark a loop as resolved by backdating last_detected_at."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=RESOLVED_AFTER_DAYS + 1)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE loops
                SET last_detected_at = %s
                WHERE user_id = %s AND loop_id::text = %s
                """,
                (cutoff, user_id, str(loop_id)),
            )
            ok = cur.rowcount > 0
        conn.commit()
    return ok