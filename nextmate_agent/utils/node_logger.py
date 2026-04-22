import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


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
    return Path(base) / f"{thread_id}.txt"


def log_node(
    thread_id: str,
    node_name: str,
    inputs: dict[str, Any] | None = None,
    outputs: dict[str, Any] | None = None,
    extra: dict[str, Any] | None = None,
) -> None:
    path = _log_path(thread_id)
    _ensure_parent(path)

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

    with path.open("a", encoding="utf-8") as f:
        f.write("\n".join(lines))


def _indent(text: str, width: int = 4) -> str:
    prefix = " " * width
    return "\n".join(prefix + line for line in text.splitlines())
