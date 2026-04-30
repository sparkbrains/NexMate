import os
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Iterator

import psycopg
from psycopg.rows import dict_row


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def get_database_url() -> str:
    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url:
        raise RuntimeError("DATABASE_URL is required")
    return database_url


@contextmanager
def get_connection(*, autocommit: bool = False) -> Iterator[psycopg.Connection]:
    with psycopg.connect(get_database_url(), row_factory=dict_row, autocommit=autocommit) as conn:
        yield conn


def init_postgres() -> None:
    with get_connection(autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id BIGSERIAL PRIMARY KEY,
                    email TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL
                )
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS sessions (
                    token TEXT PRIMARY KEY,
                    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    created_at TIMESTAMPTZ NOT NULL,
                    expires_at TIMESTAMPTZ NOT NULL
                )
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS thread_messages (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL,
                    thread_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL
                )
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS journal_entries (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL,
                    thread_id TEXT NOT NULL,
                    user_input TEXT NOT NULL,
                    assistant_reply TEXT NOT NULL,
                    summary TEXT NOT NULL,
                    mood TEXT NOT NULL,
                    signals JSONB NOT NULL DEFAULT '[]'::jsonb,
                    next_focus TEXT NOT NULL,
                    raw_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
                    created_at TIMESTAMPTZ NOT NULL
                )
                """
            )
            cur.execute("CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)")
            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_thread_messages_user_thread_created
                ON thread_messages(user_id, thread_id, created_at)
                """
            )
            cur.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS idx_thread_messages_import_dedupe
                ON thread_messages(user_id, thread_id, role, created_at, content)
                """
            )
            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_thread_messages_user_updated
                ON thread_messages(user_id, created_at DESC)
                """
            )
            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_journal_entries_user_thread_created
                ON journal_entries(user_id, thread_id, created_at)
                """
            )
            cur.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_entries_import_dedupe
                ON journal_entries(user_id, thread_id, created_at, summary)
                """
            )
            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_journal_entries_user_created
                ON journal_entries(user_id, created_at DESC)
                """
            )
            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_journal_entries_user_mood
                ON journal_entries(user_id, mood)
                """
            )
            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_journal_entries_signals_gin
                ON journal_entries
                USING GIN (signals)
                """
            )
