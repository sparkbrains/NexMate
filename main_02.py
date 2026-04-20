import os
import json
from datetime import datetime
from dotenv import load_dotenv
from openai import OpenAI


load_dotenv()

OPENROUTER_API_KEY = "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"
MODEL = os.getenv("GENERATION_MODEL", "liquid/lfm-2.5-1.2b-thinking:free")

if not OPENROUTER_API_KEY:
    raise ValueError("OPENROUTER_API_KEY is missing in .env")

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=OPENROUTER_API_KEY,
    default_headers={
        "HTTP-Referer": "http://localhost:8000",
        "X-Title": "nexmate-memory-cli",
    },
)


def read_file(path: str) -> str:
    if not os.path.exists(path):
        return ""
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def append_memory(path: str, note: str) -> None:
    today = datetime.now().strftime("%Y-%m-%d")
    with open(path, "a", encoding="utf-8") as f:
        f.write(f"\n\n## {today}\n{note.strip()}\n")


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


def distill_memory(user_memory_md: str) -> dict:
    system_prompt = """
You are a memory distillation engine.

Your task is to read persistent markdown memory and turn it into a concise structured memory state.
Return only valid JSON.
Do not invent facts not supported by the memory file.
"""

    user_prompt = f"""
Persistent markdown memory:
{user_memory_md}

Return JSON in this exact structure:
{{
  "stable_preferences": ["string"],
  "ongoing_themes": ["string"],
  "known_triggers": ["string"],
  "known_core_beliefs": ["string"],
  "recent_patterns": ["string"],
  "sensitive_areas": ["string"],
  "memory_summary": "string"
}}
""".strip()

    result = call_json_llm(system_prompt, user_prompt)

    if result.get("parse_error") or result.get("error"):
        return {
            "stable_preferences": [],
            "ongoing_themes": [],
            "known_triggers": [],
            "known_core_beliefs": [],
            "recent_patterns": [],
            "sensitive_areas": [],
            "memory_summary": user_memory_md[:1000],
        }

    return result


def extract_features(user_input: str, distilled_memory: dict) -> dict:
    system_prompt = """
You are a psychological feature extraction engine for a memory-aware journal companion.

Analyze the user's current message using the distilled persistent memory.
Do not provide advice yet.
Return only valid JSON.
Be detailed, grounded, and structured.
If self-harm thoughts are mentioned, capture that clearly in risk and urgency fields.
"""

    user_prompt = f"""
Current user input:
{user_input}

Distilled persistent memory:
{json.dumps(distilled_memory, ensure_ascii=False, indent=2)}

Return JSON in this exact structure:
{{
  "features": {{
    "intent": "string",
    "topics": ["string"],
    "constraints": ["string"],
    "preferences": ["string"],
    "memory_hooks": ["string"]
  }},
  "emotional_profile": {{
    "primary_emotion": "string",
    "secondary_emotions": ["string"],
    "valence": 0.0,
    "arousal": 0.0,
    "distress_intensity": 0.0,
    "hopelessness_intensity": 0.0,
    "self_harm_risk_intensity": 0.0
  }},
  "memory_relevance": {{
    "relevant": true,
    "relevance_score": 0.0,
    "relevant_patterns": ["string"],
    "useful_context": ["string"],
    "contradictions": ["string"]
  }},
  "triggers": {{
    "situational": ["string"],
    "relational": ["string"],
    "cognitive": ["string"]
  }},
  "core_beliefs": [
    {{
      "belief": "string",
      "confidence": 0.0,
      "source": "current_input|memory|inferred"
    }}
  ],
  "loop_detection": {{
    "is_loop": false,
    "loop_type": "none|theme_repetition|emotional_repetition|crisis_repetition",
    "confidence": 0.0,
    "reason": "string"
  }},
  "risk_flags": {{
    "self_harm": false,
    "burnout": false,
    "social_conflict": false,
    "functional_overload": false,
    "urgency": "low|moderate|high"
  }},
  "summary_note": "A short memory note to append later"
}}
""".strip()

    result = call_json_llm(system_prompt, user_prompt)

    if result.get("parse_error") or result.get("error"):
        return {
            "features": {
                "intent": "unknown",
                "topics": [],
                "constraints": [],
                "preferences": [],
                "memory_hooks": [],
            },
            "emotional_profile": {
                "primary_emotion": "unknown",
                "secondary_emotions": [],
                "valence": 0.0,
                "arousal": 0.0,
                "distress_intensity": 0.0,
                "hopelessness_intensity": 0.0,
                "self_harm_risk_intensity": 0.0,
            },
            "memory_relevance": {
                "relevant": False,
                "relevance_score": 0.0,
                "relevant_patterns": [],
                "useful_context": [],
                "contradictions": [],
            },
            "triggers": {
                "situational": [],
                "relational": [],
                "cognitive": [],
            },
            "core_beliefs": [],
            "loop_detection": {
                "is_loop": False,
                "loop_type": "none",
                "confidence": 0.0,
                "reason": "Parsing failed.",
            },
            "risk_flags": {
                "self_harm": False,
                "burnout": False,
                "social_conflict": False,
                "functional_overload": False,
                "urgency": "low",
            },
            "summary_note": "",
            "raw_output": result.get("raw_output", ""),
        }

    return result


