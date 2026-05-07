from datetime import datetime, timezone
import json
from typing import Any
from uuid import uuid4
from langchain_core.runnables import RunnableConfig
from psycopg.types.json import Jsonb

from apps.db import get_connection
from nextmate_agent.utils.config import get_settings
from nextmate_agent.utils.llm import get_chat_model, parse_json_object, invoke_with_logging
from nextmate_agent.utils.node_logger import log_node
from nextmate_agent.utils.prompts import (
    CHAT_SYSTEM_PROMPT,
    LOOP_COMPARISON_SYSTEM_PROMPT,
    LOOP_DETECTION_SYSTEM_PROMPT,
    LOOP_RESURFACE_CHECK_SYSTEM_PROMPT,
    SUMMARY_SYSTEM_PROMPT,
    _RESPONSE_MODES,
    build_chat_user_prompt,
    build_loop_comparison_prompt,
    build_loop_detection_prompt,
    build_loop_resurface_check_prompt,
    build_mode_selection_prompt,
    build_summary_user_prompt,
)
from nextmate_agent.utils.state import NextMateState

def _thread_id_from_config(config: RunnableConfig | None) -> str:
    if not config:
        return "default"
    configurable = config.get("configurable", {})
    thread_id = configurable.get("thread_id", "default")
    return str(thread_id)

def _user_id_from_config(config: RunnableConfig | None) -> int:
    if not config:
        return -1
    configurable = config.get("configurable", {})
    try:
        return int(configurable.get("user_id", -1))
    except (TypeError, ValueError):
        return -1

def _parse_created_at(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc)
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value).astimezone(timezone.utc)
        except ValueError:
            pass
    return datetime.now(timezone.utc)


def load_memory_node(state: NextMateState, config: RunnableConfig) -> NextMateState:
    settings = get_settings()
    thread_id = _thread_id_from_config(config)
    user_id = _user_id_from_config(config)
    
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT core_theme, mood, core_beliefs, triggers, key_facts, intensity, created_at
                FROM (
                    SELECT core_theme, mood, core_beliefs, triggers, key_facts, intensity, created_at
                    FROM journal_entries_v2
                    WHERE user_id = %s AND thread_id = %s
                    ORDER BY created_at DESC
                    LIMIT %s
                ) recent_entries
                ORDER BY created_at ASC
                """,
                (user_id, thread_id, settings.memory_window),
            )
            rows = cur.fetchall()

    thread_entries = []
    for row in rows:
        thread_entries.append({
            "core_theme": str(row["core_theme"]),
            "summary": str(row["core_theme"]),
            "mood": str(row["mood"]),
            "core_beliefs": row["core_beliefs"],
            "triggers": row["triggers"],
            "key_facts": row["key_facts"],
            "intensity": int(row["intensity"]) if row["intensity"] is not None else 5,
            "created_at": row["created_at"].isoformat() if hasattr(row["created_at"], "isoformat") else str(row["created_at"]),
        })

    stored_loops = []
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT loop_id, loop_name, core_belief, trigger, valence,
                       first_detected_at, last_detected_at, detection_count,
                       description, suggestion, confidence_score, validation_metadata
                FROM loops
                WHERE user_id = %s
                ORDER BY last_detected_at DESC
                """,
                (user_id,),
            )
            rows = cur.fetchall()

    for row in rows:
        stored_loops.append({
            "loop_id": str(row["loop_id"]),
            "loop_name": str(row["loop_name"]),
            "core_belief": str(row["core_belief"]),
            "trigger": str(row["trigger"]),
            "valence": str(row["valence"]),
            "first_detected_at": row["first_detected_at"].isoformat() if hasattr(row["first_detected_at"], "isoformat") else str(row["first_detected_at"]),
            "last_detected_at": row["last_detected_at"].isoformat() if hasattr(row["last_detected_at"], "isoformat") else str(row["last_detected_at"]),
            "detection_count": int(row["detection_count"]) if row["detection_count"] else 1,
            "description": str(row["description"]),
            "suggestion": str(row["suggestion"]),
            "confidence_score": float(row["confidence_score"]) if row["confidence_score"] is not None else 0.0,
            "validation_metadata": row["validation_metadata"] or {},
        })

    log_node(
        thread_id=thread_id,
        node_name="load_memory",
        inputs={"user_input": state.get("user_input", "")},
        outputs={"memory_entries_count": len(thread_entries), "stored_loops_count": len(stored_loops), "thread_id": thread_id},
    )
    return {"memory_entries": thread_entries, "thread_id": thread_id, "stored_loops": stored_loops}


