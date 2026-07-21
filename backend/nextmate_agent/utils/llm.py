import os
import json
import logging
import threading
import atexit
import time
import pathlib
import itertools
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


def _load_groq_keys() -> list[str]:
    """Load all Groq API keys from GROQ_API_KEYS (comma-separated) or GROQ_API_KEY."""
    raw = os.getenv("GROQ_API_KEYS") or os.getenv("GROQ_API_KEY", "")
    keys = [k.strip() for k in raw.split(",") if k.strip()]
    return keys


_groq_key_cycle: itertools.cycle | None = None
_groq_key_lock = threading.Lock()


def _resolve_groq_api_key() -> str:
    """Returns the next Groq API key in round-robin order.
    Supports GROQ_API_KEYS (comma-separated) or single GROQ_API_KEY."""
    global _groq_key_cycle
    with _groq_key_lock:
        if _groq_key_cycle is None:
            keys = _load_groq_keys()
            if not keys:
                raise ValueError("No Groq API keys found. Set GROQ_API_KEYS or GROQ_API_KEY in .env")
            _groq_key_cycle = itertools.cycle(keys)
    return next(_groq_key_cycle)



def get_chat_model() -> ChatGroq:
    """Generation-quality model (GENERATION_MODEL). Returns a new instance per
    call so each request rotates to the next Groq API key."""
    settings = get_settings()
    return ChatGroq(
        model=settings.generation_model,
        api_key=_resolve_groq_api_key(),
        temperature=0.3,
    )


def get_fast_chat_model() -> ChatGroq:
    """Cheap/fast model (FAST_MODEL). Returns a new instance per call so each
    request rotates to the next Groq API key."""
    settings = get_settings()
    return ChatGroq(
        model=settings.fast_model,
        api_key=_resolve_groq_api_key(),
        temperature=0.2,
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