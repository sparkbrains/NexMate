import json

from langchain_groq import ChatGroq
from nextmate_agent.utils.config import get_settings
from langchain_openai import ChatOpenAI

# def get_chat_model() -> ChatOpenAI:
#     settings = get_settings()
#     if not settings.llm_api_key:
#         raise ValueError("OPENROUTER_API_KEY or LLM_API_KEY is missing in .env")
#
#     return ChatOpenAI(
#         model=settings.generation_model,
#         api_key=settings.llm_api_key,
#         base_url="https://openrouter.ai/api/v1",
#         temperature=0.3,
#         default_headers={
#             "HTTP-Referer": settings.app_referer,
#             "X-Title": settings.app_title,
#         },
#     )
def get_chat_model() -> ChatGroq:
    settings = get_settings()
    if not settings.llm_api_key:
        raise ValueError("GROQ_API_KEY or LLM_API_KEY is missing in .env")

    return ChatGroq(
        model=settings.generation_model,
        api_key=settings.llm_api_key,
        temperature=0.3,
    )


def parse_json_object(text: str) -> dict:
    raw = (text or "").strip()

    if raw.startswith("```"):
        lines = raw.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        raw = "\n".join(lines).strip()

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        start = raw.find("{")
        end = raw.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(raw[start : end + 1])
            except json.JSONDecodeError:
                pass
    return {
        "mood": "unknown",
        "core_theme": raw[:280] if raw else "",
        "core_beliefs": [],
        "triggers": [],
        "key_facts": [],
        "risk_flag": False,
    }