def build_memory_context_node(state: NextMateState) -> NextMateState:
    settings = get_settings()
    thread_id = state.get("thread_id", "default")
    entries = state.get("memory_entries", [])
    window = entries[-settings.memory_window :]

    if not window:
        memory_context = "No prior memory available yet."
    else:
        lines: list[str] = []
        for item in window:
            summary = item.get("summary", "") or item.get("core_theme", "")
            mood = item.get("mood", "unknown")
            created_at = item.get("created_at", "")
            beliefs = item.get("core_beliefs", [])
            triggers = item.get("triggers", [])
            if not beliefs and not triggers:
                old_patterns = item.get("patterns", [])
                if old_patterns:
                    beliefs = old_patterns
            facts = item.get("key_facts", [])

            line = f"- ({created_at}) mood={mood}: {summary}"
            if beliefs:
                line += f" | beliefs: {', '.join(beliefs)}"
            if triggers:
                line += f" | triggers: {', '.join(triggers)}"
            if facts:
                line += f" | facts: {', '.join(facts)}"
            lines.append(line)

        memory_context = "\n".join(lines)

    stored_loops = state.get("stored_loops", [])
    if stored_loops:
        loop_lines = ["\nPreviously identified patterns:"]
        for loop in stored_loops:
            loop_lines.append(
                f"- {loop['loop_name']} ({loop['valence']}, seen {loop['detection_count']}x): {loop['description']}"
            )
        memory_context += "\n" + "\n".join(loop_lines)

    log_node(
        thread_id=thread_id,
        node_name="build_memory_context",
        inputs={"total_entries": len(entries), "window_size": settings.memory_window, "used_entries": len(window)},
        outputs={"memory_context": memory_context},
    )
    return {"memory_context": memory_context}


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
    Retrieve all memory entries for a user across all threads except the current one.
    """
    with get_connection(autocommit=True) as conn:
        with conn.cursor() as cur:
            # Get entries from journal_entries_v2 across all threads for this user
            cur.execute(
                """
                SELECT 
                    user_input,
                    assistant_reply,
                    core_theme,
                    mood,
                    core_beliefs,
                    triggers,
                    key_facts,
                    next_focus,
                    intensity,
                    created_at,
                    thread_id
                FROM journal_entries_v2 
                WHERE user_id = %s AND thread_id != %s
                ORDER BY created_at DESC
                LIMIT 100
                """,
                (user_id, current_thread_id)
            )
            cross_thread_entries = []
            for row in cur.fetchall():
                cross_thread_entries.append({
                    "user_input": row["user_input"],
                    "assistant_reply": row["assistant_reply"],
                    "core_theme": row["core_theme"],
                    "mood": row["mood"],
                    "core_beliefs": row["core_beliefs"] or [],
                    "triggers": row["triggers"] or [],
                    "key_facts": row["key_facts"] or [],
                    "next_focus": row["next_focus"],
                    "intensity": row["intensity"],
                    "created_at": row["created_at"].isoformat(),
                    "thread_id": row["thread_id"]
                })
            
            # Also check legacy journal_entries for backwards compatibility
            cur.execute(
                """
                SELECT 
                    user_input,
                    assistant_reply,
                    summary,
                    mood,
                    signals,
                    next_focus,
                    created_at,
                    thread_id
                FROM journal_entries 
                WHERE user_id = %s AND thread_id != %s
                ORDER BY created_at DESC
                LIMIT 50
                """,
                (user_id, current_thread_id)
            )
            for row in cur.fetchall():
                # Convert legacy format to match v2 structure
                cross_thread_entries.append({
                    "user_input": row["user_input"],
                    "assistant_reply": row["assistant_reply"],
                    "core_theme": row["summary"],  # Map summary to core_theme
                    "mood": row["mood"],
                    "core_beliefs": [],  # Not available in legacy
                    "triggers": [],  # Not available in legacy
                    "key_facts": row["signals"] or [],  # Map signals to key_facts
                    "next_focus": row["next_focus"],
                    "intensity": 5,  # Default intensity
                    "created_at": row["created_at"].isoformat(),
                    "thread_id": row["thread_id"]
                })
    
    return cross_thread_entries


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
    
    matches: list[dict[str, Any]] = []
    for entry in all_entries:
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
            })
    
    # Check if we have matches across multiple threads
    thread_ids = set(m.get("thread_id", "") for m in matches if m.get("thread_id"))
    
    # Require at least 2 different threads and 3 total matches
    if len(thread_ids) < 2 or len(matches) < 3:
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
                }
            )
    return matches


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

    return {
        "loop_id": existing.get("loop_id"),
        "loop_name": existing.get("loop_name") or new.get("loop_name", ""),
        "core_belief": existing.get("core_belief", new.get("core_belief", "")),
        "trigger": existing.get("trigger", new.get("trigger", "")),
        "valence": existing.get("valence", new.get("valence", "neutral")),
        "first_detected_at": existing.get("first_detected_at", existing.get("detected_at", new.get("detected_at", ""))),
        "last_detected_at": new.get("detected_at", ""),
        "detection_count": detection_count,
        "detection_dates": detection_dates,
        "matched_entries": merged_entries,
        "description": new.get("description") or existing.get("description", ""),
        "suggestion": new.get("suggestion") or existing.get("suggestion", ""),
        "thread_id": existing.get("thread_id", new.get("thread_id", "default")),
    }


def _update_loop_last_seen(loop: dict[str, Any], user_id: int) -> None:
    loop_id = loop.get("loop_id")
    if not loop_id:
        return
    now = datetime.now(timezone.utc)
    with get_connection(autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE loops
                SET last_detected_at = %s,
                    detection_count = detection_count + 1,
                    detection_dates = detection_dates || %s::jsonb
                WHERE loop_id = %s AND user_id = %s
                """,
                (now, Jsonb([now.isoformat()]), loop_id, user_id),
            )


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
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT loop_id, loop_name, core_belief, trigger, valence,
                       first_detected_at, last_detected_at, detection_count,
                       detection_dates, matched_entries, description, suggestion,
                       confidence_score, validation_metadata
                FROM loops
                WHERE user_id = %s AND thread_id = %s
                """,
                (user_id, thread_id)
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
    for new_loop in loop_info:
        new_loop["detected_at"] = now
        new_loop["thread_id"] = thread_id

        merged = False
        for i, existing in enumerate(thread_loops):
            if _loops_match(existing, new_loop):
                matched = new_loop.get("matched_entries", [])
                thread_loops[i] = _merge_loop_records(existing, new_loop, matched)
                merged = True
                break

        if not merged:
            new_record = {
                "loop_id": str(uuid4()),
                "loop_name": new_loop.get("loop_name", ""),
                "core_belief": new_loop.get("core_belief", ""),
                "trigger": new_loop.get("trigger", ""),
                "valence": new_loop.get("valence", "neutral"),
                "first_detected_at": now,
                "last_detected_at": now,
                "detection_count": 1,
                "detection_dates": [now],
                "matched_entries": new_loop.get("matched_entries", []),
                "description": new_loop.get("description", ""),
                "suggestion": new_loop.get("suggestion", ""),
                "thread_id": thread_id,
                "confidence_score": new_loop.get("confidence", 0.0),
                "validation_metadata": {
                    "temporal_span_days": 0,
                    "context_diversity": 0.0,
                    "total_matches": len(new_loop.get("matched_entries", [])),
                    "validation_timestamp": now
                }
            }
            thread_loops.append(new_record)

    with get_connection(autocommit=True) as conn:
        with conn.cursor() as cur:
            for loop in thread_loops:
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

    return thread_loops


def detect_loops_node(state: NextMateState, config: RunnableConfig) -> NextMateState:
    llm = get_chat_model()
    thread_id = state.get("thread_id", "default")
    user_id = _user_id_from_config(config)
    user_input = state.get("user_input", "")
    entries = state.get("memory_entries", [])
    stored_loops = state.get("stored_loops", [])

    if len(entries) < 2:
        log_node(
            thread_id=thread_id,
            node_name="detect_loops",
            inputs={"user_input": user_input, "memory_entries_count": len(entries)},
            outputs={"detected_loops": "(skipped — not enough history)"},
        )
        return {"detected_loops": ""}

    # Get cross-thread entries for analysis
    cross_thread_entries = _get_cross_thread_memory_entries(user_id, thread_id)
    
    content = build_loop_detection_prompt(
        user_input=user_input,
        memory_entries=entries,
    )
    raw, usage = invoke_with_logging(
        llm,
        [
            {"role": "system", "content": LOOP_DETECTION_SYSTEM_PROMPT},
            {"role": "user", "content": content},
        ],
        "detect_loops",
        thread_id,
    )

    loops_data = parse_json_object(raw if isinstance(raw, str) else "")

    if not loops_data.get("loops_found", False):
        log_node(
            thread_id=thread_id,
            node_name="detect_loops",
            inputs={"user_input": user_input, "memory_entries_count": len(entries), "cross_thread_entries_count": len(cross_thread_entries), "prompt": content},
            outputs={"detected_loops": "(none found)", "raw_llm_response": raw},
        )
        return {"detected_loops": "", "response_mode": "", "loop_info": []}

    loops_text: list[str] = []
    new_loop_info: list[dict[str, Any]] = []
    matched_existing_info: list[dict[str, Any]] = []

    for loop in loops_data.get("loops", []):
        valence = loop.get("valence", "neutral")
        name = loop.get("pattern_name", "unknown pattern")
        desc = loop.get("description", "")
        suggestion = loop.get("suggestion", "")
        evidence = loop.get("evidence", [])
        
        core_belief = loop.get("core_belief", "")
        trigger = loop.get("trigger", "")
        
        # Apply cross-thread validation - only show loop alerts if pattern matches across threads
        is_valid, validated_matches, confidence = _validate_cross_thread_loop_recurrence(
            core_belief, trigger, entries, cross_thread_entries
        )
        
        if not is_valid or confidence < 0.7:  # Higher threshold for cross-thread loops
            log_node(
                thread_id=thread_id,
                node_name="detect_loops_cross_thread_validation",
                inputs={
                    "loop_name": name, 
                    "confidence": confidence, 
                    "matches": len(validated_matches),
                    "cross_thread_entries_count": len(cross_thread_entries)
                },
                outputs={"status": "rejected - insufficient cross-thread evidence"},
            )
            continue

        matched_existing = False
        matched_loop_name = ""

        if stored_loops:
            comparison_prompt = build_loop_comparison_prompt(loop, stored_loops)
            comparison_raw, comparison_usage = invoke_with_logging(
                llm,
                [
                    {"role": "system", "content": LOOP_COMPARISON_SYSTEM_PROMPT},
                    {"role": "user", "content": comparison_prompt},
                ],
                "detect_loops_comparison",
                thread_id,
            )
            comparison = parse_json_object(comparison_raw if isinstance(comparison_raw, str) else "")
            if comparison.get("is_similar") and comparison.get("matched_loop_name"):
                matched_existing = True
                matched_loop_name = comparison.get("matched_loop_name", "")

        if matched_existing and matched_loop_name:
            for stored in stored_loops:
                if stored.get("loop_name") == matched_loop_name:
                    _update_loop_last_seen(stored, user_id)
                    loops_text.append(
                        f"- [MATCHED EXISTING] {stored.get('loop_name', matched_loop_name)}: recurring pattern detected again (confidence: {confidence:.2f})"
                    )
                    matched_existing_info.append({
                        "loop_name": stored.get("loop_name", matched_loop_name),
                        "core_belief": stored.get("core_belief", ""),
                        "trigger": stored.get("trigger", ""),
                        "valence": stored.get("valence", "neutral"),
                        "matched_entries": validated_matches,
                        "confidence": confidence,
                    })
                    break
            continue

        # Count threads in validated matches for cross-thread indication
        thread_ids = set(m.get("thread_id", "") for m in validated_matches if m.get("thread_id"))
        thread_count = len(thread_ids)
        
        if thread_count > 1:
            loops_text.append(f"- [{valence.upper()} CROSS-THREAD LOOP] {name}: {desc} (confidence: {confidence:.2f}, across {thread_count} threads)")
        else:
            loops_text.append(f"- [{valence.upper()} LOOP] {name}: {desc} (confidence: {confidence:.2f})")
            
        if evidence:
            loops_text.append(f"  evidence: {', '.join(evidence)}")
        if suggestion:
            loops_text.append(f"  suggestion: {suggestion}")
        if thread_count > 1:
            loops_text.append(f"  🔄 Cross-thread pattern detected across {thread_count} different conversations")

        if validated_matches:
            new_loop_info.append(
                {
                    "loop_name": name,
                    "core_belief": core_belief,
                    "trigger": trigger,
                    "valence": valence,
                    "matched_entries": validated_matches,
                    "confidence": confidence,
                    "thread_count": thread_count,
                    "is_cross_thread": thread_count > 1,
                }
            )

    reflection = loops_data.get("reflection_prompt", "")
    detected = "\n".join(loops_text)
    if reflection:
        detected += f"\n\nReflection angle: {reflection}"

    if new_loop_info:
        _save_merged_loop_info(new_loop_info, thread_id, user_id)
        response_mode = "loop_alert"
    elif matched_existing_info:
        response_mode = "pattern_reflect"
    else:
        response_mode = ""

    log_node(
        thread_id=thread_id,
        node_name="detect_loops",
        inputs={"user_input": user_input, "memory_entries_count": len(entries), "prompt": content},
        outputs={
            "detected_loops": detected,
            "loops_data": loops_data,
            "new_loop_info": new_loop_info,
            "matched_existing_info": matched_existing_info,
            "response_mode": response_mode,
        },
        extra={"raw_llm_response": raw},
    )
    return {
        "detected_loops": detected,
        "loop_info": new_loop_info + matched_existing_info,
        "response_mode": response_mode,
    }


MODE_SELECTION_SYSTEM_PROMPT = """
You are a routing classifier. Your job is to pick the single best response mode for a user message.
Return ONLY the exact mode name from the provided list. No explanation, no markdown.
""".strip()


def choose_response_mode_node(state: NextMateState) -> NextMateState:
    thread_id = state.get("thread_id", "default")
    user_input = state.get("user_input", "")
    memory_context = state.get("memory_context", "No prior memory available yet.")
    detected_loops = state.get("detected_loops", "")
    existing_mode = state.get("response_mode", "")
    stored_loops = state.get("stored_loops", [])

    if existing_mode in ("loop_alert", "pattern_reflect") and detected_loops:
        log_node(
            thread_id=thread_id,
            node_name="choose_response_mode",
            inputs={"user_input": user_input, "memory_context": memory_context, "detected_loops": detected_loops},
            outputs={"response_mode": existing_mode},
            extra={"reason": f"loop detected — mode locked by detect_loops_node ({existing_mode})"},
        )
        return {"response_mode": existing_mode}

    chat_history = state.get("chat_history", [])
    if stored_loops and user_input and not chat_history:
        llm = get_chat_model()
        resurface_prompt = build_loop_resurface_check_prompt(user_input, stored_loops)
        resurface_raw, resurface_usage = invoke_with_logging(
            llm,
            [
                {"role": "system", "content": LOOP_RESURFACE_CHECK_SYSTEM_PROMPT},
                {"role": "user", "content": resurface_prompt},
            ],
            "choose_response_mode_resurface",
            thread_id,
        )
        resurface_result = parse_json_object(resurface_raw if isinstance(resurface_raw, str) else "")

        if resurface_result.get("matches_loop") and resurface_result.get("matched_loop_name"):
            matched_name = resurface_result["matched_loop_name"]
            reason = resurface_result.get("reason", "")
            matched_loop_text = f"- [RESURFACED PATTERN] {matched_name}: {reason}"

            log_node(
                thread_id=thread_id,
                node_name="choose_response_mode",
                inputs={"user_input": user_input, "memory_context": memory_context, "stored_loops_count": len(stored_loops)},
                outputs={"response_mode": "pattern_reflect", "detected_loops": matched_loop_text},
                extra={"reason": f"LLM resurface check matched: {matched_name}", "raw_llm_response": resurface_raw},
            )
            return {"response_mode": "pattern_reflect", "detected_loops": matched_loop_text}

    llm = get_chat_model()
    content = build_mode_selection_prompt(
        user_input=user_input,
        memory_context=memory_context,
        detected_loops=detected_loops,
        stored_loops=stored_loops,
    )
    raw, usage = invoke_with_logging(
        llm,
        [
            {"role": "system", "content": MODE_SELECTION_SYSTEM_PROMPT},
            {"role": "user", "content": content},
        ],
        "choose_response_mode",
        thread_id,
    )

    raw_text = (raw if isinstance(raw, str) else "").strip().lower()
    chosen_mode = ""
    for mode in _RESPONSE_MODES:
        if mode in raw_text:
            chosen_mode = mode
            break
    if not chosen_mode:
        chosen_mode = raw_text.split()[0] if raw_text else "validate"

    log_node(
        thread_id=thread_id,
        node_name="choose_response_mode",
        inputs={"user_input": user_input, "memory_context": memory_context, "detected_loops": detected_loops, "prompt": content},
        outputs={"response_mode": chosen_mode},
        extra={"raw_llm_response": raw},
    )
    return {"response_mode": chosen_mode}


def generate_reply_node(state: NextMateState) -> NextMateState:
    llm = get_chat_model()
    thread_id = state.get("thread_id", "default")
    user_input = state.get("user_input", "")
    memory_context = state.get("memory_context", "No prior memory available yet.")
    recent_history = state.get("chat_history", [])[-16:]
    history_context = "\n".join(
        [f"- {message.get('role', 'unknown')}: {message.get('content', '')}" for message in recent_history]
    )
    if not history_context:
        history_context = "No previous messages in this thread yet."

    detected_loops = state.get("detected_loops", "")
    stored_loops = state.get("stored_loops", [])
    response_mode = state.get("response_mode", "")

    content = build_chat_user_prompt(
        user_input=user_input,
        memory_context=memory_context,
        history_context=history_context,
        detected_loops=detected_loops,
        stored_loops=stored_loops,
        response_mode=response_mode,
    )
    reply, usage = invoke_with_logging(
        llm,
        [
            {"role": "system", "content": CHAT_SYSTEM_PROMPT},
            {"role": "user", "content": content},
        ],
        "generate_reply",
        thread_id,
    )

    assistant_reply = (reply or "").strip()
    log_node(
        thread_id=thread_id,
        node_name="generate_reply",
        inputs={
            "user_input": user_input,
            "memory_context": memory_context,
            "history_context": history_context,
            "detected_loops": detected_loops,
            "response_mode": response_mode,
            "prompt": content,
        },
        outputs={
            "assistant_reply": assistant_reply,
            "chat_history_update": [
                {"role": "user", "content": user_input},
                {"role": "assistant", "content": assistant_reply},
            ],
        },
        extra={"system_prompt": CHAT_SYSTEM_PROMPT, "raw_llm_response": reply},
    )
    return {
        "assistant_reply": assistant_reply,
        "chat_history": [
            {"role": "user", "content": user_input},
            {"role": "assistant", "content": assistant_reply},
        ],
    }


def summarize_turn_node(state: NextMateState) -> NextMateState:
    llm = get_chat_model()
    thread_id = state.get("thread_id", "default")
    user_input = state.get("user_input", "")
    assistant_reply = state.get("assistant_reply", "")

    content = build_summary_user_prompt(user_input=user_input, assistant_reply=assistant_reply)
    raw, usage = invoke_with_logging(
        llm,
        [
            {"role": "system", "content": SUMMARY_SYSTEM_PROMPT},
            {"role": "user", "content": content},
        ],
        "summarize_turn",
        thread_id,
    )

    summary = parse_json_object(raw if isinstance(raw, str) else "")
    summary["created_at"] = datetime.now(timezone.utc).isoformat()
    log_node(
        thread_id=thread_id,
        node_name="summarize_turn",
        inputs={"user_input": user_input, "assistant_reply": assistant_reply, "prompt": content},
        outputs={"turn_summary": summary},
        extra={"system_prompt": SUMMARY_SYSTEM_PROMPT, "raw_llm_response": raw},
    )
    return {"turn_summary": summary}


def persist_summary_node(state: NextMateState, config: RunnableConfig) -> NextMateState:
    thread_id = _thread_id_from_config(config)
    user_id = _user_id_from_config(config)
    user_input = str(state.get("user_input", ""))
    assistant_reply = str(state.get("assistant_reply", ""))
    summary = dict(state.get("turn_summary", {}))

    if not summary:
        return {}

    created_at = _parse_created_at(summary.get("created_at"))
    mood = str(summary.get("mood", "unknown")).strip() or "unknown"
    core_theme = str(summary.get("core_theme", "")).strip()
    next_focus = str(summary.get("next_focus", "")).strip()

    core_beliefs = summary.get("core_beliefs", [])
    if not isinstance(core_beliefs, list):
        core_beliefs = []

    triggers = summary.get("triggers", [])
    if not isinstance(triggers, list):
        triggers = []

    key_facts = summary.get("key_facts", [])
    if not isinstance(key_facts, list):
        key_facts = []

    intensity = summary.get("intensity")
    try:
        intensity = int(intensity) if intensity is not None else 5
    except (ValueError, TypeError):
        intensity = 5
    if intensity < 1 or intensity > 10:
        intensity = max(1, min(10, intensity))

    with get_connection(autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO journal_entries_v2 (
                    user_id, thread_id, user_input, assistant_reply, core_theme, mood,
                    core_beliefs, triggers, key_facts, next_focus, intensity, raw_summary, created_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    user_id, thread_id, user_input, assistant_reply, core_theme, mood,
                    Jsonb(core_beliefs), Jsonb(triggers), Jsonb(key_facts), next_focus,
                    intensity, Jsonb(summary), created_at
                )
            )

    log_node(
        thread_id=thread_id,
        node_name="persist_summary",
        inputs={"turn_summary": summary},
        outputs={"persisted": True},
    )
    return {}
