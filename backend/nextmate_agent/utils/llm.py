import json
import logging
from datetime import datetime

from langchain_groq import ChatGroq
from nextmate_agent.utils.config import get_settings
from langchain_openai import ChatOpenAI

logger = logging.getLogger(__name__)

def log_token_usage(node_name: str, usage_metadata: dict, thread_id: str = "unknown") -> None:
    """Log token usage to a dedicated log file."""
    if not usage_metadata:
        return
    
    timestamp = datetime.now().isoformat()
    prompt_tokens = usage_metadata.get("prompt_tokens", 0)
    completion_tokens = usage_metadata.get("completion_tokens", 0)
    total_tokens = usage_metadata.get("total_tokens", prompt_tokens + completion_tokens)
    
    log_entry = {
        "timestamp": timestamp,
        "thread_id": thread_id,
        "node_name": node_name,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": total_tokens
    }
    
    try:
        with open("data/logs/token_usage.log", "a", encoding="utf-8") as f:
            f.write(json.dumps(log_entry) + "\n")
    except Exception as e:
        logger.error(f"Failed to log token usage: {e}")
    
    logger.info(f"Token usage - {node_name}: {total_tokens} tokens (prompt: {prompt_tokens}, completion: {completion_tokens})")
#
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


def invoke_with_logging(llm, messages: list, node_name: str, thread_id: str = "unknown") -> tuple[str, dict]:
    """Invoke LLM and log token usage."""
    response = llm.invoke(messages)
    usage = getattr(response, 'usage_metadata', {})
    log_token_usage(node_name, usage, thread_id)
    return response.content, usage

