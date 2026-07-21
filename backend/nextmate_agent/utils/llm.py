import os
import json
import logging
import threading
import atexit
import time
import pathlib
from datetime import datetime
from line_profiler import LineProfiler
from mistralai.client import Mistral
from .config import get_settings
from dotenv import load_dotenv
load_dotenv()
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


def _resolve_mistral_api_key() -> str:
    """Shared API key resolution for both the generation and fast chat models.
    Checks env var first, falls back to reading .env directly (matches prior
    behavior in get_chat_model so nothing regresses for existing setups)."""
    api_key = os.getenv("MISTRAL_API_KEY")
    if not api_key or not api_key.strip():
        from pathlib import Path
        try:
            base_dir = Path(__file__).resolve().parents[2]
            env_path = base_dir / ".env"
            if env_path.exists():
                with open(env_path, "r", encoding="utf-8") as f:
                    for line in f:
                        if line.strip().startswith("MISTRAL_API_KEY="):
                            val = line.split("=", 1)[1].strip()
                            if val.startswith(('"', "'")) and val.endswith(('"', "'")):
                                val = val[1:-1]
                            if val:
                                api_key = val
                                break
        except Exception as e:
            logger.error(f"Failed to read MISTRAL_API_KEY from .env: {e}")

    if not api_key or not api_key.strip():
        raise ValueError("MISTRAL_API_KEY is missing or empty in environment configuration")

    return api_key


_cached_chat_client: Mistral | None = None
_cached_model_name: str | None = None

_cached_fast_client: Mistral | None = None
_cached_fast_model_name: str | None = None


def get_chat_model() -> tuple[Mistral, str]:
    """Return a cached Mistral client along with the model name to use,
    based on settings.generation_model."""
    global _cached_chat_client, _cached_model_name
    settings = get_settings()
    model_name = getattr(settings, "generation_model", None) or "mistral-medium-3-5"
    if _cached_chat_client is not None and _cached_model_name == model_name:
        return _cached_chat_client, _cached_model_name

    api_key = getattr(settings, "llm_api_key", None) or _resolve_mistral_api_key()
    _cached_chat_client = Mistral(api_key=api_key)
    _cached_model_name = model_name
    return _cached_chat_client, _cached_model_name


def get_fast_chat_model() -> tuple[Mistral, str]:
    """Return the same Mistral client/model as get_chat_model for unified usage."""
    # For unified model, delegate to get_chat_model
    return get_chat_model()


import re as _re
_THINK_BLOCK_RE_LLM = _re.compile(r"<think>.*?</think>", _re.DOTALL | _re.IGNORECASE)


def parse_json_object(text: str) -> dict:
    raw = (text or "").strip()

    # Defensive strip in case a reasoning model's <think> block leaked
    # through -- do this BEFORE the brace-matching fallback below, since a
    # think block discussing JSON schema could itself contain { or } and
    # confuse the naive find/rfind approach.
    if "<think>" in raw.lower():
        raw = _THINK_BLOCK_RE_LLM.sub("", raw).strip()

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


import asyncio

def _format_messages(messages: list) -> list:
    """Convert a list of {'role': ..., 'content': ...} dicts to Mistral's
    expected chat format. Mistral's chat API already accepts OpenAI-style
    {'role': ..., 'content': ...} dicts directly, so this mostly just
    validates/normalizes shape (kept as a function so call sites don't
    need to change and so we have one place to adjust formatting later).
    """
    formatted = []
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        formatted.append({"role": role, "content": content})
    return formatted

@profile
def invoke_with_logging(llm, messages: list, node_name: str, thread_id: str = "unknown") -> tuple[str, dict]:
    """Invoke a Mistral model synchronously and log token usage.
    `llm` is expected to be the (client, model_name) tuple returned by
    get_chat_model()/get_fast_chat_model().
    """
    client, model_name = llm
    formatted = _format_messages(messages)
    response = client.chat.complete(model=model_name, messages=formatted)

    text = ""
    if response.choices:
        text = response.choices[0].message.content or ""

    usage_obj = getattr(response, "usage", None)
    usage = {
        "prompt_tokens": getattr(usage_obj, "prompt_tokens", 0) if usage_obj else 0,
        "completion_tokens": getattr(usage_obj, "completion_tokens", 0) if usage_obj else 0,
        "total_tokens": getattr(usage_obj, "total_tokens", 0) if usage_obj else 0,
    }
    log_token_usage(node_name, usage, thread_id)
    return text, usage

@profile
async def ainvoke_with_logging(llm, messages: list, node_name: str, thread_id: str = "unknown") -> tuple[str, dict]:
    """Async wrapper for Mistral invocation.
    Prefers the SDK's native async client (client.chat.complete_async) when
    available, and falls back to a thread executor around the sync path
    otherwise so behavior degrades gracefully.
    """
    client, model_name = llm
    if hasattr(client.chat, "complete_async"):
        formatted = _format_messages(messages)
        response = await client.chat.complete_async(model=model_name, messages=formatted)

        text = ""
        if response.choices:
            text = response.choices[0].message.content or ""

        usage_obj = getattr(response, "usage", None)
        usage = {
            "prompt_tokens": getattr(usage_obj, "prompt_tokens", 0) if usage_obj else 0,
            "completion_tokens": getattr(usage_obj, "completion_tokens", 0) if usage_obj else 0,
            "total_tokens": getattr(usage_obj, "total_tokens", 0) if usage_obj else 0,
        }
        log_token_usage(node_name, usage, thread_id)
        return text, usage

    response, usage = await asyncio.to_thread(invoke_with_logging, llm, messages, node_name, thread_id)
    return response, usage