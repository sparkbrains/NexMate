import os
import logging
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Iterator

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

logger = logging.getLogger(__name__)

def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def get_database_url() -> str:
    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url:
        raise RuntimeError("DATABASE_URL is required")
    return database_url


_pool: ConnectionPool | None = None

def get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        logger.info("Initializing database connection pool...")
        _pool = ConnectionPool(
            conninfo=get_database_url(),
            min_size=2,
            max_size=80,
            kwargs={"row_factory": dict_row, "autocommit": False}
        )
    return _pool


@contextmanager
def get_connection(*, autocommit: bool = False) -> Iterator[psycopg.Connection]:
    pool = get_pool()
    with pool.connection() as conn:
        original_autocommit = conn.autocommit
        if autocommit != original_autocommit:
            conn.autocommit = autocommit
        
        try:
            yield conn
        finally:
            if conn.autocommit != original_autocommit:
                conn.autocommit = original_autocommit


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
                CREATE TABLE IF NOT EXISTS journal_entries_v2 (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL,
                    thread_id TEXT NOT NULL,
                    user_input TEXT NOT NULL,
                    assistant_reply TEXT NOT NULL,
                    core_theme TEXT NOT NULL,
                    mood TEXT NOT NULL,
                    core_beliefs JSONB NOT NULL DEFAULT '[]'::jsonb,
                    triggers JSONB NOT NULL DEFAULT '[]'::jsonb,
                    key_facts JSONB NOT NULL DEFAULT '[]'::jsonb,
                    next_focus TEXT NOT NULL,
                    intensity INT NOT NULL DEFAULT 5,
                    raw_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
                    created_at TIMESTAMPTZ NOT NULL
                )
                """
            )
            cur.execute(
                """
                ALTER TABLE journal_entries_v2
                ADD COLUMN IF NOT EXISTS intensity INT NOT NULL DEFAULT 5
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS journal_books (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL,
                    name TEXT NOT NULL,
                    color TEXT NOT NULL DEFAULT '',
                    created_at TIMESTAMPTZ NOT NULL,
                    UNIQUE (user_id, name)
                )
                """
            )
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_journal_books_user ON journal_books(user_id)"
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS journal_logs (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL,
                    book_id BIGINT,
                    entry_date DATE NOT NULL,
                    mood_emoji TEXT NOT NULL DEFAULT '',
                    mood_label TEXT NOT NULL DEFAULT '',
                    body TEXT NOT NULL DEFAULT '',
                    translated TEXT NOT NULL DEFAULT '',
                    created_at TIMESTAMPTZ NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL
                )
                """
            )
            cur.execute(
                """
                ALTER TABLE journal_logs
                ADD COLUMN IF NOT EXISTS book_id BIGINT,
                ADD COLUMN IF NOT EXISTS core_theme TEXT NOT NULL DEFAULT '',
                ADD COLUMN IF NOT EXISTS core_beliefs JSONB NOT NULL DEFAULT '[]'::jsonb,
                ADD COLUMN IF NOT EXISTS triggers JSONB NOT NULL DEFAULT '[]'::jsonb
                """
            )
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_journal_logs_user_date ON journal_logs(user_id, entry_date DESC)"
            )
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_journal_logs_book ON journal_logs(user_id, book_id)"
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS loops (
                    loop_id UUID PRIMARY KEY,
                    thread_id TEXT NOT NULL,
                    user_id BIGINT NOT NULL,
                    loop_name TEXT NOT NULL,
                    core_belief TEXT NOT NULL,
                    trigger TEXT NOT NULL,
                    valence TEXT NOT NULL,
                    first_detected_at TIMESTAMPTZ NOT NULL,
                    last_detected_at TIMESTAMPTZ NOT NULL,
                    detection_count INT NOT NULL DEFAULT 1,
                    detection_dates JSONB NOT NULL DEFAULT '[]'::jsonb,
                    matched_entries JSONB NOT NULL DEFAULT '[]'::jsonb,
                    description TEXT NOT NULL,
                    suggestion TEXT NOT NULL,
                    confidence_score FLOAT NOT NULL DEFAULT 0.0,
                    validation_metadata JSONB NOT NULL DEFAULT '{}'::jsonb
                )
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS threads (
                    thread_id TEXT PRIMARY KEY,
                    user_id BIGINT NOT NULL,
                    title TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL,
                    loop_id UUID,
                    last_reflected_at TIMESTAMPTZ
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
                CREATE INDEX IF NOT EXISTS idx_journal_entries_v2_user_thread_created
                ON journal_entries_v2(user_id, thread_id, created_at)
                """
            )
            cur.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_entries_v2_import_dedupe
                ON journal_entries_v2(user_id, thread_id, created_at, core_theme)
                """
            )
            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_loops_user_thread
                ON loops(user_id, thread_id)
                """
            )
            # Add loop_id and last_reflected_at columns if they don't exist (for existing installations)
            cur.execute(
                """
                ALTER TABLE threads
                ADD COLUMN IF NOT EXISTS loop_id UUID
                """
            )
            cur.execute(
                """
                ALTER TABLE threads
                ADD COLUMN IF NOT EXISTS last_reflected_at TIMESTAMPTZ
                """
            )
            # Create index on loop_id after ensuring column exists
            try:
                cur.execute(
                    """
                    CREATE INDEX IF NOT EXISTS idx_threads_loop_id
                    ON threads(loop_id)
                    """
                )
            except Exception:
                pass  # Ignore if column doesn't exist yet
