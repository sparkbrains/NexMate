from datetime import datetime, timezone

from langchain_core.runnables import RunnableConfig

from nextmate_agent.utils.config import get_settings
from nextmate_agent.utils.llm import get_chat_model, parse_json_object
from nextmate_agent.utils.memory_store import append_jsonl, read_jsonl, write_jsonl
from nextmate_agent.utils.node_logger import log_node
from nextmate_agent.utils.prompts import (
    CHAT_SYSTEM_PROMPT,
    LOOP_DETECTION_SYSTEM_PROMPT,
    SUMMARY_SYSTEM_PROMPT,
    _RESPONSE_MODES,
    build_chat_user_prompt,
    build_loop_detection_prompt,
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


def load_memory_node(state: NextMateState, config: RunnableConfig) -> NextMateState:
    settings = get_settings()
    thread_id = _thread_id_from_config(config)
    entries = read_jsonl(settings.summary_store_path)
    thread_entries = [entry for entry in entries if str(entry.get("thread_id", "default")) == thread_id]
    log_node(
        thread_id=thread_id,
        node_name="load_memory",
        inputs={"user_input": state.get("user_input", "")},
        outputs={"memory_entries_count": len(thread_entries), "thread_id": thread_id},
    )
    return {"memory_entries": thread_entries, "thread_id": thread_id}


def build_memory_context_node(state: NextMateState) -> NextMateState:
    settings = get_settings()
    thread_id = state.get("thread_id", "default")
    entries = state.get("memory_entries", [])
    window = entries[-settings.memory_window :]

    if not window:
        memory_context = "No prior memory available yet."
        log_node(
            thread_id=thread_id,
            node_name="build_memory_context",
            inputs={"total_entries": len(entries), "window_size": settings.memory_window},
            outputs={"memory_context": memory_context},
        )
        return {"memory_context": memory_context}

    lines: list[str] = []
    for item in window:
        summary = item.get("summary", "") or item.get("core_theme", "")
        mood = item.get("mood", "unknown")
        created_at = item.get("created_at", "")
        beliefs = item.get("core_beliefs", [])
        triggers = item.get("triggers", [])
        # Backward compat
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
    log_node(
        thread_id=thread_id,
        node_name="build_memory_context",
        inputs={"total_entries": len(entries), "window_size": settings.memory_window, "used_entries": len(window)},
        outputs={"memory_context": memory_context},
    )
    return {"memory_context": memory_context}


def _loop_signature(loop: dict[str, Any]) -> tuple[str, str]:
    """Create a normalized signature from core_belief + trigger for matching."""
    belief = (loop.get("core_belief") or "").lower().strip()
    trigger = (loop.get("trigger") or "").lower().strip()
    return (belief, trigger)


def _loops_match(loops_a: dict[str, Any], loops_b: dict[str, Any]) -> bool:
    """Check if two loop records represent the same pattern (belief+trigger match)."""
    sig_a = _loop_signature(loops_a)
    sig_b = _loop_signature(loops_b)
    # Both must have non-empty belief and trigger to be considered a match
    if not sig_a[0] or not sig_a[1] or not sig_b[0] or not sig_b[1]:
        return False
    # Check if belief contains b or vice versa, same for trigger
    belief_match = sig_a[0] in sig_b[0] or sig_b[0] in sig_a[0]
    trigger_match = sig_a[1] in sig_b[1] or sig_b[1] in sig_a[1]
    return belief_match and trigger_match


def _match_entries_for_loop(
    loop: dict[str, Any], entries: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Find prior entries that share the loop's core_belief and trigger."""
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
    """Merge a newly detected loop into an existing loop record."""
    # Get existing dates set for deduplication
    existing_dates = {e.get("date", "") for e in existing.get("matched_entries", [])}

    # Filter new entries to only those not already recorded
    new_entries = [e for e in new_matched if e.get("date", "") and e.get("date") not in existing_dates]

    # Merge matched entries
    merged_entries = existing.get("matched_entries", []) + new_entries

    # Update detection tracking
    detection_dates = existing.get("detection_dates", [existing.get("first_detected_at", existing.get("detected_at", ""))])
    now = new.get("last_detected_at", new.get("detected_at", ""))
    if now and now not in detection_dates:
        detection_dates.append(now)

    # Count based on unique detection events, not just list length
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


def _save_merged_loop_info(
    loop_info: list[dict[str, Any]], thread_id: str, settings: Any
) -> list[dict[str, Any]]:
    """Read existing loops, merge with new ones, write back consolidated records."""
    from uuid import uuid4

    # Load all existing loops
    all_loops = read_jsonl(settings.loop_store_path)

    # Filter to current thread and normalize legacy records
    thread_loops: list[dict[str, Any]] = []
    for loop in all_loops:
        if str(loop.get("thread_id", "default")) == thread_id:
            # Normalize legacy records (single detection)
            if "loop_id" not in loop:
                loop["loop_id"] = str(uuid4())
            if "first_detected_at" not in loop and "detected_at" in loop:
                loop["first_detected_at"] = loop["detected_at"]
            if "last_detected_at" not in loop and "detected_at" in loop:
                loop["last_detected_at"] = loop["detected_at"]
            if "detection_dates" not in loop and "detected_at" in loop:
                loop["detection_dates"] = [loop["detected_at"]]
            if "detection_count" not in loop:
                loop["detection_count"] = len(loop.get("detection_dates", [loop.get("detected_at")]))
            thread_loops.append(loop)

    # Process each new loop detection
    now = datetime.now(timezone.utc).isoformat()
    for new_loop in loop_info:
        new_loop["detected_at"] = now
        new_loop["thread_id"] = thread_id

        # Look for an existing loop with the same signature
        merged = False
        for i, existing in enumerate(thread_loops):
            if _loops_match(existing, new_loop):
                matched = new_loop.get("matched_entries", [])
                thread_loops[i] = _merge_loop_records(existing, new_loop, matched)
                merged = True
                break

        if not merged:
            # Create new canonical loop record
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
            }
            thread_loops.append(new_record)

    # Rebuild full loops list: other threads + merged current thread
    other_loops = [loop for loop in all_loops if str(loop.get("thread_id", "default")) != thread_id]
    final_loops = other_loops + thread_loops

    # Write back
    write_jsonl(settings.loop_store_path, final_loops)

    return thread_loops


def detect_loops_node(state: NextMateState) -> NextMateState:
    llm = get_chat_model()
    thread_id = state.get("thread_id", "default")
    user_input = state.get("user_input", "")
    entries = state.get("memory_entries", [])
    settings = get_settings()

    # Need at least 2 prior entries to detect loops
    if len(entries) < 2:
        log_node(
            thread_id=thread_id,
            node_name="detect_loops",
            inputs={"user_input": user_input, "memory_entries_count": len(entries)},
            outputs={"detected_loops": "(skipped — not enough history)"},
        )
        return {"detected_loops": ""}

    content = build_loop_detection_prompt(
        user_input=user_input,
        memory_entries=entries,
    )
    raw = llm.invoke(
        [
            {"role": "system", "content": LOOP_DETECTION_SYSTEM_PROMPT},
            {"role": "user", "content": content},
        ]
    ).content

    loops_data = parse_json_object(raw if isinstance(raw, str) else "")

    if not loops_data.get("loops_found", False):
        log_node(
            thread_id=thread_id,
            node_name="detect_loops",
            inputs={"user_input": user_input, "memory_entries_count": len(entries), "prompt": content},
            outputs={"detected_loops": "(none found)", "raw_llm_response": raw},
        )
        return {"detected_loops": "", "response_mode": "", "loop_info": []}

    loops_text: list[str] = []
    loop_info: list[dict[str, Any]] = []
    for loop in loops_data.get("loops", []):
        valence = loop.get("valence", "neutral")
        name = loop.get("pattern_name", "unknown pattern")
        desc = loop.get("description", "")
        suggestion = loop.get("suggestion", "")
        evidence = loop.get("evidence", [])

        loops_text.append(f"- [{valence.upper()} LOOP] {name}: {desc}")
        if evidence:
            loops_text.append(f"  evidence: {', '.join(evidence)}")
        if suggestion:
            loops_text.append(f"  suggestion: {suggestion}")

        # Match prior entries with same core belief + trigger
        matched = _match_entries_for_loop(loop, entries)
        if matched:
            loop_info.append(
                {
                    "loop_name": name,
                    "core_belief": loop.get("core_belief", ""),
                    "trigger": loop.get("trigger", ""),
                    "valence": valence,
                    "matched_entries": matched,
                }
            )

    reflection = loops_data.get("reflection_prompt", "")
    detected = "\n".join(loops_text)
    if reflection:
        detected += f"\n\nReflection angle: {reflection}"

    # Save loop info to persistent store (merge with existing loops)
    if loop_info:
        _save_merged_loop_info(loop_info, thread_id, settings)

    log_node(
        thread_id=thread_id,
        node_name="detect_loops",
        inputs={"user_input": user_input, "memory_entries_count": len(entries), "prompt": content},
        outputs={
            "detected_loops": detected,
            "loops_data": loops_data,
            "loop_info": loop_info,
            "response_mode": "loop_alert",
        },
        extra={"raw_llm_response": raw},
    )
    return {
        "detected_loops": detected,
        "loop_info": loop_info,
        "response_mode": "loop_alert",
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

    # If a loop was detected this turn, respect the lock from detect_loops.
    if existing_mode == "loop_alert" and detected_loops:
        log_node(
            thread_id=thread_id,
            node_name="choose_response_mode",
            inputs={"user_input": user_input, "memory_context": memory_context, "detected_loops": detected_loops},
            outputs={"response_mode": "loop_alert"},
            extra={"reason": "loop detected — mode locked by detect_loops_node"},
        )
        return {"response_mode": "loop_alert"}

    llm = get_chat_model()
    content = build_mode_selection_prompt(
        user_input=user_input,
        memory_context=memory_context,
        detected_loops=detected_loops,
    )
    raw = llm.invoke(
        [
            {"role": "system", "content": MODE_SELECTION_SYSTEM_PROMPT},
            {"role": "user", "content": content},
        ]
    ).content

    raw_text = (raw if isinstance(raw, str) else "").strip().lower()
    # Extract mode name from possible markdown fences or prose
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
    response_mode = state.get("response_mode", "")

    content = build_chat_user_prompt(
        user_input=user_input,
        memory_context=memory_context,
        history_context=history_context,
        detected_loops=detected_loops,
        response_mode=response_mode,
    )
    reply = llm.invoke(
        [
            {"role": "system", "content": CHAT_SYSTEM_PROMPT},
            {"role": "user", "content": content},
        ]
    ).content

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
    raw = llm.invoke(
        [
            {"role": "system", "content": SUMMARY_SYSTEM_PROMPT},
            {"role": "user", "content": content},
        ]
    ).content

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
    settings = get_settings()
    thread_id = _thread_id_from_config(config)
    summary = state.get("turn_summary", {})
    if summary:
        summary["thread_id"] = thread_id
        append_jsonl(settings.summary_store_path, summary)
    log_node(
        thread_id=thread_id,
        node_name="persist_summary",
        inputs={"turn_summary": summary},
        outputs={"persisted": bool(summary), "store_path": settings.summary_store_path},
    )
    return {}
