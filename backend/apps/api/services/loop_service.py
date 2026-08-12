from datetime import datetime, timedelta, timezone
from typing import Any
import uuid

from apps.db import get_connection, utc_now
from nextmate_agent.utils.llm import get_chat_model, invoke_with_logging

from uuid import uuid4
from psycopg.types.json import Jsonb


RESOLVED_AFTER_DAYS = 30


def _classify_state(last_detected_at: datetime | None) -> str:
    if not last_detected_at:
        return "active"
    age_days = (datetime.now(timezone.utc) - last_detected_at).days
    return "resolved" if age_days > RESOLVED_AFTER_DAYS else "active"


def _strength(detection_count: int, matched_entries: list[dict[str, Any]]) -> float:
    # 1. Frequency factor: how many occurrences do we have? Normalize to 10 occurrences.
    count = max(detection_count, len(matched_entries))
    count_factor = min(1.0, count / 10.0)

    # 2. Intensity factor: weighted average intensity of all matched entries, weighted by recency.
    now = datetime.now(timezone.utc)
    weighted_sum = 0.0
    total_weight = 0.0
    for entry in matched_entries:
        if not isinstance(entry, dict):
            continue
        val = entry.get("intensity")
        if val is None:
            continue
        try:
            intensity = float(val)
        except (ValueError, TypeError):
            continue
        # Determine recency weight (exponential decay, half-life ~7 days). Adjust decay factor as needed.
        date_str = entry.get("date")
        weight = 1.0
        if isinstance(date_str, str) and date_str:
            try:
                entry_dt = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                # Ensure timezone-aware UTC
                if entry_dt.tzinfo is None:
                    entry_dt = entry_dt.replace(tzinfo=timezone.utc)
                days_ago = (now - entry_dt).days
                # Decay factor: recent entries have weight close to 1, older decay exponentially.
                decay_rate = 0.85  # per day decay; tweak for desired speed
                weight = decay_rate ** days_ago
            except Exception:
                weight = 1.0
        weighted_sum += intensity * weight
        total_weight += weight

    if total_weight == 0:
        avg_intensity = 5.0
    else:
        avg_intensity = weighted_sum / total_weight

    # Scale avg_intensity to 0-1 range (intensity is on a 1-10 scale)
    intensity_factor = avg_intensity / 10.0

    return round(count_factor * intensity_factor, 2)


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
        "strength": _strength(detection_count, matched),
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
            "intensity": entry.get("intensity"),
        })
    occurrences.sort(key=lambda o: o.get("date") or "", reverse=True)

    detection_dates = row.get("detection_dates") or []
    if not isinstance(detection_dates, list):
        detection_dates = []

    first = row.get("first_detected_at")
    last = row.get("last_detected_at")
    span_days = max((last - first).days, 0) if first and last else 0

    co_triggers: dict[str, int] = {}
    co_moods: dict[str, int] = {}
    for o in occurrences:
        m = (o.get("mood") or "").strip().lower()
        if m:
            co_moods[m] = co_moods.get(m, 0) + 1

    intensities: list[int] = []
    for o in occurrences:
        v = o.get("intensity")
        if v is not None:
            try:
                v_int = int(v)
                if 1 <= v_int <= 10:
                    intensities.append(v_int)
            except (TypeError, ValueError):
                pass

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
                    if not intensities:
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

def _parse_created_at(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc)
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value).astimezone(timezone.utc)
        except ValueError:
            pass
    return datetime.now(timezone.utc)


def _loop_signature(loop: dict[str, Any]) -> tuple[str, str]:
    belief = (loop.get("core_belief") or "").lower().strip()
    trigger = (loop.get("trigger") or "").lower().strip()
    return (belief, trigger)


def _loops_match(loops_a: dict[str, Any], loops_b: dict[str, Any]) -> bool:
    sig_a = _loop_signature(loops_a)
    sig_b = _loop_signature(loops_b)
    if not sig_a[0] or not sig_a[1] or not sig_b[0] or not sig_b[1]:
        return False
    belief_match = sig_a[0] in sig_b[0] or sig_b[0] in sig_a[0]
    trigger_match = sig_a[1] in sig_b[1] or sig_b[1] in sig_a[1]
    return belief_match and trigger_match


