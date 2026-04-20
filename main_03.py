import os
import re
import json
from datetime import datetime, date
from typing import List, Dict, Any
from dotenv import load_dotenv
from openai import OpenAI


load_dotenv()


OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
MODEL = os.getenv("GENERATION_MODEL")
OPENROUTER_BASE_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
APP_REFERER = os.getenv("APP_REFERER", "http://localhost:8000")
APP_TITLE = os.getenv("APP_TITLE", "nexmate-memory-cli")

if not OPENROUTER_API_KEY:
    raise ValueError("OPENROUTER_API_KEY is missing in your .env file.")


client = OpenAI(
    base_url=OPENROUTER_BASE_URL,
    api_key=OPENROUTER_API_KEY,
    default_headers={
        "HTTP-Referer": APP_REFERER,
        "X-Title": APP_TITLE,
    },
)


def read_file(path: str) -> str:
    if not os.path.exists(path):
        return ""
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def json_default_serializer(obj):
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    raise TypeError(f"Object of type {obj.__class__.__name__} is not JSON serializable")


def safe_json_parse(content: str) -> dict:
    text = (content or "").strip()

    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines.startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            candidate = text[start:end + 1]
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                pass
        return {"raw_output": text, "parse_error": True}


def call_json_llm(system_prompt: str, user_prompt: str) -> dict:
    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.2,
        response_format={"type": "json_object"},
    )

    if not response.choices:
        return {"raw_output": "", "error": "No choices returned from model."}

    message = response.choices[0].message
    content = message.content if message and message.content else ""
    return safe_json_parse(content)


def append_user_input_to_memory(path: str, user_input: str) -> None:
    today = datetime.now().strftime("%Y-%m-%d")
    block = f"\n\n## {today}\n{user_input.strip()}\n"
    with open(path, "a", encoding="utf-8") as f:
        f.write(block)


def parse_dated_memory_entries(user_memory_md: str) -> List[Dict[str, Any]]:
    pattern = r"^##\s+(\d{4}-\d{2}-\d{2})\s*$"
    lines = user_memory_md.splitlines()

    entries = []
    current_date = None
    current_lines = []

    def flush_entry():
        nonlocal current_date, current_lines, entries
        if current_date is not None:
            text = "\n".join(current_lines).strip()
            if text:
                try:
                    parsed_date = datetime.strptime(current_date, "%Y-%m-%d").date()
                except ValueError:
                    parsed_date = None
                entries.append({
                    "date": current_date,
                    "parsed_date": parsed_date,
                    "text": text
                })

    for line in lines:
        match = re.match(pattern, line.strip())
        if match:
            flush_entry()
            current_date = match.group(1)
            current_lines = []
        else:
            if current_date is not None:
                current_lines.append(line)

    flush_entry()
    return entries


def build_relevance_prompt(user_input: str, entries: List[Dict[str, Any]]) -> str:
    today = date.today().isoformat()

    compact_entries = []
    for i, entry in enumerate(entries):
        parsed_date = entry.get("parsed_date")
        days_ago = None
        if isinstance(parsed_date, date):
            days_ago = (date.today() - parsed_date).days

        compact_entries.append({
            "entry_id": i,
            "date": entry.get("date"),
            "days_ago": days_ago,
            "text": entry.get("text", "")[:1200]
        })

    return f"""
You are a memory relevance engine for a journal companion.

Today's date:
{today}

Current user input:
{user_input}

Candidate previous dated journal entries:
{json.dumps(compact_entries, ensure_ascii=False, indent=2, default=json_default_serializer)}

Your job:
- Identify which previous entries are actually relevant to the current message.
- Consider semantic similarity, emotional continuity, repeated triggers, recurring core beliefs, and recurrence over time.
- Use dates carefully:
  - more recent entries usually matter more,
  - but older entries can still matter if they show a recurring pattern.
- Prefer entries that help identify loops, shifts in valence, intensity buildup, repeated triggers, or stable core beliefs.

Return JSON in exactly this shape:
{{
  "selected_entries": [
    {{
      "entry_id": 0,
      "date": "YYYY-MM-DD",
      "relevance_score": 0.0,
      "reason": "string",
      "loop_signal": "none|weak|moderate|strong",
      "core_belief_signal": "none|weak|moderate|strong",
      "trigger_signal": "none|weak|moderate|strong"
    }}
  ]
}}
""".strip()


