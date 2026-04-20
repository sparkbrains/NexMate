import os
import re
import json
from datetime import datetime, date
from typing import List, Dict, Any, Tuple
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
        if lines and lines[0].startswith("```"):
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

    raw_entries: List[Dict[str, Any]] = []
    current_date = None
    current_lines: List[str] = []

    def flush_entry():
        nonlocal current_date, current_lines, raw_entries
        if current_date is not None:
            text = "\n".join(current_lines).strip()
            if text:
                try:
                    parsed_date = datetime.strptime(current_date, "%Y-%m-%d").date()
                except ValueError:
                    parsed_date = None
                raw_entries.append({
                    "date": current_date,
                    "parsed_date": parsed_date,
                    "text": text,
                })

    for line in lines:
        m = re.match(pattern, line.strip())
        if m:
            flush_entry()
            current_date = m.group(1)
            current_lines = []
        else:
            if current_date is not None:
                current_lines.append(line)

    flush_entry()

    entries: List[Dict[str, Any]] = []
    for idx, e in enumerate(raw_entries):
        e = dict(e)
        e["entry_id"] = idx
        entries.append(e)
    return entries


def split_previous_and_today(entries: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], Dict[str, Any] | None]:
    today = date.today()
    previous_entries: List[Dict[str, Any]] = []
    today_entry: Dict[str, Any] | None = None

    for e in entries:
        parsed = e.get("parsed_date")
        if not isinstance(parsed, date):
            previous_entries.append(e)
            continue

        if parsed == today:
            if today_entry is None:
                today_entry = dict(e)
            else:
                today_entry["text"] += "\n\n" + e.get("text", "")
        else:
            previous_entries.append(e)

    return previous_entries, today_entry

def build_entry_relevance_prompt(today_text: str,
                                 previous_entries: List[Dict[str, Any]]) -> str:
    today_str = date.today().isoformat()

    compact_entries = [
        {
            "entry_id": e["entry_id"],
            "date": e["date"],
            "text": e.get("text", "")[:4000],
        }
        for e in previous_entries
    ]

    prompt = f"""
You are a memory relevance engine for a journaling companion.

Today's date:
{today_str}

Today's text (current entry):
{today_text}

Previous entries (each item is exactly ONE past note, not grouped by day):
{json.dumps(compact_entries, ensure_ascii=False, indent=2, default=json_default_serializer)}

Instructions:
- For each previous entry, compute a semantic similarity score in [0.0, 1.0] between today's text and that entry.
- 0.0 = completely unrelated. 1.0 = essentially the same experience or meaning.
- Consider meaning, emotional tone, and situation, not just word overlap.
- You must score every entry.
- Avoid generic phrases like "short explanation" or "no significant overlap or similarity".
- Use at most one short sentence for the reason, or an empty string if nothing useful to add.

Return strictly valid JSON in this exact format:

{{
  "entry_scores": [
    {{
      "entry_id": 0,
      "date": "YYYY-MM-DD",
      "relevance_score": 0.82,
      "reason": "Short, concrete reason tied to the texts, or empty string"
    }}
  ]
}}
""".strip()

    return prompt


def lexical_overlap_score(a: str, b: str) -> float:
    def normalize(text: str) -> List[str]:
        text = (text or "").lower()
        text = re.sub(r"[^a-z0-9\s]", " ", text)
        tokens = [t for t in text.split() if len(t) > 2]
        return tokens

    a_tokens = set(normalize(a))
    b_tokens = set(normalize(b))

    if not a_tokens or not b_tokens:
        return 0.0

    intersection = a_tokens.intersection(b_tokens)
    union = a_tokens.union(b_tokens)
    return len(intersection) / max(len(union), 1)