def _get_cross_thread_memory_entries(user_id: int, current_thread_id: str) -> list[dict[str, Any]]:
    """
    Retrieve memory entries for a user across all threads except the current
    one. Used as the FULL evidence pool for deterministic cross-thread loop
    validation -- not directly injected into any LLM prompt (see
    _select_prompt_cross_thread_entries in nodes.py for the prompt-facing
    subset).
    """
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    core_theme,
                    mood,
                    core_beliefs,
                    triggers,
                    intensity,
                    created_at,
                    thread_id
                FROM journal_entries_v2
                WHERE user_id = %s AND thread_id != %s
                ORDER BY created_at DESC
                LIMIT 150
                """,
                (user_id, current_thread_id)
            )
            return [
                {
                    "core_theme": row["core_theme"],
                    "mood": row["mood"],
                    "core_beliefs": row["core_beliefs"] or [],
                    "triggers": row["triggers"] or [],
                    "intensity": row["intensity"],
                    "created_at": row["created_at"].isoformat() if hasattr(row["created_at"], "isoformat") else str(row["created_at"]),
                    "thread_id": row["thread_id"],
                }
                for row in cur.fetchall()
            ]



def _select_prompt_cross_thread_entries(
    cross_thread_entries: list[dict[str, Any]],
    current_entries: list[dict[str, Any]],
    stored_loops: list[dict[str, Any]],
    max_entries: int = 12,
) -> list[dict[str, Any]]:
    """Choose which cross-thread entries the detect_loops LLM actually sees.

    Prioritizes entries that share a belief/trigger with the current thread or
    a known stored loop (the only entries actually useful for spotting a
    candidate cross-thread pattern), then fills remaining slots with a
    temporally-SPREAD sample of the rest -- not a recency slice -- so the LLM
    still sees that a pattern spans weeks, not just today.

    Deterministic validation (_validate_cross_thread_loop_recurrence) should
    always be called with the FULL unfiltered cross_thread_entries list, not
    this trimmed result -- this function only controls prompt size, never
    validation evidence.
    """
    if len(cross_thread_entries) <= max_entries:
        return cross_thread_entries

    relevant_terms: set[str] = set()
    for e in current_entries:
        relevant_terms.update(b.lower() for b in e.get("core_beliefs", []) if b)
        relevant_terms.update(t.lower() for t in e.get("triggers", []) if t)
    for loop in stored_loops:
        if loop.get("core_belief"):
            relevant_terms.add(loop["core_belief"].lower())
        if loop.get("trigger"):
            relevant_terms.add(loop["trigger"].lower())

    def _is_relevant(entry: dict[str, Any]) -> bool:
        beliefs = [b.lower() for b in entry.get("core_beliefs", [])]
        triggers = [t.lower() for t in entry.get("triggers", [])]
        for term in relevant_terms:
            if any(term in b or b in term for b in beliefs):
                return True
            if any(term in t or t in term for t in triggers):
                return True
        return False

    relevant = [e for e in cross_thread_entries if _is_relevant(e)]
    remainder = [e for e in cross_thread_entries if e not in relevant]

    if len(relevant) >= max_entries:
        # Still cap, but keep a spread across the relevant set rather than a
        # contiguous recency block, to preserve visible temporal diversity.
        step = max(1, len(relevant) // max_entries)
        return relevant[::step][:max_entries]

    slots_left = max_entries - len(relevant)
    if remainder and slots_left > 0:
        step = max(1, len(remainder) // slots_left)
        relevant = relevant + remainder[::step][:slots_left]

    return relevant

def _validate_cross_thread_loop_recurrence(
    loop_belief: str, loop_trigger: str, current_entries: list[dict[str, Any]], 
    cross_thread_entries: list[dict[str, Any]]
) -> tuple[bool, list[dict[str, Any]], float]:
    """
    Validate if a pattern recurs across different threads.
    Only returns True if the same core_belief + trigger combination appears in multiple threads.
    Returns: (is_valid_cross_thread_loop, matched_entries, confidence_score)
    """
    if not loop_belief or not loop_trigger:
        return False, [], 0.0
    
    loop_belief = loop_belief.lower().strip()
    loop_trigger = loop_trigger.lower().strip()
    
    # Combine all entries for analysis
    all_entries = current_entries + cross_thread_entries
    
    import re
    def get_words(text):
        return set(re.findall(r'\b[a-z]{4,}\b', text.lower()))
    
    loop_belief_words = get_words(loop_belief)
    loop_trigger_words = get_words(loop_trigger)
    
    matches: list[dict[str, Any]] = []
    for entry in all_entries:
        beliefs = " ".join([b.lower() for b in entry.get("core_beliefs", [])])
        triggers = " ".join([t.lower() for t in entry.get("triggers", [])])
        
        entry_belief_words = get_words(beliefs)
        entry_trigger_words = get_words(triggers)

        # Require actual word overlap on BOTH belief and trigger -- an empty
        # word set (extraction failed) or a one-sided match is not evidence
        # of the "same belief + trigger combination" this function promises.
        belief_hit = len(loop_belief_words & entry_belief_words) > 0
        trigger_hit = len(loop_trigger_words & entry_trigger_words) > 0

        if belief_hit and trigger_hit:
            matches.append({
                "date": entry.get("created_at", ""),
                "summary": entry.get("core_theme", "") or entry.get("summary", ""),
                "mood": entry.get("mood", ""),
                "thread_id": entry.get("thread_id", ""),
                "intensity": entry.get("intensity"),
            })
    
    # Check if we have matches across multiple threads
    thread_ids = set(m.get("thread_id", "") for m in matches if m.get("thread_id"))
    
    # Require at least 2 different threads and 2 total matches
    if len(thread_ids) < 2 or len(matches) < 2:
        return False, matches, 0.0
    
    # Check temporal diversity - patterns must span different time periods
    dates = [m.get("date", "") for m in matches if m.get("date")]
    if len(dates) < 2:
        return False, matches, 0.0
    
    try:
        from datetime import datetime, timezone
        parsed_dates = []
        for date_str in dates:
            try:
                parsed_dates.append(datetime.fromisoformat(date_str.replace('Z', '+00:00')))
            except:
                continue
        
        if len(parsed_dates) < 3:
            return False, matches, 0.0
        
        # Check if spans at least 1 different day
        parsed_dates.sort()
        time_span_days = (parsed_dates[-1] - parsed_dates[0]).days
        if time_span_days < 1:
            return False, matches, 0.0
        
        # Calculate confidence score with emphasis on thread diversity
        base_confidence = min(len(matches) / 8.0, 1.0)  # More matches = higher confidence
        temporal_confidence = min(time_span_days / 5.0, 1.0)  # Longer span = higher confidence
        thread_diversity = min(len(thread_ids) / 3.0, 1.0)  # More threads = higher confidence
        confidence = (base_confidence * 0.3 + temporal_confidence * 0.3 + thread_diversity * 0.4)
        
        return True, matches, confidence
        
    except Exception:
        # If date parsing fails, be conservative but still require multiple threads
        return len(thread_ids) >= 2 and len(matches) >= 3, matches, 0.6


def _validate_loop_recurrence(
    loop_belief: str, loop_trigger: str, entries: list[dict[str, Any]]
) -> tuple[bool, list[dict[str, Any]], float]:
    """
    Validate if a pattern truly recurs with stricter criteria.
    Returns: (is_valid_loop, matched_entries, confidence_score)
    """
    if not loop_belief or not loop_trigger or len(entries) < 3:
        return False, [], 0.0
    
    loop_belief = loop_belief.lower().strip()
    loop_trigger = loop_trigger.lower().strip()
    
    matches: list[dict[str, Any]] = []
    for entry in entries:
        beliefs = [b.lower() for b in entry.get("core_beliefs", [])]
        triggers = [t.lower() for t in entry.get("triggers", [])]
        belief_hit = any(loop_belief in b or b in loop_belief for b in beliefs) if loop_belief else False
        trigger_hit = any(loop_trigger in t or t in loop_trigger for t in triggers) if loop_trigger else False
        if belief_hit and trigger_hit:
            matches.append({
                "date": entry.get("created_at", ""),
                "summary": entry.get("core_theme", "") or entry.get("summary", ""),
                "mood": entry.get("mood", ""),
                "thread_id": entry.get("thread_id", ""),
                "intensity": entry.get("intensity"),
            })
    
    if len(matches) < 3:
        return False, matches, 0.0
    
    # Check temporal diversity - patterns must span different time periods
    dates = [m.get("date", "") for m in matches if m.get("date")]
    if len(dates) < 3:
        return False, matches, 0.0
    
    try:
        from datetime import datetime, timezone
        parsed_dates = []
        for date_str in dates:
            try:
                parsed_dates.append(datetime.fromisoformat(date_str.replace('Z', '+00:00')))
            except:
                continue
        
        if len(parsed_dates) < 3:
            return False, matches, 0.0
        
        # Check if spans at least 2 different days
        parsed_dates.sort()
        time_span_days = (parsed_dates[-1] - parsed_dates[0]).days
        if time_span_days < 1:
            return False, matches, 0.0
        
        # Check context diversity - different threads or conversations
        thread_ids = set(m.get("thread_id", "") for m in matches if m.get("thread_id"))
        context_diversity = min(len(thread_ids) / 3.0, 1.0)  # Normalize to 0-1
        
        # Calculate confidence score based on multiple factors
        base_confidence = min(len(matches) / 10.0, 1.0)  # More matches = higher confidence
        temporal_confidence = min(time_span_days / 7.0, 1.0)  # Longer span = higher confidence
        confidence = (base_confidence * 0.4 + temporal_confidence * 0.4 + context_diversity * 0.2)
        
        return True, matches, confidence
        
    except Exception:
        # If date parsing fails, be conservative
        return len(matches) >= 3, matches, 0.5


def _match_entries_for_loop(
    loop: dict[str, Any], entries: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    loop_belief = (loop.get("core_belief") or "").lower().strip()
    loop_trigger = (loop.get("trigger") or "").lower().strip()
    matches: list[dict[str, Any]] = []
    for entry in entries:
        beliefs = [b.lower() for b in entry.get("core_beliefs", [])]
        triggers = [t.lower() for t in entry.get("triggers", [])]
        belief_hit = any(loop_belief in b or b in loop_belief for b in beliefs) if loop_belief else False
        trigger_hit = any(loop_trigger in t or t in loop_trigger for t in triggers) if loop_trigger else False
        if belief_hit and trigger_hit:
            matches.append(
                {
                    "date": entry.get("created_at", ""),
                    "summary": entry.get("core_theme", "") or entry.get("summary", ""),
                    "mood": entry.get("mood", ""),
                    "intensity": entry.get("intensity"),
                }
            )
    return matches


def _calculate_loop_span_dates(matched_entries: list[dict[str, Any]], default_dt: datetime) -> tuple[datetime, datetime]:
    all_dates = []
    for entry in matched_entries:
        date_str = entry.get("date", "")
        if date_str:
            try:
                all_dates.append(_parse_created_at(date_str))
            except Exception:
                pass
    if not all_dates:
        return default_dt, default_dt
    return min(all_dates), max(all_dates)


def _merge_loop_records(
    existing: dict[str, Any], new: dict[str, Any], new_matched: list[dict[str, Any]]
) -> dict[str, Any]:
    existing_dates = {e.get("date", "") for e in existing.get("matched_entries", [])}
    new_entries = [e for e in new_matched if e.get("date", "") and e.get("date") not in existing_dates]
    merged_entries = existing.get("matched_entries", []) + new_entries

    detection_dates = existing.get("detection_dates", [existing.get("first_detected_at", existing.get("detected_at", ""))])
    now = new.get("last_detected_at", new.get("detected_at", ""))
    if now and now not in detection_dates:
        detection_dates.append(now)

    detection_count = len(detection_dates)
    now_dt = _parse_created_at(now)
    first_dt, last_dt = _calculate_loop_span_dates(merged_entries, now_dt)

    return {
        "loop_id": existing.get("loop_id"),
        "loop_name": existing.get("loop_name") or new.get("loop_name", ""),
        "core_belief": existing.get("core_belief", new.get("core_belief", "")),
        "trigger": existing.get("trigger", new.get("trigger", "")),
        "valence": existing.get("valence", new.get("valence", "neutral")),
        "first_detected_at": first_dt.isoformat(),
        "last_detected_at": last_dt.isoformat(),
        "detection_count": detection_count,
        "detection_dates": detection_dates,
        "matched_entries": merged_entries,
        "description": new.get("description") or existing.get("description", ""),
        "suggestion": new.get("suggestion") or existing.get("suggestion", ""),
        "thread_id": existing.get("thread_id", new.get("thread_id", "default")),
    }


def _update_loop_last_seen(loop: dict[str, Any], user_id: int, new_matches: list[dict[str, Any]] = None) -> None:
    loop_id = loop.get("loop_id")
    if not loop_id:
        return
    now = datetime.now(timezone.utc)
    
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT first_detected_at, detection_dates, matched_entries
                FROM loops
                WHERE loop_id = %s AND user_id = %s
                FOR UPDATE
                """,
                (loop_id, user_id),
            )
            row = cur.fetchone()

            if not row:
                return

            first_dt = row.get("first_detected_at")
            detection_dates = row.get("detection_dates") or []
            matched_entries = row.get("matched_entries") or []

            # Merge new matches if not already present
            existing_dates = {e.get("date", "") for e in matched_entries if e.get("date")}
            if new_matches:
                for m in new_matches:
                    m_date = m.get("date", "")
                    if m_date and m_date not in existing_dates:
                        matched_entries.append(m)

            # Append now to detection_dates if not already there
            now_iso = now.isoformat()
            if now_iso not in detection_dates:
                detection_dates.append(now_iso)

            detection_count = len(detection_dates)
            first_detected_at, computed_last = _calculate_loop_span_dates(matched_entries, now)
            last_detected_at = max(computed_last, now)
            cur.execute(
                """
                UPDATE loops
                SET first_detected_at = %s,
                    last_detected_at = %s,
                    detection_count = %s,
                    detection_dates = %s::jsonb,
                    matched_entries = %s::jsonb
                WHERE loop_id = %s AND user_id = %s
                """,
                (first_detected_at, last_detected_at, detection_count, Jsonb(detection_dates), Jsonb(matched_entries), loop_id, user_id),
            )
        conn.commit()


