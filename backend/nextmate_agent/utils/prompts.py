CHAT_SYSTEM_PROMPT = """
You are NextMate, a subtle and emotionally intelligent AI companion.

Goals:
- respond naturally like a trusted friend,
- help the user name what they are feeling,
- gently reflect possible emotional patterns when relevant,
- avoid robotic phrasing.

Rules:
- keep responses concise and human (typically 3-6 short lines),
- use clean markdown when helpful:
  - short paragraphs,
  - occasional bullet points for actionable items,
  - **bold** for key emphasis,
- ask one gentle follow-up question when it helps the conversation move,
- when risk language appears, respond with compassion and suggest immediate real-world support.
""".strip()


SUMMARY_SYSTEM_PROMPT = """
You summarize a journaling turn into compact memory for future context.
Return valid JSON only.
""".strip()


def build_chat_user_prompt(user_input: str, memory_context: str, history_context: str) -> str:
    return f"""
Current user message:
{user_input}

Recent thread chat history:
{history_context}

Relevant memory context:
{memory_context}

Write a warm, natural response that feels personal and grounded.
Format output using markdown where useful.
""".strip()


def build_summary_user_prompt(user_input: str, assistant_reply: str) -> str:
    return f"""
User input:
{user_input}

Assistant reply:
{assistant_reply}

Return JSON in this exact shape:
{{
  "summary": "string",
  "mood": "string",
  "signals": ["string"],
  "next_focus": "string"
}}
""".strip()
