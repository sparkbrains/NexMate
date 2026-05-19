import logging
from datetime import datetime, timezone
from typing import Any

from psycopg.types.json import Jsonb

from apps.db import get_connection
from nextmate_agent.utils.llm import get_chat_model, invoke_with_logging, parse_json_object
from nextmate_agent.utils.prompts import (
    LOOP_COMPARISON_SYSTEM_PROMPT,
    LOOP_DETECTION_SYSTEM_PROMPT,
    SUMMARY_SYSTEM_PROMPT,
    build_journal_summary_user_prompt,
    build_loop_comparison_prompt,
    build_loop_detection_prompt,
)
from apps.api.services.loop_service import (
    _validate_cross_thread_loop_recurrence,
    _loops_match,
    _update_loop_last_seen,
    _save_merged_loop_info,
)

logger = logging.getLogger(__name__)


def _get_journal_logs_as_memory(user_id: int) -> list[dict[str, Any]]:
    """Fetch recent journal logs formatted as memory entries for loop detection."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, entry_date, mood_label, core_theme, core_beliefs, triggers, created_at
                FROM (
                    SELECT id, entry_date, mood_label, core_theme, core_beliefs, triggers, created_at
                    FROM journal_logs
                    WHERE user_id = %s
                    ORDER BY entry_date DESC, created_at DESC
                    LIMIT 50
                ) recent
                ORDER BY entry_date ASC, created_at ASC
                """,
                (user_id,),
            )
            rows = cur.fetchall()

    entries = []
    for row in rows:
        entries.append({
            "thread_id": "journal",  # Using a fixed thread_id for all manual journal entries
            "created_at": row["entry_date"].isoformat() if row.get("entry_date") else row["created_at"].isoformat(),
            "summary": str(row.get("core_theme") or ""),
            "mood": str(row.get("mood_label") or ""),
            "core_beliefs": row.get("core_beliefs") or [],
            "triggers": row.get("triggers") or [],
            "key_facts": [],
        })
    return entries


def _get_cross_thread_entries_for_journal(user_id: int) -> list[dict[str, Any]]:
    """Fetch recent chat entries from journal_entries_v2 for cross-context loop detection."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT thread_id, created_at, core_theme, mood, core_beliefs, triggers
                FROM journal_entries_v2
                WHERE user_id = %s
                ORDER BY created_at DESC
                LIMIT 100
                """,
                (user_id,),
            )
            rows = cur.fetchall()

    entries = []
    for row in rows:
        entries.append({
            "thread_id": str(row.get("thread_id") or ""),
            "created_at": row["created_at"].isoformat() if row.get("created_at") else "",
            "summary": str(row.get("core_theme") or ""),
            "mood": str(row.get("mood") or ""),
            "core_beliefs": row.get("core_beliefs") or [],
            "triggers": row.get("triggers") or [],
            "key_facts": [],
        })
    return entries