def append_loop_entry(loop_id: str, user_id: int, entry: dict[str, Any]) -> bool:
    """Attaches one freshly-persisted journal entry (in the matched_entries
    shape: date/summary/mood/thread_id/intensity) to a loop that was
    reopened this turn via the resurface-check or fallback match in
    choose_response_mode_node.

    This is the counterpart reopen_loop's docstring points at: reopen_loop
    intentionally does NOT touch matched_entries, because at the point it
    runs there is no new entry yet -- summarize_turn_node /
    persist_summary_node haven't executed yet in the graph. Once
    persist_summary_node creates that entry, this is what actually attaches
    it -- without this, a loop's matched_entries silently goes stale even
    while last_detected_at keeps advancing via reopen_loop each time the
    loop resurfaces.

    Uses the same loop_id::text cast as reopen_loop (rather than
    _update_loop_last_seen's uncast `loop_id = %s`), since that cast is
    what reopen_loop's docstring identifies as necessary for a plain
    python str loop_id (as produced by str(row["loop_id"]) in
    load_memory_node) to reliably match the UUID column.
    """
    if not entry.get("date"):
        return False

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT matched_entries, detection_dates
                FROM loops
                WHERE loop_id::text = %s AND user_id = %s
                FOR UPDATE
                """,
                (str(loop_id), user_id),
            )
            row = cur.fetchone()
            if not row:
                return False

            matched_entries = row.get("matched_entries") or []
            existing_dates = {e.get("date", "") for e in matched_entries if isinstance(e, dict)}
            if entry.get("date") not in existing_dates:
                matched_entries.append(entry)

            detection_dates = row.get("detection_dates") or []
            entry_date = entry.get("date", "")
            if entry_date and entry_date not in detection_dates:
                detection_dates.append(entry_date)

            now = datetime.now(timezone.utc)
            first_dt, computed_last = _calculate_loop_span_dates(matched_entries, now)
            last_dt = max(computed_last, now)
            detection_count = len(detection_dates)

            cur.execute(
                """
                UPDATE loops
                SET first_detected_at = %s,
                    last_detected_at = %s,
                    detection_count = %s,
                    detection_dates = %s::jsonb,
                    matched_entries = %s::jsonb
                WHERE loop_id::text = %s AND user_id = %s
                """,
                (
                    first_dt, last_dt, detection_count,
                    Jsonb(detection_dates), Jsonb(matched_entries),
                    str(loop_id), user_id,
                ),
            )
        conn.commit()
    return True


def _analyze_loop_persistence(loop: dict[str, Any]) -> dict[str, Any]:
    """
    Analyze loop persistence to distinguish real loops from temporary states.
    Returns persistence analysis with recommendations.
    """
    detection_dates = loop.get("detection_dates", [])
    detection_count = loop.get("detection_count", 1)
    confidence_score = loop.get("confidence_score", 0.0)
    
    if not detection_dates or len(detection_dates) < 2:
        return {
            "is_persistent": False,
            "persistence_score": 0.0,
            "analysis": "insufficient_data",
            "recommendation": "collect_more_data"
        }
    
    try:
        # Parse dates and analyze temporal patterns
        parsed_dates = []
        for date_str in detection_dates:
            if isinstance(date_str, str):
                try:
                    parsed_dates.append(datetime.fromisoformat(date_str.replace('Z', '+00:00')))
                except:
                    continue
        
        if len(parsed_dates) < 2:
            return {
                "is_persistent": False,
                "persistence_score": 0.0,
                "analysis": "invalid_dates",
                "recommendation": "data_quality_issue"
            }
        
        parsed_dates.sort()
        
        # Calculate time spans
        total_span_days = (parsed_dates[-1] - parsed_dates[0]).days
        avg_gap_days = total_span_days / (len(parsed_dates) - 1) if len(parsed_dates) > 1 else 0
        
        # Analyze detection frequency
        recent_detections = sum(1 for date in parsed_dates if (datetime.now(timezone.utc) - date).days <= 30)
        detection_frequency = recent_detections / 30.0  # detections per month
        
        # Calculate persistence score
        temporal_score = min(total_span_days / 90.0, 1.0)  # 3+ months = max score
        frequency_score = min(detection_frequency / 4.0, 1.0)  # 4+ per month = max score
        consistency_score = 1.0 - (avg_gap_days / 30.0) if avg_gap_days < 30 else 0.0  # Consistent detection
        
        persistence_score = (temporal_score * 0.4 + frequency_score * 0.3 + consistency_score * 0.3)
        
        # Determine if persistent
        is_persistent = (
            persistence_score >= 0.6 and 
            total_span_days >= 14 and  # At least 2 weeks
            detection_count >= 3 and
            confidence_score >= 0.5
        )
        
        # Generate analysis
        if is_persistent:
            if persistence_score >= 0.8:
                analysis = "strongly_persistent"
                recommendation = "address_as_core_pattern"
            else:
                analysis = "moderately_persistent"
                recommendation = "monitor_closely"
        else:
            if total_span_days < 7:
                analysis = "temporary_state"
                recommendation = "observe_longer"
            elif detection_frequency < 0.5:
                analysis = "infrequent_pattern"
                recommendation = "collect_more_data"
            else:
                analysis = "emerging_pattern"
                recommendation = "monitor_for_confirmation"
        
        return {
            "is_persistent": is_persistent,
            "persistence_score": persistence_score,
            "total_span_days": total_span_days,
            "avg_gap_days": avg_gap_days,
            "detection_frequency": detection_frequency,
            "analysis": analysis,
            "recommendation": recommendation
        }
        
    except Exception as e:
        return {
            "is_persistent": False,
            "persistence_score": 0.0,
            "analysis": "error",
            "recommendation": "retry_analysis",
            "error": str(e)
        }


def _save_merged_loop_info(
    loop_info: list[dict[str, Any]], thread_id: str, user_id: int
) -> list[dict[str, Any]]:
    # NOTE on concurrency: this whole read -> merge-in-Python -> write cycle
    # now happens on ONE connection/transaction, and the initial SELECT takes
    # a row lock (FOR UPDATE) on this user's loops. Previously the read used
    # its own short-lived connection (committed/released immediately) and the
    # write used a second, separate autocommit connection -- leaving a window
    # where two turns for the same user (e.g. two open threads/tabs) could
    # both read the same "before" state, merge independently, and the second
    # write would silently clobber the first (lost update). Locking the rows
    # for the duration of this function serializes concurrent callers instead.
    #
    # We also now only write rows that were actually created or modified in
    # this call (`touched_ids`), instead of re-INSERT...ON CONFLICT-ing every
    # loop the user has on every single detection event. That upsert-all
    # pattern meant a chat turn that touched one loop was doing O(n) writes
    # against all of the user's stored loops -- wasteful and only getting
    # worse as loop counts grow.
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT loop_id, loop_name, core_belief, trigger, valence,
                       first_detected_at, last_detected_at, detection_count,
                       detection_dates, matched_entries, description, suggestion,
                       confidence_score, validation_metadata
                FROM loops
                WHERE user_id = %s
                FOR UPDATE
                """,
                (user_id,)
            )
            rows = cur.fetchall()

            thread_loops = []
            for row in rows:
                thread_loops.append({
                    "loop_id": str(row["loop_id"]),
                    "loop_name": row["loop_name"],
                    "core_belief": row["core_belief"],
                    "trigger": row["trigger"],
                    "valence": row["valence"],
                    "first_detected_at": row["first_detected_at"].isoformat() if row["first_detected_at"] else "",
                    "last_detected_at": row["last_detected_at"].isoformat() if row["last_detected_at"] else "",
                    "detection_count": row["detection_count"],
                    "detection_dates": row["detection_dates"] or [],
                    "matched_entries": row["matched_entries"] or [],
                    "description": row["description"],
                    "suggestion": row["suggestion"],
                    "thread_id": thread_id,
                    "confidence_score": float(row["confidence_score"]) if row["confidence_score"] is not None else 0.0,
                    "validation_metadata": row["validation_metadata"] or {},
                })

            now = datetime.now(timezone.utc).isoformat()
            touched_ids: set[str] = set()

            for new_loop in loop_info:
                new_loop["detected_at"] = now
                new_loop["thread_id"] = thread_id

                merged = False
                for i, existing in enumerate(thread_loops):
                    if _loops_match(existing, new_loop):
                        matched = new_loop.get("matched_entries", [])
                        thread_loops[i] = _merge_loop_records(existing, new_loop, matched)
                        touched_ids.add(thread_loops[i]["loop_id"])
                        merged = True
                        break

                if not merged:
                    new_matched = new_loop.get("matched_entries", [])
                    first_dt, last_dt = _calculate_loop_span_dates(new_matched, datetime.now(timezone.utc))
                    new_record = {
                        "loop_id": str(uuid4()),
                        "loop_name": new_loop.get("loop_name", ""),
                        "core_belief": new_loop.get("core_belief", ""),
                        "trigger": new_loop.get("trigger", ""),
                        "valence": new_loop.get("valence", "neutral"),
                        "first_detected_at": first_dt.isoformat(),
                        "last_detected_at": last_dt.isoformat(),
                        "detection_count": 1,
                        "detection_dates": [now],
                        "matched_entries": new_matched,
                        "description": new_loop.get("description", ""),
                        "suggestion": new_loop.get("suggestion", ""),
                        "thread_id": thread_id,
                        "confidence_score": new_loop.get("confidence", 0.0),
                        "validation_metadata": {
                            "temporal_span_days": (last_dt - first_dt).days,
                            "context_diversity": 0.0,
                            "total_matches": len(new_matched),
                            "validation_timestamp": now
                        }
                    }
                    thread_loops.append(new_record)
                    touched_ids.add(new_record["loop_id"])

            for loop in thread_loops:
                if loop["loop_id"] not in touched_ids:
                    continue  # unchanged this call -- nothing to write
                cur.execute(
                    """
                    INSERT INTO loops (
                        loop_id, thread_id, user_id, loop_name, core_belief, trigger,
                        valence, first_detected_at, last_detected_at, detection_count,
                        detection_dates, matched_entries, description, suggestion,
                        confidence_score, validation_metadata
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                    )
                    ON CONFLICT (loop_id) DO UPDATE SET
                        loop_name = EXCLUDED.loop_name,
                        core_belief = EXCLUDED.core_belief,
                        trigger = EXCLUDED.trigger,
                        valence = EXCLUDED.valence,
                        first_detected_at = EXCLUDED.first_detected_at,
                        last_detected_at = EXCLUDED.last_detected_at,
                        detection_count = EXCLUDED.detection_count,
                        detection_dates = EXCLUDED.detection_dates,
                        matched_entries = EXCLUDED.matched_entries,
                        description = EXCLUDED.description,
                        suggestion = EXCLUDED.suggestion,
                        confidence_score = EXCLUDED.confidence_score,
                        validation_metadata = EXCLUDED.validation_metadata
                    """,
                    (
                        loop["loop_id"], thread_id, user_id, loop["loop_name"],
                        loop["core_belief"], loop["trigger"], loop["valence"],
                        _parse_created_at(loop["first_detected_at"]),
                        _parse_created_at(loop["last_detected_at"]),
                        loop["detection_count"], Jsonb(loop["detection_dates"]),
                        Jsonb(loop["matched_entries"]), loop["description"],
                        loop["suggestion"],
                        loop.get("confidence_score", 0.0),
                        Jsonb(loop.get("validation_metadata", {}))
                    )
                )

        conn.commit()

    return thread_loops


