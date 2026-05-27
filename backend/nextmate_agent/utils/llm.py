import os
import json
import logging
import threading
import atexit
import time
import pathlib
from datetime import datetime
from line_profiler import LineProfiler
from langchain_groq import ChatGroq
from nextmate_agent.utils.config import get_settings
from langchain_openai import ChatOpenAI

logger = logging.getLogger(__name__)

profiling_dir = pathlib.Path(__file__).resolve().parents[2] / "profiling"
profiling_dir.mkdir(parents=True, exist_ok=True)

_profiler = None
_profiler_enabled = False
_profiler_thread = None

if os.getenv("DISABLE_GLOBAL_LINE_PROFILER") != "1":
    try:
        _profiler = LineProfiler()
        _profiler_enabled = True
    except ImportError:
        _profiler = None
        _profiler_enabled = False
def profile(func):
    if _profiler_enabled and _profiler is not None:
        _profiler.add_function(func)
    return func

def _start_background_profiler():
    global _profiler_thread

    if not _profiler_enabled or _profiler is None:
        return

    _profiler.enable_by_count()

    def _flush_loop():
        while True:
            time.sleep(30)
            try:
                _profiler.disable_by_count()
                _profiler.dump_stats(profiling_dir / 'node_line_profile.prof')
                _profiler.enable_by_count()
            except Exception as e:
                logger.error(f"Error dumping line profiler stats: {e}")

    _profiler_thread = threading.Thread(target=_flush_loop, daemon=True)
    _profiler_thread.start()
    logger.info("Background line profiler thread started")
    if os.getenv("DISABLE_GLOBAL_LINE_PROFILER") != "1":
        _start_background_profiler()

atexit.register(lambda: _profiler.dump_stats(profiling_dir / 'node_line_profile.prof') if _profiler_enabled and _profiler is not None else None)
def log_token_usage(node_name: str, usage_metadata: dict, thread_id: str = "unknown") -> None:
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
#         raise ValueError("OPENROUTER_API_KEY or LLM_API_KEY is missing in ..env")
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
#         raise ValueError("OPENROUTER_API_KEY or LLM_API_KEY is missing in ..env")
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

_cached_chat_model: ChatGroq | None = None
_cached_model_name: str | None = None


def get_chat_model() -> ChatGroq:
    global _cached_chat_model, _cached_model_name
    settings = get_settings()

    # Return cached instance if model hasn't changed
    if _cached_chat_model is not None and _cached_model_name == settings.generation_model:
        return _cached_chat_model

    api_key = os.getenv("GROQ_API_KEY")
    if not api_key or not api_key.strip():
        from pathlib import Path
        try:
            base_dir = Path(__file__).resolve().parents[2]
            env_path = base_dir / ".env"
            if env_path.exists():
                with open(env_path, "r", encoding="utf-8") as f:
                    for line in f:
                        if line.strip().startswith("GROQ_API_KEY="):
                            val = line.split("=", 1)[1].strip()
                            if val.startswith(('"', "'")) and val.endswith(('"', "'")):
                                val = val[1:-1]
                            if val:
                                api_key = val
                                break
        except Exception as e:
            logger.error(f"Failed to read GROQ_API_KEY from .env: {e}")

    if not api_key or not api_key.strip():
        raise ValueError("GROQ_API_KEY is missing or empty in environment configuration")

    _cached_chat_model = ChatGroq(
        model=settings.generation_model,
        api_key=api_key,
        temperature=0.3,
    )
    _cached_model_name = settings.generation_model
    return _cached_chat_model



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


@profile
@profile
async def ainvoke_with_logging(llm, messages: list, node_name: str, thread_id: str = "unknown") -> tuple[str, dict]:

    response = await llm.ainvoke(messages)
    usage = getattr(response, "usage_metadata", {})
    log_token_usage(node_name, usage, thread_id)
    return response.content, usage

@profile
@profile
def invoke_with_logging(llm, messages: list, node_name: str, thread_id: str = "unknown") -> tuple[str, dict]:
    response = llm.invoke(messages)
    usage = getattr(response, "usage_metadata", {})
    log_token_usage(node_name, usage, thread_id)
    return response.content, usage