def select_relevant_entries(user_input: str, entries: List[Dict[str, Any]], top_k: int = 5) -> List[Dict[str, Any]]:
    if not entries:
        return []

    system_prompt = """
You are a precise relevance selector for date-aware journal memory.
Return only valid JSON.
""".strip()

    user_prompt = build_relevance_prompt(user_input, entries)
    result = call_json_llm(system_prompt, user_prompt)

    selected = result.get("selected_entries", [])
    selected_map = {item.get("entry_id"): item for item in selected if isinstance(item, dict)}

    enriched = []
    for idx, entry in enumerate(entries):
        if idx in selected_map:
            meta = selected_map[idx]
            enriched.append({
                "entry_id": idx,
                "date": entry.get("date"),
                "parsed_date": entry.get("parsed_date"),
                "text": entry.get("text", ""),
                "relevance_score": meta.get("relevance_score", 0.0),
                "reason": meta.get("reason", ""),
                "loop_signal": meta.get("loop_signal", "none"),
                "core_belief_signal": meta.get("core_belief_signal", "none"),
                "trigger_signal": meta.get("trigger_signal", "none"),
            })

    enriched.sort(key=lambda x: x.get("relevance_score", 0.0), reverse=True)
    return enriched[:top_k]


def extract_features(user_input: str, relevant_entries: List[Dict[str, Any]]) -> dict:
    today = date.today().isoformat()

    formatted_entries = []
    for entry in relevant_entries:
        parsed = entry.get("parsed_date")
        last_seen_date = parsed.isoformat() if isinstance(parsed, date) else None
        days_ago = None
        if isinstance(parsed, date):
            days_ago = (date.today() - parsed).days

        formatted_entries.append({
            "date": entry.get("date"),
            "last_seen_date": last_seen_date,
            "days_ago": days_ago,
            "text": entry.get("text", ""),
            "relevance_score": entry.get("relevance_score", 0.0),
            "reason": entry.get("reason", ""),
            "loop_signal": entry.get("loop_signal", "none"),
            "core_belief_signal": entry.get("core_belief_signal", "none"),
            "trigger_signal": entry.get("trigger_signal", "none"),
        })

    system_prompt = """
You are a psychological feature extraction engine for a memory-aware journal companion called Nexmate.
Your sole job is to silently analyze — do NOT give advice, comfort, or responses.
Analyze the user's current message together with relevant dated entries to extract structured psychological signals.
Be precise, grounded, and evidence-based. Every field must be inferred from actual content — never hallucinate.
Return only valid JSON. No extra text, no markdown fences.
""".strip()

    user_prompt = f"""
## Today's Date
{today}

## User's Current Message
{user_input}

## Relevant Previous Dated Entries
{json.dumps(formatted_entries, ensure_ascii=False, indent=2, default=json_default_serializer)}

---

## EXTRACTION GUIDELINES

### 1. CORE BELIEFS
Extract deep-seated beliefs the user holds about themselves, others, or the world.
- Infer from language patterns, recurring themes, and how they frame events
- Rate confidence based on how explicitly or repeatedly this belief appears
- Source: "current_input" if only in today's message, "memory" if seen before, "inferred" if implied

### 2. VALENCE
A single float from -1.0 to +1.0 representing overall emotional tone:
- -1.0 = deeply negative (grief, despair, rage)
-  0.0 = neutral or mixed
- +1.0 = deeply positive (joy, excitement, gratitude)
Be precise — avoid defaulting to 0.0 unless truly neutral.

### 3. TRIGGERS
What seems to have caused or worsened the user's current emotional state?
- situational: external events (work deadline, fight with friend, bad news)
- relational: people-related (conflict, loneliness, feeling unseen)
- cognitive: thought patterns (self-criticism, catastrophizing, comparison)

### 4. INTENSITY
How emotionally charged is this message overall?
- distress_intensity: 0.0 (calm) → 1.0 (overwhelmed/breaking point)
- self_harm_risk: 0.0 (none) → 1.0 (explicit ideation/intent)
  * Flag anything above 0.3 — err on the side of caution
- urgency: "low" | "moderate" | "high"
  * high = immediate emotional crisis or self-harm signals present

### 5. LOOP DETECTION
Compare today's message against memory to detect recurring patterns:
- theme_loop: same life topic recurring (e.g., always stressed about the same person/job)
- emotion_loop: same emotional state keeps returning without progress
- crisis_loop: repeated crisis-level entries — this is a serious signal
Set is_loop to true only if there is genuine pattern evidence in memory, not just similarity.

---

## OUTPUT FORMAT

Return strictly valid JSON in this exact shape:
{{
  "core_beliefs": [
    {{
      "belief": "string",
      "confidence": 0.0,
      "source": "current_input | memory | inferred"
    }}
  ],
  "valence": 0.0,
  "triggers": {{
    "situational": ["string"],
    "relational": ["string"],
    "cognitive": ["string"]
  }},
  "intensity": {{
    "distress_intensity": 0.0,
    "self_harm_risk": 0.0,
    "urgency": "low | moderate | high"
  }},
  "loop_detection": {{
    "is_loop": false,
    "loop_type": "none | theme_loop | emotion_loop | crisis_loop",
    "confidence": 0.0,
    "reason": "string — cite specific evidence from memory or input"
  }}
}}
""".strip()

    result = call_json_llm(system_prompt, user_prompt)

    if result.get("parse_error") or result.get("error"):
        return {
            "core_beliefs": [],
            "valence": 0.0,
            "triggers": {
                "situational": [],
                "relational": [],
                "cognitive": []
            },
            "intensity": {
                "distress_intensity": 0.0,
                "self_harm_risk": 0.0,
                "urgency": "low"
            },
            "loop_detection": {
                "is_loop": False,
                "loop_type": "none",
                "confidence": 0.0,
                "reason": "Extraction failed — parse error."
            },
            "raw_output": result.get("raw_output", "")
        }

    return result