def choose_response_route(features_payload: dict, response_routing_md: str) -> dict:
    system_prompt = """
You are a response router.

Use the structured extracted features and the routing rules to choose the single best response route.
Return only valid JSON.
"""

    user_prompt = f"""
Structured extracted features:
{json.dumps(features_payload, ensure_ascii=False, indent=2)}

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
    distilled_memory: dict,
    response_category_md: str,
    features_payload: dict,
    route_payload: dict,
) -> str:
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

**What you remember about this user (persistent memory):**
{json.dumps(distilled_memory, ensure_ascii=False, indent=2)}

**Structured extracted features:**
{json.dumps(features_payload, ensure_ascii=False, indent=2)}

**Chosen response route:**
{json.dumps(route_payload, ensure_ascii=False, indent=2)}

**Response category rules:**
{response_category_md}

---

## RESPONSE RULES

### 1. EMOTIONAL TRIAGE (Always check first)
Scan the user's message for signals of:
- Sadness, loneliness, hopelessness, or grief → respond with gentle empathy first, advice second
- Frustration or anger → validate their feelings before anything else
- Self-harm, suicidal thoughts, or crisis language → IMMEDIATELY shift to counselor mode:
  * Acknowledge their pain with deep compassion
  * Do NOT lecture or panic
  * Gently encourage professional support
  * Stay with them in the conversation — do not abandon or redirect abruptly
  * Use phrases like "I'm really glad you shared this with me" and "You don't have to go through this alone"

### 2. EMOTIONAL CATEGORIES
Classify the user's emotional state as one of:
- `joyful` → celebrate with them, share in their happiness
- `neutral` → engage curiously, ask a follow-up question about their day
- `sad` → offer comfort, validate, and gently explore what's weighing on them
- `frustrated` → acknowledge their frustration, don't minimize it
- `anxious` → calm and grounding tone, help them feel safe
- `crisis` → counselor mode (see above)

### 3. MEMORY INTEGRATION
- Reference past memories naturally, like a friend who remembers
- Example: "You mentioned last week you were stressed about your presentation — how did that go?"
- Never make memory references feel mechanical or list-like

### 4. CONVERSATION STYLE
- Keep responses concise but meaningful
- For normal journaling: 4–6 sentences
- For distress or crisis: 6–10 sentences with more emotional presence
- End with a gentle, open-ended question to keep the conversation going unless immediate safety concerns make that inappropriate
- Mirror the user's energy — if they're light, be light; if they're heavy, slow down and be present
- Avoid bullet points or headers in the actual chat response — write naturally

---

## YOUR TASK

1. Identify the user's emotional state and intent
2. Check for any distress signals that require counselor mode
3. Pull in any relevant memories to personalize your response
4. Determine the best response category
5. Craft a warm, human response summary

---

## OUTPUT FORMAT

Return strictly valid JSON in this exact shape (no extra text, no markdown fences):
{{
  "category": "string (joyful | neutral | sad | frustrated | anxious | crisis)",
  "features": {{
    "intent": "string (what the user is expressing or seeking)",
    "emotional_tone": "string (detected emotional undercurrent)",
    "topics": ["string (key themes or subjects mentioned)"],
    "preferences": ["string (any personal preferences or patterns noted)"],
    "constraints": ["string (any sensitivities or things to avoid)"],
    "memory_hooks": ["string (relevant past memories to reference, if any)"],
    "crisis_flag": false
  }},
  "summary": "string (the actual friendly, warm response to send to the user — written as Nexmate, in first person, conversational tone)"
}}
""".strip()


