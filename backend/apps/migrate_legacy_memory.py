import json
import os
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from psycopg.types.json import Jsonb

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from apps.db import get_connection, init_postgres
from apps.env_loader import load_runtime_env


BASE_DIR = Path(__file__).resolve().parents[1]
LEGACY_MEMORY_DIR = BASE_DIR / "data" / "memory"
LEGACY_AUTH_DB = LEGACY_MEMORY_DIR / "auth.sqlite"
LEGACY_SUMMARIES = LEGACY_MEMORY_DIR / "summaries.jsonl"
LEGACY_THREAD_MESSAGES = LEGACY_MEMORY_DIR / "thread_messages.jsonl"
DEFAULT_LEGACY_USER_EMAIL = os.getenv("LEGACY_DEFAULT_USER_EMAIL", "demo@nextmate.local").strip().lower()


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []

    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return rows


def _parse_ts(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc)
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value).astimezone(timezone.utc)
        except ValueError:
            pass
    return datetime.now(timezone.utc)


def _load_legacy_users() -> list[dict[str, Any]]:
    if not LEGACY_AUTH_DB.exists():
        return []

    conn = sqlite3.connect(str(LEGACY_AUTH_DB))
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute("SELECT id, email, password_hash, created_at FROM users ORDER BY id").fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def _upsert_users() -> tuple[dict[int, int], int]:
    old_to_new: dict[int, int] = {}
    inserted = 0
    legacy_users = _load_legacy_users()

    with get_connection() as conn:
        with conn.cursor() as cur:
            for user in legacy_users:
                email = str(user["email"]).strip().lower()
                cur.execute(
                    """
                    INSERT INTO users (email, password_hash, created_at)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (email) DO UPDATE
                    SET password_hash = EXCLUDED.password_hash
                    RETURNING id
                    """,
                    (
                        email,
                        str(user["password_hash"]),
                        _parse_ts(user["created_at"]),
                    ),
                )
                row = cur.fetchone()
                old_to_new[int(user["id"])] = int(row["id"])
                inserted += 1
        conn.commit()

    return old_to_new, inserted


def _resolve_default_user_id(user_id_map: dict[int, int]) -> int | None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, email FROM users ORDER BY id ASC")
            rows = cur.fetchall()

    if not rows:
        return None

    for row in rows:
        if str(row["email"]).strip().lower() == DEFAULT_LEGACY_USER_EMAIL:
            return int(row["id"])
    return int(rows[0]["id"])


def _import_thread_messages(default_user_id: int | None, user_id_map: dict[int, int]) -> int:
    rows = _read_jsonl(LEGACY_THREAD_MESSAGES)
    if not rows:
        return 0

    inserted = 0
    with get_connection() as conn:
        with conn.cursor() as cur:
            for row in rows:
                legacy_user_id = row.get("user_id")
                user_id = user_id_map.get(int(legacy_user_id)) if legacy_user_id is not None else default_user_id
                if user_id is None:
                    continue

                cur.execute(
                    """
                    INSERT INTO thread_messages (user_id, thread_id, role, content, created_at)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT DO NOTHING
                    """,
                    (
                        user_id,
                        str(row.get("thread_id", "")).strip(),
                        str(row.get("role", "assistant")).strip() or "assistant",
                        str(row.get("content", "")),
                        _parse_ts(row.get("created_at")),
                    ),
                )
                inserted += cur.rowcount if cur.rowcount > 0 else 0
        conn.commit()

    return inserted


def _import_summaries(default_user_id: int | None, user_id_map: dict[int, int]) -> int:
    rows = _read_jsonl(LEGACY_SUMMARIES)
    if not rows:
        return 0

    inserted = 0
    with get_connection() as conn:
        with conn.cursor() as cur:
            for row in rows:
                legacy_user_id = row.get("user_id")
                user_id = user_id_map.get(int(legacy_user_id)) if legacy_user_id is not None else default_user_id
                if user_id is None:
                    continue

                signals = row.get("signals", [])
                if not isinstance(signals, list):
                    signals = []

                summary_text = str(row.get("summary", "")).strip()
                cur.execute(
                    """
                    INSERT INTO journal_entries (
                        user_id,
                        thread_id,
                        user_input,
                        assistant_reply,
                        summary,
                        mood,
                        signals,
                        next_focus,
                        raw_summary,
                        created_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT DO NOTHING
                    """,
                    (
                        user_id,
                        str(row.get("thread_id", "")).strip(),
                        "",
                        "",
                        summary_text,
                        str(row.get("mood", "unknown")).strip() or "unknown",
                        Jsonb(signals),
                        str(row.get("next_focus", "")).strip(),
                        Jsonb(row),
                        _parse_ts(row.get("created_at")),
                    ),
                )
                inserted += cur.rowcount if cur.rowcount > 0 else 0
        conn.commit()

    return inserted


def migrate_legacy_memory() -> dict[str, int]:
    init_postgres()
    user_id_map, users_upserted = _upsert_users()
    default_user_id = _resolve_default_user_id(user_id_map)
    messages_inserted = _import_thread_messages(default_user_id, user_id_map)
    summaries_inserted = _import_summaries(default_user_id, user_id_map)
    return {
        "users_upserted": users_upserted,
        "messages_inserted": messages_inserted,
        "summaries_inserted": summaries_inserted,
    }


def main() -> None:
    load_runtime_env()
    result = migrate_legacy_memory()
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