def remove_thread_from_loops(user_id: int, thread_id: str) -> dict[str, Any]:
    """Strips a deleted thread's matched entries out of every loop that
    referenced it, then re-checks each affected loop against the same bar
    used at detection time (_validate_cross_thread_loop_recurrence: at
    least 2 distinct threads AND at least 3 total matches AND >=1 day
    span). Loops that no longer clear that bar are deleted outright;
    loops that still clear it are updated in place with the smaller
    matched_entries list and recomputed span/detection_count.

    Note: `detection_dates` has no per-entry thread association in the
    schema, so it can't be precisely filtered the way matched_entries
    can. To keep the loop's reported strength/occurrences consistent
    with what's actually still backing it, detection_count is set to
    len(remaining matched_entries) rather than trusting the old
    detection_dates length, which may now overcount.

    Called from thread_service.delete_thread_everywhere as part of
    thread deletion. Safe to call even if the thread never contributed
    to any loop -- affected loops are found by scanning matched_entries,
    so unrelated loops are left untouched.

    Returns {"updated": [...loop_ids...], "deleted": [...loop_ids...]}.
    """
    updated: list[str] = []
    deleted: list[str] = []
    now = datetime.now(timezone.utc)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT loop_id, matched_entries, last_detected_at
                FROM loops
                WHERE user_id = %s
                FOR UPDATE
                """,
                (user_id,),
            )
            rows = cur.fetchall()

            for row in rows:
                matched_entries = row.get("matched_entries") or []
                if not isinstance(matched_entries, list):
                    continue

                had_thread = any(
                    isinstance(e, dict) and str(e.get("thread_id") or "") == str(thread_id)
                    for e in matched_entries
                )
                if not had_thread:
                    continue  # this loop wasn't touched by the deleted thread

                remaining = [
                    e for e in matched_entries
                    if not (isinstance(e, dict) and str(e.get("thread_id") or "") == str(thread_id))
                ]

                remaining_thread_ids = {
                    str(e.get("thread_id")) for e in remaining
                    if isinstance(e, dict) and e.get("thread_id")
                }

                still_valid = len(remaining_thread_ids) >= 2 and len(remaining) >= 3
                if still_valid:
                    dates = [e.get("date", "") for e in remaining if isinstance(e, dict) and e.get("date")]
                    parsed_dates = []
                    for d in dates:
                        try:
                            parsed_dates.append(datetime.fromisoformat(str(d).replace("Z", "+00:00")))
                        except Exception:
                            continue
                    if len(parsed_dates) >= 2:
                        parsed_dates.sort()
                        span_days = (parsed_dates[-1] - parsed_dates[0]).days
                        still_valid = span_days >= 1
                    else:
                        still_valid = False

                loop_id = row["loop_id"]

                if not still_valid:
                    cur.execute(
                        "DELETE FROM loops WHERE loop_id = %s AND user_id = %s",
                        (loop_id, user_id),
                    )
                    deleted.append(str(loop_id))
                    continue

                default_last = row.get("last_detected_at") or now
                first_dt, last_dt = _calculate_loop_span_dates(remaining, default_last)
                detection_count = len(remaining)

                cur.execute(
                    """
                    UPDATE loops
                    SET matched_entries = %s::jsonb,
                        detection_count = %s,
                        first_detected_at = %s,
                        last_detected_at = %s
                    WHERE loop_id = %s AND user_id = %s
                    """,
                    (Jsonb(remaining), detection_count, first_dt, last_dt, loop_id, user_id),
                )
                updated.append(str(loop_id))

        conn.commit()

    return {"updated": updated, "deleted": deleted}


def reflect_on_loop(user_id: int, loop_id: str) -> dict[str, Any]:
    """Create a new thread for reflecting on a specific loop with an AI-generated opening message."""
    print(f"reflect_on_loop called: user_id={user_id}, loop_id={loop_id}")
    
    # Fetch the loop details
    loop = get_loop(user_id, loop_id)
    if not loop:
        print(f"Loop not found: {loop_id}")
        return None

    print(f"Loop found: {loop.get('name', 'unknown')}")

    # Build context-rich prompt for NextMate
    loop_name = loop.get("name", "")
    core_belief = loop.get("core_belief", "")
    trigger = loop.get("trigger", "")
    description = loop.get("description", "")
    suggestion = loop.get("suggestion", "")
    valence = loop.get("valence", "neutral")
    detection_count = loop.get("occurrences", 0)
    first_detected = loop.get("first_detected_at", "")
    last_detected = loop.get("last_detected_at", "")
    
    # Get 2-3 recent matched entries as examples
    entries = loop.get("entries", [])[:3]
    examples_text = ""
    if entries:
        examples_text = "\nRecent examples:\n"
        for entry in entries:
            examples_text += f"- {entry.get('date', '')}: {entry.get('summary', '')}\n"

    # Build the prompt
    system_prompt = """You are NextMate — a real friend, not a chatbot cosplaying as one.

