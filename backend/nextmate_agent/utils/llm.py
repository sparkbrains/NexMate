import os
import json
import logging
import threading
import atexit
import time
import pathlib
from datetime import datetime
from types import SimpleNamespace
from line_profiler import LineProfiler
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


# --- provider selection --------------------------------------------------
#
# Gemini-only. get_chat_model()/get_fast_chat_model() always build a fresh
# Gemini client. The wrapper below still exposes the SAME shape that
# invoke_with_logging / ainvoke_with_logging expect -- a (client,
# model_name) tuple where client.chat.complete(model=..., messages=...)
# returns an object with .choices[0].message.content and
# .usage.{prompt_tokens,completion_tokens,total_tokens}, and
# client.chat.complete_async(...) does the same async. This means every
# call site elsewhere (loop_service.py, journal_loop_service.py,
# thread_service.py, etc.) needs ZERO changes.
#
# IMPORTANT: nothing here is cached. Every call to get_chat_model() /
# get_fast_chat_model() reads straight from the environment (via
# load_dotenv()'s already-populated os.environ) and builds a brand new
# client. This trades a small amount of per-call overhead for always
# reflecting the current .env / environment -- no stale cached client if
# the API key or model name changes at runtime.


def _resolve_gemini_api_key() -> str:
    """Env var first (GEMINI_API_KEY, falling back to GOOGLE_API_KEY since
    that's what the google-genai SDK itself also checks), then a direct
    .env read as a last resort."""
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key or not api_key.strip():
        from pathlib import Path
        try:
            base_dir = Path(__file__).resolve().parents[2]
            env_path = base_dir / ".env"
            if env_path.exists():
                with open(env_path, "r", encoding="utf-8") as f:
                    for line in f:
                        stripped = line.strip()
                        if stripped.startswith("GEMINI_API_KEY=") or stripped.startswith("GOOGLE_API_KEY="):
                            val = stripped.split("=", 1)[1].strip()
                            if val.startswith(('"', "'")) and val.endswith(('"', "'")):
                                val = val[1:-1]
                            if val:
                                api_key = val
                                break
        except Exception as e:
            logger.error(f"Failed to read GEMINI_API_KEY from .env: {e}")

    if not api_key or not api_key.strip():
        raise ValueError(
            "GEMINI_API_KEY (or GOOGLE_API_KEY) is missing or empty in environment configuration"
        )

    return api_key


class _GeminiChatNamespace:
    """Mimics a Mistral-shaped `client.chat` surface: a sync .complete(...)
    and an async .complete_async(...), both returning a Mistral-shaped
    response object so invoke_with_logging/ainvoke_with_logging don't need
    to know or care which provider is actually behind them."""

    def __init__(self, genai_client):
        self._client = genai_client

    @staticmethod
    def _split_system_and_contents(messages: list) -> tuple[str, list]:
        """Gemini takes system instructions separately from the turn history,
        and turns must use role 'user'/'model' rather than 'user'/'assistant'.
        Any number of system-role messages get concatenated in order; every
        other message is mapped into Gemini's Content/Part shape."""
        system_parts: list[str] = []
        contents: list[dict] = []
        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "") or ""
            if role == "system":
                system_parts.append(content)
                continue
            gemini_role = "model" if role == "assistant" else "user"
            contents.append({"role": gemini_role, "parts": [{"text": content}]})
        return "\n\n".join(system_parts), contents

    @staticmethod
    def _wrap_response(response) -> SimpleNamespace:
        text = ""
        try:
            text = response.text or ""
        except Exception:
            # .text raises if the response was blocked/empty; fall back to ""
            # so parse_json_object's fallback branch handles it gracefully.
            text = ""

        usage_meta = getattr(response, "usage_metadata", None)
        prompt_tokens = getattr(usage_meta, "prompt_token_count", 0) or 0
        completion_tokens = getattr(usage_meta, "candidates_token_count", 0) or 0
        total_tokens = getattr(usage_meta, "total_token_count", 0) or (prompt_tokens + completion_tokens)

        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=text))],
            usage=SimpleNamespace(
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=total_tokens,
            ),
        )

    def complete(self, model: str, messages: list):
        from google.genai import types

        system_instruction, contents = self._split_system_and_contents(messages)
        config = types.GenerateContentConfig(
            system_instruction=system_instruction or None,
            # We never pass `tools` here, so AFC has nothing to do -- it
            # was just adding an "AFC is enabled with max remote calls: 10"
            # line to every single call's logs.
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        )
        response = self._client.models.generate_content(
            model=model,
            contents=contents,
            config=config,
        )
        return self._wrap_response(response)

    async def complete_async(self, model: str, messages: list):
        from google.genai import types

        system_instruction, contents = self._split_system_and_contents(messages)
        config = types.GenerateContentConfig(
            system_instruction=system_instruction or None,
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        )
        response = await self._client.aio.models.generate_content(
            model=model,
            contents=contents,
            config=config,
        )
        return self._wrap_response(response)


class _GeminiClient:
    """Thin wrapper so `client.chat.complete(...)` / `client.chat.complete_async(...)`
    keeps get_chat_model()'s (client, model_name) tuple contract that
    invoke_with_logging/ainvoke_with_logging expect."""

    def __init__(self, api_key: str):
        from google import genai

        self._genai_client = genai.Client(api_key=api_key)
        self.chat = _GeminiChatNamespace(self._genai_client)


def _get_gemini_chat_model() -> tuple[_GeminiClient, str]:
    """Builds a fresh Gemini client every call -- no caching, so changes to
    GEMINI_API_KEY/GOOGLE_API_KEY/GENERATION_MODEL take effect on the very
    next call. Uses Google's "-latest" alias by default rather than a
    pinned version string, since Google retires dated model IDs on short
    notice; override via GENERATION_MODEL if you want a specific pinned
    version instead."""
    model_name = os.getenv("GENERATION_MODEL") or "gemini-flash-latest"
    api_key = _resolve_gemini_api_key()
    client = _GeminiClient(api_key=api_key)
    return client, model_name


def get_chat_model():
    """Return a (client, model_name) tuple for Gemini. Always reads current
    environment/.env values and builds a fresh client -- nothing is cached
    across calls."""
    return _get_gemini_chat_model()


def get_fast_chat_model():
    """Return the same client/model as get_chat_model for unified usage
    (unchanged architecture -- both fast and regular paths share one model)."""
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
    """Convert a list of {'role': ..., 'content': ...} dicts to the expected
    chat format. Kept as a function so call sites don't need to change and
    so there's one place to adjust formatting later.
    """
    formatted = []
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        formatted.append({"role": role, "content": content})
    return formatted

@profile
def invoke_with_logging(llm, messages: list, node_name: str, thread_id: str = "unknown") -> tuple[str, dict]:
    """Invoke Gemini synchronously and log token usage. `llm` is expected
    to be the (client, model_name) tuple returned by
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
    """Async wrapper. Prefers the client's native async path
    (client.chat.complete_async) -- the Gemini adapter exposes this -- and
    falls back to a thread executor around the sync path otherwise so
    behavior degrades gracefully.
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
