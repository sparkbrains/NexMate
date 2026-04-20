import os
import json
from datetime import datetime
from dotenv import load_dotenv
from openai import OpenAI


load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
MODEL = os.getenv("GENERATION_MODEL", "openrouter/free")

if not OPENROUTER_API_KEY:
    raise ValueError("OPENROUTER_API_KEY is missing in .env")

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=OPENROUTER_API_KEY,
    default_headers={
        "HTTP-Referer": "http://localhost:8000",
        "X-Title": "memory-cli",
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


def call_json_llm(system_prompt: str, user_prompt: str) -> dict:
    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.3,
    )

    content = response.choices[0].message.content.strip()

    if content.startswith("```"):
        content = content.strip("`")
        content = content.replace("json", "", 1).strip()

    try:
        return json.loads(content)
    except json.JSONDecodeError:
        return {"raw_output": content}


def extract_features(user_input: str, user_memory_md: str) -> dict:
    system_prompt = """
You extract structured features from the user's current message using persistent memory context.

Return only valid JSON.
Be detailed and thoughtful.
If the message suggests distress, hopelessness, or self-harm thoughts, reflect that clearly in risk signals.
"""

    user_prompt = f"""
Current user input:
{user_input}

Persistent user memory:
{user_memory_md}

Return JSON in this exact shape:
{{
  "intent": "string",
  "topics": ["string"],
  "preferences": ["string"],
  "constraints": ["string"],
  "emotional_state": {{
    "primary": "string",
    "secondary": ["string"],
    "intensity": "low|moderate|high"
  }},
  "risk_signals": {{
    "self_harm": true,
    "hopelessness": true,
    "social_conflict": true,
    "burnout": true,
    "urgency": "low|moderate|high"
  }},
  "memory_relevance": {{
    "relevant_patterns": ["string"],
    "contradictions": ["string"],
    "useful_context": ["string"]
  }},
  "loop_detection": {{
    "is_loop": false,
    "reason": "string"
  }},
  "summary_note": "A concise memory note that can be saved for future use"
}}
""".strip()

    return call_json_llm(system_prompt, user_prompt)


def generate_response(user_input: str, user_memory_md: str, response_routing_md: str, features: dict) -> dict:
    system_prompt = """
You are a careful, supportive, memory-aware assistant.

Return only valid JSON.
Write a longer, thoughtful response summary rather than a one-line result.

Important:
- If self-harm thoughts are present, respond supportively and directly.
- Encourage immediate support from a trusted person or local emergency/crisis resource if risk seems meaningful.
- Be empathetic, calm, and non-judgmental.
- Do not sound robotic or overly generic.
"""

    user_prompt = f"""
Current user input:
{user_input}

Persistent user memory:
{user_memory_md}

Response routing rules:
{response_routing_md}

Extracted features:
{json.dumps(features, ensure_ascii=False, indent=2)}

Return JSON in this exact shape:
{{
  "category": "string",
  "summary": "string"
}}

The summary should:
- be thoughtful and clearly elaborated,
- reflect the user's emotional state,
- use memory when relevant,
- mention a next step,
- and if self-harm thoughts are present, encourage reaching out right now to a trusted person or urgent support.
""".strip()

    return call_json_llm(system_prompt, user_prompt)


def main():
    user_input = input("User: ").strip()
    if not user_input:
        print("No input provided.")
        return

    user_memory_path = "user_memory.md"
    response_routing_path = "response_routing.md"

    user_memory_md = read_file(user_memory_path)
    response_routing_md = read_file(response_routing_path)

    features = extract_features(user_input, user_memory_md)
    result = generate_response(user_input, user_memory_md, response_routing_md, features)

    summary = result.get("summary", "").strip()
    print(summary)

    summary_note = features.get("summary_note")
    if summary_note:
        append_memory(user_memory_path, f"Summary: {summary_note}")


if __name__ == "__main__":
    main()