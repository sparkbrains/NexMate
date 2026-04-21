import json
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from apps.api.config import THREAD_LOG_PATH
from nextmate_agent.utils.config import get_settings


def _ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return rows


def _write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    _ensure_parent(path)
    with path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


def append_jsonl(path: Path, item: dict[str, Any]) -> None:
    _ensure_parent(path)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(item, ensure_ascii=False) + "\n")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def chunk_text(text: str, chunk_size: int) -> list[str]:
    clean = text or ""
    if not clean:
        return [""]

    # Split into word-like chunks while preserving whitespace, then emit
    # configurable groups (default 1 => true word-by-word stream feel).
    tokens = re.findall(r"\S+\s*", clean)
    if not tokens:
        return [clean]

    if chunk_size <= 0:
        chunk_size = 1

    chunks: list[str] = []
    for i in range(0, len(tokens), chunk_size):
        chunks.append("".join(tokens[i : i + chunk_size]))
    return chunks


def append_thread_message(thread_id: str, role: str, content: str) -> None:
    append_jsonl(
        THREAD_LOG_PATH,
        {
            "thread_id": thread_id,
            "role": role,
            "content": content,
            "created_at": utc_now(),
        },
    )


def list_threads() -> list[dict[str, str]]:
    rows = _read_jsonl(THREAD_LOG_PATH)
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        thread_id = str(row.get("thread_id", "")).strip()
        if not thread_id:
            continue
        grouped.setdefault(thread_id, []).append(row)

    threads: list[dict[str, str]] = []
    for thread_id, items in grouped.items():
        items.sort(key=lambda x: str(x.get("created_at", "")))
        user_messages = [str(x.get("content", "")).strip() for x in items if str(x.get("role", "")) == "user"]
        user_messages = [m for m in user_messages if m]

        title_parts = user_messages[:2]
        if not title_parts:
            title = "New thread"
        else:
            title = " | ".join(title_parts)
            if len(title) > 56:
                title = title[:56] + "…"

        last = items[-1]
        last_content = str(last.get("content", "")).strip()
        preview = last_content[:70] if last_content else "New thread"
        threads.append(
            {
                "thread_id": thread_id,
                "updated_at": str(last.get("created_at", "")),
                "title": title,
                "preview": preview,
            }
        )

    threads.sort(key=lambda t: t["updated_at"], reverse=True)
    return threads


def get_thread_messages(thread_id: str) -> list[dict[str, str]]:
    rows = _read_jsonl(THREAD_LOG_PATH)
    output: list[dict[str, str]] = []
    for row in rows:
        if str(row.get("thread_id", "")) != thread_id:
            continue
        output.append(
            {
                "role": str(row.get("role", "assistant")),
                "content": str(row.get("content", "")),
                "created_at": str(row.get("created_at", "")),
            }
        )
    output.sort(key=lambda m: m["created_at"])
    return output


def _delete_thread_from_jsonl(path: Path, thread_id: str) -> int:
    rows = _read_jsonl(path)
    keep = [row for row in rows if str(row.get("thread_id", "")) != thread_id]
    removed = len(rows) - len(keep)
    if removed > 0:
        _write_jsonl(path, keep)
    return removed


def _delete_thread_from_checkpoint_db(thread_id: str, checkpoint_db_path: Path) -> int:
    if not checkpoint_db_path.exists():
        return 0

    deleted_total = 0
    try:
        conn = sqlite3.connect(str(checkpoint_db_path))
        try:
            tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
            for (table_name,) in tables:
                if table_name.startswith("sqlite_"):
                    continue
                try:
                    columns = conn.execute(f"PRAGMA table_info('{table_name}')").fetchall()
                except sqlite3.DatabaseError:
                    continue
                has_thread_id = any(str(col[1]) == "thread_id" for col in columns)
                if not has_thread_id:
                    continue
                cur = conn.execute(f"DELETE FROM '{table_name}' WHERE thread_id = ?", (thread_id,))
                deleted_total += cur.rowcount if cur.rowcount > 0 else 0
            conn.commit()
        finally:
            conn.close()
    except sqlite3.DatabaseError:
        return 0
    return deleted_total


def delete_thread_everywhere(thread_id: str) -> dict[str, Any]:
    settings = get_settings()
    removed_messages = _delete_thread_from_jsonl(THREAD_LOG_PATH, thread_id)
    removed_summaries = _delete_thread_from_jsonl(Path(settings.summary_store_path), thread_id)
    removed_checkpoints = _delete_thread_from_checkpoint_db(thread_id, Path(settings.checkpoint_db_path))

    return {
        "thread_id": thread_id,
        "removed_messages": removed_messages,
        "removed_summaries": removed_summaries,
        "removed_checkpoints": removed_checkpoints,
    }
