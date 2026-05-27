import asyncio
from concurrent.futures import ThreadPoolExecutor
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


def _ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _to_json(data: Any) -> str:
    try:
        return json.dumps(data, indent=2, ensure_ascii=False)
    except (TypeError, ValueError):
        return str(data)


def _log_path(thread_id: str) -> Path:
    base = os.getenv("NODE_LOG_PATH", "data/logs")
    safe_thread_id = thread_id.replace(":", "_")
    return Path(base) / f"{safe_thread_id}.txt"


def _build_log_lines(
    node_name: str,
    inputs: dict[str, Any] | None = None,
    outputs: dict[str, Any] | None = None,
    extra: dict[str, Any] | None = None,
) -> list[str]:
    lines: list[str] = []
    lines.append("=" * 60)
    lines.append(f"NODE: {node_name}")
    lines.append(f"TIME: {_now()}")
    lines.append("-" * 60)

    if inputs:
        lines.append("INPUTS:")
        for key, value in inputs.items():
            lines.append(f"  [{key}]:")
            lines.append(_indent(_to_json(value)))
        lines.append("")

    if outputs:
        lines.append("OUTPUTS:")
        for key, value in outputs.items():
            lines.append(f"  [{key}]:")
            lines.append(_indent(_to_json(value)))
        lines.append("")

    if extra:
        lines.append("EXTRA:")
        for key, value in extra.items():
            lines.append(f"  [{key}]:")
            lines.append(_indent(_to_json(value)))
        lines.append("")

    lines.append("\n")
    return lines


def _write_log_lines(path: Path, lines: list[str]) -> None:
    with path.open("a", encoding="utf-8") as f:
        f.write("\n".join(lines))


async def _write_log_lines_async(path: Path, lines: list[str]) -> None:
    await asyncio.to_thread(_write_log_lines, path, lines)


def _handle_background_task(task: asyncio.Task[None]) -> None:
    if task.cancelled():
        return
    exc = task.exception()
    if exc is not None:
        logger.error("Async node logging failed", exc_info=exc)


_log_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="node_log")


def _do_log(thread_id: str, node_name: str, inputs, outputs, extra) -> None:
    """Actual logging work — runs in a background thread."""
    try:
        path = _log_path(thread_id)
        _ensure_parent(path)
        lines = _build_log_lines(node_name, inputs, outputs, extra)
        _write_log_lines(path, lines)
    except Exception:
        logger.exception("Background node logging failed for %s", node_name)


def log_node(
    thread_id: str,
    node_name: str,
    inputs: dict[str, Any] | None = None,
    outputs: dict[str, Any] | None = None,
    extra: dict[str, Any] | None = None,
) -> None:
    """Fire-and-forget node logging via background thread pool."""
    _log_executor.submit(_do_log, thread_id, node_name, inputs, outputs, extra)


async def alog_node(
    thread_id: str,
    node_name: str,
    inputs: dict[str, Any] | None = None,
    outputs: dict[str, Any] | None = None,
    extra: dict[str, Any] | None = None,
) -> None:
    path = _log_path(thread_id)
    _ensure_parent(path)
    lines = _build_log_lines(node_name, inputs, outputs, extra)
    await _write_log_lines_async(path, lines)


def _indent(text: str, width: int = 4) -> str:
    prefix = " " * width
    return "\n".join(prefix + line for line in text.splitlines())