def choose_response_route(features_payload: dict, response_routing_md: str) -> dict:
    system_prompt = """
You are a response router.

Use the structured extracted features and the routing rules to choose the single best response route.
Return only valid JSON.
""".strip()

    user_prompt = f"""
Structured extracted features:
{json.dumps(features_payload, ensure_ascii=False, indent=2, default=json_default_serializer)}

Response routing rules:
{response_routing_md}

Return JSON in this exact structure:
{{
  "route_name": "string",
  "route_reason": "string",
  "style_notes": ["string"],
  "must_include": ["string"]
}}
""".strip()

    result = call_json_llm(system_prompt, user_prompt)

    if result.get("parse_error") or result.get("error"):
        return {
            "route_name": "fallback",
            "route_reason": "Could not reliably parse routing output.",
            "style_notes": [],
            "must_include": [],
            "raw_output": result.get("raw_output", ""),
        }

    return result


def build_generation_prompt(
    user_input: str,
    relevant_entries: List[Dict[str, Any]],
    response_category_md: str,
    features_payload: dict,
    route_payload: dict,
) -> str:
    formatted_entries = []
    for entry in relevant_entries:
        parsed = entry.get("parsed_date")
        days_ago = (date.today() - parsed).days if isinstance(parsed, date) else None

        formatted_entries.append({
            "date": entry.get("date"),
            "days_ago": days_ago,
            "text": entry.get("text"),
            "relevance_score": entry.get("relevance_score", 0.0),
            "reason": entry.get("reason", ""),
        })

    return f"""
You are Nexmate — a warm, empathetic daily journal companion and trusted friend.
Your role is to listen deeply, reflect thoughtfully, and respond like a caring friend who also has the wisdom of a gentle counselor.

---

## CORE PERSONALITY
- Speak in a natural, conversational, friendly tone — never robotic or clinical
- Be warm, non-judgmental, and emotionally attuned
- Make the user feel truly heard, not just processed
- Use casual but thoughtful language — like texting a close, wise friend
- Never give unsolicited advice unless the user seems distressed

---

## CONTEXT

**User's message today:**
{user_input}

**Relevant previous dated memories:**
{json.dumps(formatted_entries, ensure_ascii=False, indent=2, default=json_default_serializer)}

**Structured extracted features:**
{json.dumps(features_payload, ensure_ascii=False, indent=2, default=json_default_serializer)}

**Chosen response route:**
{json.dumps(route_payload, ensure_ascii=False, indent=2, default=json_default_serializer)}

**Response category rules:**
{response_category_md}

---

## RESPONSE RULES

### 1. EMOTIONAL TRIAGE
Scan for:
- Sadness, loneliness, hopelessness, grief
- Frustration or anger
- Self-harm, suicidal thoughts, or crisis language

If self-harm or crisis language appears:
- Acknowledge the pain with compassion
- Do not lecture or panic
- Gently encourage reaching out to trusted or professional support
- Stay present in the conversation

### 2. MEMORY INTEGRATION
- Reference only genuinely relevant previous entries
- Use dates and recurrence naturally
- Do not sound mechanical

### 3. CONVERSATION STYLE
- Normal journaling: 4–6 sentences
- Distress/crisis: 6–10 sentences
- End with a gentle question unless immediate safety concerns make that inappropriate
- No bullet points or headers in the final summary text

---

## OUTPUT FORMAT

Return strictly valid JSON in this exact shape:
{{
  "category": "string (joyful | neutral | sad | frustrated | anxious | crisis)",
  "features": {{
    "intent": "string",
    "emotional_tone": "string",
    "topics": ["string"],
    "preferences": ["string"],
    "constraints": ["string"],
    "memory_hooks": ["string"],
    "crisis_flag": false
  }},
  "summary": "string"
}}
""".strip()