def score_previous_entries(today_text: str,
                           previous_entries: List[Dict[str, Any]],
                           top_k: int = 5) -> List[Dict[str, Any]]:

    if not previous_entries:
        print("\n[debug] No previous entries found.")
        return []

    system_prompt = "You are a precise entry-level relevance scorer. Return only valid JSON."
    user_prompt = build_entry_relevance_prompt(today_text, previous_entries)
    result = call_json_llm(system_prompt, user_prompt)

    scores = result.get("entry_scores", [])
    if not isinstance(scores, list):
        scores = []

    scores_by_id: Dict[int, Dict[str, Any]] = {}
    for s in scores:
        if not isinstance(s, dict):
            continue
        eid = s.get("entry_id")
        if not isinstance(eid, int):
            continue
        try:
            relevance_score = float(s.get("relevance_score", 0.0))
        except (TypeError, ValueError):
            relevance_score = 0.0
        scores_by_id[eid] = {
            "entry_id": eid,
            "date": s.get("date"),
            "relevance_score": relevance_score,
            "reason": s.get("reason", "") or "",
        }

    enriched: List[Dict[str, Any]] = []
    for e in previous_entries:
        eid = e["entry_id"]
        base = scores_by_id.get(eid)
        if base is None:
            overlap = lexical_overlap_score(today_text, e.get("text", ""))
            base = {
                "entry_id": eid,
                "date": e.get("date"),
                "relevance_score": overlap,
                "reason": "Fallback lexical overlap score" if overlap > 0 else "",
            }

        enriched.append({
            "entry_id": eid,
            "date": e.get("date"),
            "parsed_date": e.get("parsed_date"),
            "text": e.get("text", ""),
            "relevance_score": float(base.get("relevance_score", 0.0)),
            "reason": base.get("reason", ""),
        })

    print("\nALL PAIRS AND SCORES")
    pairs_debug = []
    for e in enriched:
        parsed = e.get("parsed_date")
        days_ago = (date.today() - parsed).days if isinstance(parsed, date) else None
        pairs_debug.append({
            "entry_id": e["entry_id"],
            "date": e.get("date"),
            "days_ago": days_ago,
            "today_text": today_text,
            "previous_entry_text": e.get("text", ""),
            "relevance_score": e.get("relevance_score", 0.0),
            "reason": e.get("reason", ""),
        })
    print(json.dumps(pairs_debug, indent=2, ensure_ascii=False, default=json_default_serializer))

    enriched.sort(key=lambda x: x["relevance_score"], reverse=True)

    print("\nALL ENTRY RELEVANCE SCORES")
    print(json.dumps(enriched, indent=2, ensure_ascii=False, default=json_default_serializer))

    for e in enriched:
        score = e["relevance_score"]
        if score >= 0.85:
            e["loop_signal"] = "strong"
            e["core_belief_signal"] = "strong"
        elif score >= 0.65:
            e["loop_signal"] = "moderate"
            e["core_belief_signal"] = "moderate"
        elif score >= 0.45:
            e["loop_signal"] = "weak"
            e["core_belief_signal"] = "weak"
        else:
            e["loop_signal"] = "none"
            e["core_belief_signal"] = "none"
        e["trigger_signal"] = "none"

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
            "core_belief_signal": entry.get("core_belief_signal", "none")
        })

    system_prompt = """
You are a psychological feature extraction engine for a memory-aware journal companion called Nexmate.
Your sole job is to silently analyze — do NOT give advice, comfort, or responses.
Analyze the user's current message together with relevant previous dated entries to extract structured psychological signals.
Be precise, grounded, and evidence-based. Every field must be inferred from actual content — never hallucinate.
IMPORTANT:
- Triggers must be inferred only from the user's current message today.
- Do not extract triggers from memory.
- Memory can be used for loop detection, belief continuity, recurrence, and emotional patterns over time.
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
- -1.0 = deeply negative
-  0.0 = neutral or mixed
- +1.0 = deeply positive
Be precise — avoid defaulting to 0.0 unless truly neutral.

### 3. TRIGGERS
Extract triggers only from today's message.
Do NOT use previous entries to populate trigger lists.
Classify them as:
- situational: external events
- relational: people-related dynamics
- cognitive: thought patterns happening today

### 4. INTENSITY
How emotionally charged is this message overall?
- distress_intensity: 0.0 → 1.0
- self_harm_risk: 0.0 → 1.0
- urgency: "low" | "moderate" | "high"

### 5. LOOP DETECTION
Compare today's message against previous entries to detect recurring patterns:
- theme_loop: same life topic recurring
- emotion_loop: same emotional state recurring
- crisis_loop: repeated crisis-level entries
Set is_loop to true only if there is genuine pattern evidence in memory.

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
    "is_loop": False,
    "loop_type": "none | theme_loop | emotion_loop | crisis_loop",
    "confidence": 0.0,
    "reason": "string — cite evidence from current input and previous entries"
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
- Do not describe them as today's entries
- Use recurrence naturally when helpful
- Do not sound mechanical

### 3. CONVERSATION STYLE
- Normal journaling: 4-6 sentences
- Distress/crisis: 6-10 sentences
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
    "crisis_flag": False
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
        return {{
            "category": "fallback",
            "features": {{
                "intent": "",
                "emotional_tone": "",
                "topics": [],
                "preferences": [],
                "constraints": [],
                "memory_hooks": [],
                "crisis_flag": False,
            }},
            "summary": result.get("raw_output", ""),
        }}

    return result

def print_trace(
    relevant_entries: List[Dict[str, Any]],
    features_payload: dict,
    route_payload: dict,
    response_payload: dict,
) -> None:
    # print("\nPREVIOUS RELEVANT DAYS")
    # previous_days = {}
    # for entry in relevant_entries:
    #     d = entry.get("date")
    #     parsed = entry.get("parsed_date")
    #     days_ago = (date.today() - parsed).days if isinstance(parsed, date) else None

    #     if d not in previous_days:
    #         previous_days[d] = {
    #             "date": d,
    #             "days_ago": days_ago,
    #             "relevance_score": entry.get("relevance_score", 0.0),
    #             "reason": entry.get("reason", "")
    #         }

    # print(json.dumps(list(previous_days.values()), indent=2, ensure_ascii=False, default=json_default_serializer))

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

    print("\nFINAL SUMMARY")
    print(response_payload.get("summary", "").strip())


def main():
    user_input = input("User: ").strip()
    if not user_input:
        print("No input provided.")
        return

    user_memory_path = os.getenv("USER_MEMORY_PATH", "user_memory.md")
    response_routing_path = os.getenv("RESPONSE_ROUTING_PATH", "response_routing.md")
    top_k = int(os.getenv("MEMORY_TOP_K", "5"))

    user_memory_md = read_file(user_memory_path)
    response_routing_md = read_file(response_routing_path)

    all_entries = parse_dated_memory_entries(user_memory_md)
    previous_entries, today_entry = split_previous_and_today(all_entries)

    today_text = user_input

    relevant_entries = score_previous_entries(today_text, previous_entries, top_k=top_k)
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