You're the friend who texts back in 2 lines, says the thing nobody else will, and somehow makes it land. Sharp, warm, a little sarcastic. You react like a person, not a case worker.

How you talk:
- 1-2 lines. 3 max if it genuinely needs it.
- React first. "wait who did WHAT" before anything else.
- Ask questions like you're digging for tea, not filing a report.
- If they're mad, be mad with them. If they're funny, be funny back. Match the energy.
- Don't end every message with a question. Sometimes "yeah that tracks" is the whole reply.
- Be specific to what they said. Generic = you weren't listening.
- DO NOT restate, paraphrase, or summarize the user's latest message in your opening line.

What you NEVER say:
Banned phrases — use these and you're fired:
- "It sounds like..." 
- "I hear you saying..."
- "That urge suggests..."
- "Your [anything] is telling you..."
- "alarm bell", "toolkit", "safe space", "that must be hard"
- Any sentence that starts with "It seems like you're feeling"

Banned behavior:
- Do NOT restate what they just said and then ask a question.
- Do NOT analyze one-word replies.
- No medical metaphors. No body-scan questions.
- No poetic lines.

Only exception:
Crisis or self-harm → drop everything. Go warm, go direct, no jokes. Suggest real help immediately."""

    user_prompt = f"""The user wants to reflect on a pattern they've identified:
- Pattern: {loop_name}
- Core belief: {core_belief}
- Trigger: {trigger}
- Description: {description}
- Suggestion: {suggestion}
- Valence: {valence}
- Seen {detection_count} times since {first_detected}
- Last seen: {last_detected}
{examples_text}

Generate a natural, conversational opening that acknowledges this pattern and asks a specific, relevant question about it. Stay in character - casual, sharp, not clinical. Keep it to 1-2 lines maximum."""

    # Call NextMate to generate the opening message
    opening_message = None
    try:
        print("Calling LLM for opening message...")
        llm = get_chat_model()
        response, _ = invoke_with_logging(
            llm,
            [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "loop_reflection",
            loop_id,
        )
        opening_message = str(response).strip()
        print(f"LLM generated message: {opening_message[:50]}...")
    except Exception as e:
        # Fallback if LLM fails
        print(f"LLM failed for loop reflection: {e}")
        opening_message = f"I see you want to talk about {loop_name}. What's on your mind?"
    
    # Ensure we always have a message
    if not opening_message:
        print("Opening message was None, using fallback")
        opening_message = f"I see you want to talk about {loop_name}. What's on your mind?"
    
    print(f"Final opening message: {opening_message}")

    # Create a new thread with loop context (inline to avoid circular import)
    thread_id = str(uuid.uuid4())
    thread_title = f"Reflecting on: {loop_name}"
    
    now = utc_now()
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO threads (thread_id, user_id, title, loop_id, last_reflected_at, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (thread_id, user_id, thread_title, loop_id, now, now, now),
            )
            cur.execute(
                """
                INSERT INTO thread_messages (user_id, thread_id, role, content, created_at)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (user_id, thread_id, "assistant", opening_message, now),
            )
        conn.commit()

    return {
        "thread_id": thread_id,
        "title": thread_title,
        "opening_message": opening_message,
        "loop_id": loop_id,
    }

