from datetime import datetime, timezone
import json
import re
from typing import Any
from uuid import uuid4
from langchain_core.runnables import RunnableConfig
from psycopg.types.json import Jsonb
from apps.db import get_connection
from nextmate_agent.utils.config import get_settings
from nextmate_agent.utils.llm import get_chat_model, parse_json_object, invoke_with_logging, ainvoke_with_logging, profile
from nextmate_agent.utils.node_logger import log_node
from nextmate_agent.utils.prompts import (
    CHAT_SYSTEM_PROMPT,
    EXPLICIT_ADVICE_DETECTION_SYSTEM_PROMPT,
    LOOP_COMPARISON_SYSTEM_PROMPT,
    LOOP_DETECTION_SYSTEM_PROMPT,
    LOOP_RESURFACE_CHECK_SYSTEM_PROMPT,
    SUMMARY_SYSTEM_PROMPT,
    _RESPONSE_MODES,
    build_chat_user_prompt,
    build_explicit_advice_detection_prompt,
    build_loop_comparison_prompt,
    build_loop_detection_prompt,
    build_loop_resurface_check_prompt,
    build_mode_selection_prompt,
    build_summary_user_prompt,

)
from nextmate_agent.utils.state import NextMateState

from apps.api.services.loop_service import (
    _parse_created_at,
    _loop_signature,
    _loops_match,
    _get_cross_thread_memory_entries,
    _validate_cross_thread_loop_recurrence,
    _validate_loop_recurrence,
    _match_entries_for_loop,
    _merge_loop_records,
    _update_loop_last_seen,
    _analyze_loop_persistence,
    _save_merged_loop_info
)

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



def load_memory_node(state: NextMateState, config: RunnableConfig) -> NextMateState:
    settings = get_settings()
    thread_id = _thread_id_from_config(config)
    user_id = _user_id_from_config(config)
    
    def inline_normalize(tid: str) -> str:
        if not tid:
            return ""
        if ":" in tid:
            parts = tid.split(":")
            if len(parts) >= 4 and parts[0] == "user" and parts[2] == "thread":
                return parts[3]
        return tid
    
    uuid_part = inline_normalize(thread_id)
    
    chat_history = state.get("chat_history", [])
    chat_history_update = None
    if not chat_history:
        if uuid_part:
            with get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        SELECT role, content
                        FROM thread_messages
                        WHERE user_id = %s AND thread_id = %s
                        ORDER BY created_at ASC
                        """,
                        (user_id, uuid_part),
                    )
                    msg_rows = cur.fetchall()
            
            db_history = []
            for r in msg_rows:
                db_history.append({"role": str(r["role"]), "content": str(r["content"])})
            
            if db_history:
                if db_history[-1]["role"] == "user":
                    db_history = db_history[:-1]
                chat_history_update = db_history

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
                       description, suggestion, confidence_score, validation_metadata, matched_entries
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
            "matched_entries": row["matched_entries"] or [],
        })

    # Fetch active loop for current thread if linked
    active_loop = None
    if uuid_part:
        active_loop_id = None
        try:
            with get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        SELECT loop_id FROM threads
                        WHERE user_id = %s AND thread_id = %s
                        """,
                        (user_id, uuid_part),
                    )
                    thread_row = cur.fetchone()
                    if thread_row:
                        active_loop_id = thread_row.get("loop_id")
        except Exception:
            pass

        if active_loop_id:
            for loop in stored_loops:
                if loop.get("loop_id") == str(active_loop_id):
                    active_loop = loop
                    break

    log_node(
        thread_id=thread_id,
        node_name="load_memory",
        inputs={"user_input": state.get("user_input", "")},
        outputs={"memory_entries_count": len(thread_entries), "stored_loops_count": len(stored_loops), "thread_id": thread_id, "active_loop_id": str(active_loop_id) if active_loop_id else None},
    )
    outputs = {"memory_entries": thread_entries, "thread_id": thread_id, "stored_loops": stored_loops, "active_loop": active_loop}
    if chat_history_update is not None:
        outputs["chat_history"] = chat_history_update
    return outputs


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
        cross_thread_entries=cross_thread_entries,
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
                    _update_loop_last_seen(stored, user_id, validated_matches)
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
            loops_text.append(f"  Cross-thread pattern detected across {thread_count} different conversations")

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