def extract_features_and_detect_loops(user_id: int, entry_id: int) -> None:
    """
    Background task to:
    1. Extract core_theme, core_beliefs, triggers from the journal entry.
    2. Save them to the journal_logs table.
    3. Run loop detection using history from both journals and chats.
    """
    # 1. Fetch the journal entry
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT body, translated, mood_label FROM journal_logs WHERE id = %s AND user_id = %s",
                (entry_id, user_id)
            )
            row = cur.fetchone()
    if not row:
        logger.warning(f"Journal entry {entry_id} not found for user {user_id}")
        return

    body = row.get("body") or ""
    translated = row.get("translated") or ""
    text_to_analyze = translated if translated else body
    mood_label = row.get("mood_label") or ""

    if not text_to_analyze.strip():
        return

    # 2. Extract features
    llm = get_chat_model()
    prompt_content = build_journal_summary_user_prompt(text_to_analyze, mood_label)
    raw_summary, _ = invoke_with_logging(
        llm,
        [
            {"role": "system", "content": SUMMARY_SYSTEM_PROMPT},
            {"role": "user", "content": prompt_content},
        ],
        "journal_feature_extraction",
        "journal",
    )

    summary_data = parse_json_object(raw_summary if isinstance(raw_summary, str) else "")
    core_theme = str(summary_data.get("core_theme", "")).strip()
    core_beliefs = summary_data.get("core_beliefs", [])
    if not isinstance(core_beliefs, list):
        core_beliefs = []
    triggers = summary_data.get("triggers", [])
    if not isinstance(triggers, list):
        triggers = []

    # 3. Update the database
    with get_connection(autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE journal_logs
                SET core_theme = %s, core_beliefs = %s, triggers = %s
                WHERE id = %s AND user_id = %s
                """,
                (core_theme, Jsonb(core_beliefs), Jsonb(triggers), entry_id, user_id)
            )

    # 4. Fetch stored loops
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
            for r in cur.fetchall():
                stored_loops.append({
                    "loop_id": str(r["loop_id"]),
                    "loop_name": str(r["loop_name"]),
                    "core_belief": str(r["core_belief"]),
                    "trigger": str(r["trigger"]),
                    "valence": str(r["valence"]),
                    "first_detected_at": r["first_detected_at"].isoformat() if hasattr(r["first_detected_at"], "isoformat") else str(r["first_detected_at"]),
                    "last_detected_at": r["last_detected_at"].isoformat() if hasattr(r["last_detected_at"], "isoformat") else str(r["last_detected_at"]),
                    "detection_count": int(r["detection_count"]) if r["detection_count"] else 1,
                    "description": str(r["description"]),
                    "suggestion": str(r["suggestion"]),
                    "confidence_score": float(r["confidence_score"]) if r["confidence_score"] is not None else 0.0,
                    "validation_metadata": r["validation_metadata"] or {},
                })

    # 5. Get memory context for loop detection
    journal_entries = _get_journal_logs_as_memory(user_id)
    if len(journal_entries) < 2:
        return  # Not enough history

    cross_thread_entries = _get_cross_thread_entries_for_journal(user_id)

    # 6. Detect Loops
    detection_prompt = build_loop_detection_prompt(
        user_input=text_to_analyze,
        memory_entries=journal_entries,
        cross_thread_entries=cross_thread_entries,
    )

    raw_loops, _ = invoke_with_logging(
        llm,
        [
            {"role": "system", "content": LOOP_DETECTION_SYSTEM_PROMPT},
            {"role": "user", "content": detection_prompt},
        ],
        "journal_detect_loops",
        "journal",
    )

    loops_data = parse_json_object(raw_loops if isinstance(raw_loops, str) else "")
    if not loops_data.get("loops_found", False):
        return

    new_loop_info = []

    for loop in loops_data.get("loops", []):
        name = loop.get("pattern_name", "unknown pattern")
        core_belief = loop.get("core_belief", "")
        trigger = loop.get("trigger", "")
        valence = loop.get("valence", "neutral")

        # Validate loop recurrence
        is_valid, validated_matches, confidence = _validate_cross_thread_loop_recurrence(
            core_belief, trigger, journal_entries, cross_thread_entries
        )

        if not is_valid or confidence < 0.7:
            continue

        matched_existing = False
        matched_loop_name = ""

        # Compare with existing loops
        if stored_loops:
            comparison_prompt = build_loop_comparison_prompt(loop, stored_loops)
            comparison_raw, _ = invoke_with_logging(
                llm,
                [
                    {"role": "system", "content": LOOP_COMPARISON_SYSTEM_PROMPT},
                    {"role": "user", "content": comparison_prompt},
                ],
                "journal_detect_loops_comparison",
                "journal",
            )
            comparison = parse_json_object(comparison_raw if isinstance(comparison_raw, str) else "")
            if comparison.get("is_similar") and comparison.get("matched_loop_name"):
                matched_existing = True
                matched_loop_name = comparison.get("matched_loop_name", "")

        if matched_existing and matched_loop_name:
            for stored in stored_loops:
                if stored.get("loop_name") == matched_loop_name:
                    _update_loop_last_seen(stored, user_id, validated_matches)
                    break
            continue

        thread_ids = set(m.get("thread_id", "") for m in validated_matches if m.get("thread_id"))
        thread_count = len(thread_ids)

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
                    "description": loop.get("description", ""),
                    "suggestion": loop.get("suggestion", ""),
                }
            )

    if new_loop_info:
        # Save new loops to the database
        _save_merged_loop_info(new_loop_info, "journal", user_id)