def reopen_loop(loop_id: str, user_id: int) -> bool:
    """Bumps last_detected_at to now, for the case where a loop resurfaces
    in conversation with no new matched journal entry backing it (e.g. the
    resurface-check in choose_response_mode_node). Deliberately does NOT
    touch matched_entries/first_detected_at via _calculate_loop_span_dates
    -- that function derives last_detected_at from matched_entries' own
    dates, which would just recompute back to the old date when there's
    nothing new to add, silently no-opping the reopen.

    See append_loop_entry() above for the counterpart that DOES attach a
    matched_entries record, once persist_summary_node has actually created
    the turn's journal entry later in the graph.

    FIX: loop_id arrives here as a plain Python str (e.g. from
    stored.get("loop_id"), which load_memory_node populates via
    str(row["loop_id"])), but the `loop_id` column is a UUID column.
    Every other loop_id-scoped query in this file (get_loop,
    mark_resolved) casts the column with `loop_id::text = %s` to compare
    it against that str safely -- this function was missing that cast on
    both the SELECT and UPDATE, so the WHERE clause silently matched no
    rows, fetchone() returned None, and this returned False without ever
    raising or logging. Added the same ::text cast used everywhere else
    in this module.
    """
    now = datetime.now(timezone.utc)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT detection_dates FROM loops
                WHERE loop_id::text = %s AND user_id = %s
                FOR UPDATE
                """,
                (str(loop_id), user_id),
            )
            row = cur.fetchone()
            print(f"[reopen_loop] DEBUG loop_id={loop_id!r} user_id={user_id!r} found_row={row is not None}", flush=True)
            if not row:
                return False

            detection_dates = row.get("detection_dates") or []
            now_iso = now.isoformat()
            if now_iso not in detection_dates:
                detection_dates.append(now_iso)

            cur.execute(
                """
                UPDATE loops
                SET last_detected_at = %s,
                    detection_dates = %s::jsonb,
                    detection_count = %s
                WHERE loop_id::text = %s AND user_id = %s
                """,
                (now, Jsonb(detection_dates), len(detection_dates), str(loop_id), user_id),
            )
            print(f"[reopen_loop] DEBUG rowcount={cur.rowcount} new_last_detected_at={now.isoformat()} new_detection_count={len(detection_dates)}", flush=True)
        conn.commit()
        print(f"[reopen_loop] DEBUG committed", flush=True)
    return True