def generate_response(
    user_input: str,
    distilled_memory: dict,
    response_routing_md: str,
    features_payload: dict,
    route_payload: dict,
) -> dict:
    prompt = build_generation_prompt(
        user_input=user_input,
        distilled_memory=distilled_memory,
        response_category_md=response_routing_md,
        features_payload=features_payload,
        route_payload=route_payload,
    )

    system_prompt = """
You are a reflective journaling companion.
Return only valid JSON.
Follow the requested structure exactly.
"""

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
    distilled_memory: dict,
    features_payload: dict,
    route_payload: dict,
    response_payload: dict,
) -> None:
    print("\n========== MEMORY DISTILLATION ==========")
    print(json.dumps(distilled_memory, indent=2, ensure_ascii=False))

    print("\n========== FEATURES ==========")
    print(json.dumps(features_payload.get("features", {}), indent=2, ensure_ascii=False))

    print("\n====== EMOTIONAL PROFILE ======")
    print(json.dumps(features_payload.get("emotional_profile", {}), indent=2, ensure_ascii=False))

    print("\n====== MEMORY RELEVANCE ======")
    print(json.dumps(features_payload.get("memory_relevance", {}), indent=2, ensure_ascii=False))

    print("\n========= TRIGGERS =========")
    print(json.dumps(features_payload.get("triggers", {}), indent=2, ensure_ascii=False))

    print("\n======= CORE BELIEFS =======")
    print(json.dumps(features_payload.get("core_beliefs", []), indent=2, ensure_ascii=False))

    print("\n======= LOOP STATUS ========")
    print(json.dumps(features_payload.get("loop_detection", {}), indent=2, ensure_ascii=False))

    print("\n======== RISK FLAGS ========")
    print(json.dumps(features_payload.get("risk_flags", {}), indent=2, ensure_ascii=False))

    print("\n====== RESPONSE ROUTE ======")
    print(json.dumps(route_payload, indent=2, ensure_ascii=False))

    print("\n====== RESPONSE OUTPUT ======")
    print(json.dumps(response_payload, indent=2, ensure_ascii=False))

    print("\n======= FINAL SUMMARY =======")
    print(response_payload.get("summary", "").strip())


def main():
    user_input = input("User: ").strip()
    if not user_input:
        print("No input provided.")
        return

    user_memory_path = "user_memory.md"
    response_routing_path = "response_routing.md"

    user_memory_md = read_file(user_memory_path)
    response_routing_md = read_file(response_routing_path)

    distilled_memory = distill_memory(user_memory_md)
    features_payload = extract_features(user_input, distilled_memory)
    route_payload = choose_response_route(features_payload, response_routing_md)
    response_payload = generate_response(
        user_input=user_input,
        distilled_memory=distilled_memory,
        response_routing_md=response_routing_md,
        features_payload=features_payload,
        route_payload=route_payload,
    )

    print_trace(
        distilled_memory=distilled_memory,
        features_payload=features_payload,
        route_payload=route_payload,
        response_payload=response_payload,
    )

    summary_note = features_payload.get("summary_note")
    if summary_note:
        append_memory(user_memory_path, f"Summary: {summary_note}")


if __name__ == "__main__":
    main()