def detect_explicit_advice_node(state: NextMateState, config: RunnableConfig) -> NextMateState:
    llm = get_chat_model()
    thread_id = state.get("thread_id", "default")
    user_input = str(state.get("user_input", ""))

    if not user_input.strip():
        log_node(
            thread_id=thread_id,
            node_name="detect_explicit_advice",
            inputs={"user_input": user_input},
            outputs={"explicit_advice_request": False},
        )
        return {"explicit_advice_request": False, "response_mode": ""}

    content = build_explicit_advice_detection_prompt(user_input)
    raw, usage = invoke_with_logging(
        llm,
        [
            {"role": "system", "content": EXPLICIT_ADVICE_DETECTION_SYSTEM_PROMPT},
            {"role": "user", "content": content},
        ],
        "detect_explicit_advice",
        thread_id,
    )

    parsed = parse_json_object(raw if isinstance(raw, str) else "")
    explicit_advice = bool(parsed.get("explicit_advice_request", False))
    reason = str(parsed.get("reason", "")).strip()

    response_mode = "suggest" if explicit_advice else ""

    log_node(
        thread_id=thread_id,
        node_name="detect_explicit_advice",
        inputs={"user_input": user_input, "prompt": content},
        outputs={"explicit_advice_request": explicit_advice, "response_mode": response_mode, "reason": reason},
        extra={"raw_llm_response": raw},
    )
    return {"explicit_advice_request": explicit_advice, "response_mode": response_mode}

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
    explicit_advice = state.get("explicit_advice_request", False)
    stored_loops = state.get("stored_loops", [])
    active_loop = state.get("active_loop")
    response_mode_history = state.get("response_mode_history", [])

    chat_history = state.get("chat_history", [])

    if explicit_advice:
        log_node(
            thread_id=thread_id,
            node_name="choose_response_mode",
            inputs={"user_input": user_input, "memory_context": memory_context,
                    "explicit_advice_request": explicit_advice},
            outputs={"response_mode": "suggest", "response_mode_history": ["suggest"]},
            extra={"reason": "explicit advice request detected by advice node or regex fallback"},
        )
        return {"response_mode": "suggest", "response_mode_history": ["suggest"]}

    if active_loop and len(chat_history) <= 1:
        log_node(
            thread_id=thread_id,
            node_name="choose_response_mode",
            inputs={"user_input": user_input, "memory_context": memory_context, "active_loop_id": active_loop.get("loop_id")},
            outputs={"response_mode": "pattern_reflect", "response_mode_history": ["pattern_reflect"]},
            extra={"reason": "active reflection thread initialized — mode locked to pattern_reflect"},
        )
        return {"response_mode": "pattern_reflect", "response_mode_history": ["pattern_reflect"]}

    if existing_mode in ("loop_alert", "pattern_reflect") and detected_loops and len(chat_history) <= 1:
        log_node(
            thread_id=thread_id,
            node_name="choose_response_mode",
            inputs={"user_input": user_input, "memory_context": memory_context, "detected_loops": detected_loops},
            outputs={"response_mode": existing_mode, "response_mode_history": [existing_mode]},
            extra={"reason": f"loop detected on first turn — mode locked by detect_loops_node ({existing_mode})"},
        )
        return {"response_mode": existing_mode, "response_mode_history": [existing_mode]}

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
                outputs={"response_mode": "pattern_reflect", "detected_loops": matched_loop_text, "response_mode_history": ["pattern_reflect"]},
                extra={"reason": f"LLM resurface check matched: {matched_name}", "raw_llm_response": resurface_raw},
            )
            return {"response_mode": "pattern_reflect", "detected_loops": matched_loop_text, "response_mode_history": ["pattern_reflect"]}

    # Register all node functions with the line profiler
    for _name, _func in list(globals().items()):
        if callable(_func) and _name.endswith("_node"):
            profile(_func)

    # Filter allowed modes to prevent repetitive pattern callbacks or alerts in the same thread
    allowed_modes = list(_RESPONSE_MODES)

    if active_loop and len(chat_history) > 1:
        if "pattern_reflect" in allowed_modes:
            allowed_modes.remove("pattern_reflect")
        if "loop_alert" in allowed_modes:
            allowed_modes.remove("loop_alert")

    if "pattern_reflect" in response_mode_history:
        if "pattern_reflect" in allowed_modes:
            allowed_modes.remove("pattern_reflect")
    if "loop_alert" in response_mode_history:
        if "loop_alert" in allowed_modes:
            allowed_modes.remove("loop_alert")

    # Format chat history for the mode selection classifier
    recent_history = chat_history[-16:]
    if recent_history:
        history_lines: list[str] = []
        for msg in recent_history:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            history_lines.append(f"{role}: {content}")
        history_context = "\n".join(history_lines)
    else:
        history_context = "No previous messages in this thread yet."

    debug_history = [msg.get("content", "") for msg in recent_history[-3:]]
    llm = get_chat_model()
    content = build_mode_selection_prompt(
        user_input=user_input,
        memory_context=memory_context,
        history_context=history_context,
        detected_loops=detected_loops,
        stored_loops=stored_loops,
        active_loop=active_loop,
        allowed_modes=allowed_modes,
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
    # Exact match first
    for mode in allowed_modes:
        if mode == raw_text:
            chosen_mode = mode
            break
    # Word-boundary match next
    if not chosen_mode:
        for mode in allowed_modes:
            if re.search(rf"\b{re.escape(mode)}\b", raw_text):
                chosen_mode = mode
                break
    if not chosen_mode:
        chosen_mode = "validate" if "validate" in allowed_modes else allowed_modes[0]

    log_node(
        thread_id=thread_id,
        node_name="choose_response_mode",
        inputs={
            "user_input": user_input,
            "memory_context": memory_context,
            "detected_loops": detected_loops,
            "prompt": content,
            "chat_history_count": len(chat_history),
            "recent_history_preview": debug_history,
        },
        outputs={"response_mode": chosen_mode, "response_mode_history": [chosen_mode]},
        extra={"raw_llm_response": raw},
    )
    return {"response_mode": chosen_mode, "response_mode_history": [chosen_mode]}


def generate_reply_node(state: NextMateState) -> NextMateState:
    llm = get_chat_model()
    thread_id = state.get("thread_id", "default")
    user_input = state.get("user_input", "")
    memory_context = state.get("memory_context", "No prior memory available yet.")
    recent_history = state.get("chat_history", [])[-16:]
    if recent_history:
        history_lines: list[str] = []
        for msg in recent_history:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            history_lines.append(f"{role}: {content}")
        history_context = "\n".join(history_lines)
    else:
        history_context = "No previous messages in this thread yet."

    debug_history = [msg.get("content", "") for msg in recent_history[-3:]]
    detected_loops = state.get("detected_loops", "")
    stored_loops = state.get("stored_loops", [])
    response_mode = state.get("response_mode", "")
    active_loop = state.get("active_loop")

    content = build_chat_user_prompt(
        user_input=user_input,
        memory_context=memory_context,
        history_context=history_context,
        detected_loops=detected_loops,
        stored_loops=stored_loops,
        response_mode=response_mode,
        active_loop=active_loop,
    )

    messages: list[dict[str, str]] = [{"role": "system", "content": CHAT_SYSTEM_PROMPT}]
    for msg in recent_history:
        messages.append({"role": msg.get("role", "user"), "content": msg.get("content", "")})
    messages.append({"role": "user", "content": content})

    reply, usage = invoke_with_logging(
        llm,
        messages,
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
            "chat_history_count": len(recent_history),
            "recent_history_preview": debug_history,
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
