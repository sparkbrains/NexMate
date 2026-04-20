import os
import json
from dotenv import load_dotenv
from openai import OpenAI


load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
MODEL = os.getenv("GENERATION_MODEL", "liquid/lfm-2.5-1.2b-thinking:free")

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
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def build_prompt(user_input: str, user_memory_md: str, response_routing_md: str) -> str:
    return f"""
You are a memory-aware assistant.

You are given:
1. The current user input
2. Persistent user memory stored in markdown
3. Response routing rules stored in markdown

Use the memory as persistent context, not as a similarity database.
Extract useful features from the current input in light of the stored memory.
Then choose the best response style/category from the routing rules.
Finally produce a concise response summary.

Current user input:
{user_input}

Persistent user memory:
{user_memory_md}

Response routing rules:
{response_routing_md}

Return valid JSON only in this exact shape:
{{
  "category": "string",
  "features": {{
    "intent": "string",
    "topics": ["string"],
    "preferences": ["string"],
    "constraints": ["string"],
    "memory_signals": ["string"]
  }},
  "summary": "string"
}}
""".strip()


def call_llm(prompt: str) -> dict:
    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {
                "role": "system",
                "content": "Return only valid JSON. Do not wrap in markdown fences.",
            },
            {
                "role": "user",
                "content": prompt,
            },
        ],
        temperature=0.2,
    )

    content = response.choices[0].message.content.strip()

    try:
        return json.loads(content)
    except json.JSONDecodeError:
        return {
            "category": "fallback",
            "features": {
                "intent": "unknown",
                "topics": [],
                "preferences": [],
                "constraints": [],
                "memory_signals": [],
            },
            "summary": content,
        }


def main():
    user_input = input("User: ").strip()
    if not user_input:
        print("No input provided.")
        return

    user_memory_md = read_file("user_memory.md")
    response_routing_md = read_file("response_routing.md")

    prompt = build_prompt(user_input, user_memory_md, response_routing_md)
    result = call_llm(prompt)

    print(result.get("summary", "").strip())


if __name__ == "__main__":
    main()