def generate_response(
    user_input: str,
    relevant_entries: List[Dict[str, Any]],
    response_routing_md: str,
    features_payload: dict,
    route_payload: dict,
) -> dict:
    prompt = build_generation_prompt(
        user_input=user_input,
        relevant_entries=relevant_entries,
        response_category_md=response_routing_md,
        features_payload=features_payload,
        route_payload=route_payload,
    )

    system_prompt = """
You are a reflective journaling companion.
Return only valid JSON.
Follow the requested structure exactly.
""".strip()

    result = call_json_llm(system_prompt, prompt)

    if result.get("parse_error") or result.get("error"):
        return {
            "category": "fallback",
            "features": {
                "intent": "",
                "emotional_tone": "",
                "topics": [],
                "preferences": [],
                "constraints": [],
                "memory_hooks": [],
                "crisis_flag": False,
            },
            "summary": result.get("raw_output", ""),
        }

    return result


def print_trace(
    relevant_entries: List[Dict[str, Any]],
    features_payload: dict,
    route_payload: dict,
    response_payload: dict,
) -> None:
    print("\nRELEVANT PREVIOUS ENTRIES")
    printable_entries = []
    for entry in relevant_entries:
        parsed = entry.get("parsed_date")
        days_ago = (date.today() - parsed).days if isinstance(parsed, date) else None
        printable_entries.append({
            "date": entry.get("date"),
            "days_ago": days_ago,
            "relevance_score": entry.get("relevance_score", 0.0),
            "reason": entry.get("reason", ""),
            "loop_signal": entry.get("loop_signal", "none"),
            "core_belief_signal": entry.get("core_belief_signal", "none"),
            "trigger_signal": entry.get("trigger_signal", "none"),
            "text": entry.get("text", "")
        })
    print(json.dumps(printable_entries, indent=2, ensure_ascii=False, default=json_default_serializer))

    print("\nCORE BELIEFS")
    print(json.dumps(features_payload.get("core_beliefs", []), indent=2, ensure_ascii=False, default=json_default_serializer))

    print("\nVALENCE")
    print(json.dumps(features_payload.get("valence", 0.0), indent=2, ensure_ascii=False, default=json_default_serializer))

    print("\nTRIGGERS")
    print(json.dumps(features_payload.get("triggers", {}), indent=2, ensure_ascii=False, default=json_default_serializer))

    print("\nINTENSITY")
    print(json.dumps(features_payload.get("intensity", {}), indent=2, ensure_ascii=False, default=json_default_serializer))

    print("\nLOOP STATUS")
    print(json.dumps(features_payload.get("loop_detection", {}), indent=2, ensure_ascii=False, default=json_default_serializer))

    print("\nRESPONSE ROUTE")
    print(json.dumps(route_payload, indent=2, ensure_ascii=False, default=json_default_serializer))

    print("\nRESPONSE OUTPUT")
    print(json.dumps(response_payload, indent=2, ensure_ascii=False, default=json_default_serializer))

    print("\n FINAL SUMMARY")
    print(response_payload.get("summary", "").strip())


def main():
    user_input = input("User: ").strip()
    if not user_input:
        print("No input provided.")
        return

    user_memory_path = os.getenv("USER_MEMORY_PATH")
    response_routing_path = os.getenv("RESPONSE_ROUTING_PATH")
    top_k = int(os.getenv("MEMORY_TOP_K", "5"))

    user_memory_md = read_file(user_memory_path)
    response_routing_md = read_file(response_routing_path)

    all_entries = parse_dated_memory_entries(user_memory_md)
    relevant_entries = select_relevant_entries(user_input, all_entries, top_k=top_k)

    features_payload = extract_features(user_input, relevant_entries)
    route_payload = choose_response_route(features_payload, response_routing_md)
    response_payload = generate_response(
        user_input=user_input,
        relevant_entries=relevant_entries,
        response_routing_md=response_routing_md,
        features_payload=features_payload,
        route_payload=route_payload,
    )

    print_trace(
        relevant_entries=relevant_entries,
        features_payload=features_payload,
        route_payload=route_payload,
        response_payload=response_payload,
    )

    append_user_input_to_memory(user_memory_path, user_input)


if __name__ == "__main__":
    main()