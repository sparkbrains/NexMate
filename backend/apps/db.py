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
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '',
                ADD COLUMN IF NOT EXISTS age INT,
                ADD COLUMN IF NOT EXISTS dob DATE,
                ADD COLUMN IF NOT EXISTS subscription_tier TEXT NOT NULL DEFAULT 'paid',
                ADD COLUMN IF NOT EXISTS reminder_enabled BOOLEAN NOT NULL DEFAULT FALSE,
                ADD COLUMN IF NOT EXISTS reminder_time TEXT NOT NULL DEFAULT '20:00'
                """
            )
            # dob is now encrypted app-side (apps/crypto.py), so it has to be
            # a plain string column rather than a typed DATE -- Fernet output
            # isn't a valid date literal. Existing DATE values cast to their
            # ISO text form and stay readable as legacy plaintext until the
            # next write re-encrypts them.
            cur.execute(
                """
                ALTER TABLE users
                ALTER COLUMN dob TYPE TEXT USING dob::TEXT
                """
            )
            # onboarding_completed_at gates whether the first-run onboarding
            # flow shows for a user. Check for the column before adding it so
            # the backfill below only ever runs the one time it's introduced
            # in a given environment — not on every boot — otherwise it would
            # wipe out onboarding_completed_at=NULL for users who are mid-flow
            # whenever the server restarts.
            cur.execute(
                """
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'users' AND column_name = 'onboarding_completed_at'
                """
            )
            onboarding_column_existed = cur.fetchone() is not None
            cur.execute(
                """
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS has_journaled_before BOOLEAN,
                ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ
                """
            )
            if not onboarding_column_existed:
                cur.execute(
                    "UPDATE users SET onboarding_completed_at = created_at WHERE onboarding_completed_at IS NULL"
                )
            # consent_accepted_at gates the data-use consent popup shown at
            # signup (and, retroactively, to any pre-existing account that
            # never saw it). NULL means "hasn't accepted yet".
            cur.execute(
                """
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS consent_accepted_at TIMESTAMPTZ
                """
            )
            # deleted_at marks a soft-deleted account. NULL means active;
            # a timestamp starts a 30-day restore window, after which the
            # background purge job (see web_app.py) hard-deletes the row
            # and everything in _USER_OWNED_TABLES.
            cur.execute(
                """
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ
                """
            )
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NOT NULL"
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
            # content is encrypted app-side, so the old dedupe unique index
            # (which compared raw content) can no longer match re-imports of
            # the same message -- Fernet output differs on every call even
            # for identical plaintext. content_hash is a stable sha256 of the
            # plaintext, computed before encryption, and is what the dedupe
            # index now keys on instead.
            cur.execute(
                "ALTER TABLE thread_messages ADD COLUMN IF NOT EXISTS content_hash TEXT"
            )
            cur.execute(
                """
                UPDATE thread_messages SET content_hash = encode(sha256(content::bytea), 'hex')
                WHERE content_hash IS NULL
                """
            )
            cur.execute(
                "ALTER TABLE thread_messages ALTER COLUMN content_hash SET NOT NULL"
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
            # source_thread_id ties a journal entry back to the chat thread it was
            # generated from (via /api/journal/from-thread-summary). It stays NULL
            # for manually-created entries. The partial unique index below is what
            # lets upsert_journal_entry_for_thread() do a true ON CONFLICT upsert,
            # so re-saving a summary for the same thread updates that one row
            # instead of creating a duplicate entry.
            cur.execute(
                """
                ALTER TABLE journal_logs
                ADD COLUMN IF NOT EXISTS source_thread_id TEXT
                """
            )
            cur.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_logs_thread_dedupe
                ON journal_logs(user_id, source_thread_id)
                WHERE source_thread_id IS NOT NULL
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
                    last_reflected_at TIMESTAMPTZ,
                    daily_question_id BIGINT
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
            cur.execute("DROP INDEX IF EXISTS idx_thread_messages_import_dedupe")
            cur.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS idx_thread_messages_import_dedupe_hash
                ON thread_messages(user_id, thread_id, role, created_at, content_hash)
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
            # Add daily_question_id column if it doesn't exist (for existing
            # installations) — tags a thread as having been created to
            # answer a specific daily question, independent of its title.
            cur.execute(
                """
                ALTER TABLE threads
                ADD COLUMN IF NOT EXISTS daily_question_id BIGINT
                """
            )
            cur.execute(
    """
    CREATE TABLE IF NOT EXISTS pending_signups (
        email TEXT PRIMARY KEY,
        password_hash TEXT NOT NULL,
        otp_hash TEXT NOT NULL,
        attempts INT NOT NULL DEFAULT 0,
        expires_at TIMESTAMPTZ NOT NULL,
        last_sent_at TIMESTAMPTZ NOT NULL,
        name TEXT NOT NULL DEFAULT '',
        age INT
    )
    """
)
            cur.execute(
                """
                ALTER TABLE pending_signups
                ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '',
                ADD COLUMN IF NOT EXISTS age INT
                """
            )
            cur.execute(
    """
    CREATE TABLE IF NOT EXISTS password_resets (
        email TEXT PRIMARY KEY REFERENCES users(email) ON DELETE CASCADE,
        otp_hash TEXT NOT NULL,
        attempts INT NOT NULL DEFAULT 0,
        verified BOOLEAN NOT NULL DEFAULT FALSE,
        expires_at TIMESTAMPTZ NOT NULL,
        last_sent_at TIMESTAMPTZ NOT NULL
    )
    """
)
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS prompt_pack_answers (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL,
                    prompt_id TEXT NOT NULL,
                    prompt_text TEXT NOT NULL,
                    category TEXT NOT NULL DEFAULT '',
                    answer_text TEXT NOT NULL,
                    answered_date DATE NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL,
                    UNIQUE (user_id, answered_date)
                )
                """
            )
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_prompt_pack_answers_user ON prompt_pack_answers(user_id, answered_date DESC)"
            )

            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS user_profile_summary (
                    user_id BIGINT PRIMARY KEY,
                    summary_text TEXT NOT NULL,
                    source_answer_count INT NOT NULL DEFAULT 0,
                    generated_date DATE NOT NULL,
                    covers_through_date DATE,
                    created_at TIMESTAMPTZ NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL
                )
                """
            )
            cur.execute(
                """
                ALTER TABLE user_profile_summary
                ADD COLUMN IF NOT EXISTS covers_through_date DATE
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

            # Create index on daily_question_id after ensuring column exists
            try:
                cur.execute(
                    """
                    CREATE INDEX IF NOT EXISTS idx_threads_daily_question_id
                    ON threads(daily_question_id)
                    """
                )
            except Exception:
                pass  # Ignore if column doesn't exist yet

            cur.execute("CREATE INDEX IF NOT EXISTS idx_threads_user_updated ON threads(user_id, updated_at DESC)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_loops_user_last_detected ON loops(user_id, last_detected_at DESC)")

            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS support_chat_logs (
                    id BIGSERIAL PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    user_id BIGINT,
                    query TEXT NOT NULL,
                    answer TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL
                )
                """
            )
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_support_chat_logs_session ON support_chat_logs(session_id, created_at)"
            )
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_support_chat_logs_created ON support_chat_logs(created_at DESC)"
            )
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_support_chat_logs_user ON support_chat_logs(user_id) WHERE user_id IS NOT NULL"
            )

            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS ws_tickets (
                    ticket TEXT PRIMARY KEY,
                    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    session_token TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL,
                    expires_at TIMESTAMPTZ NOT NULL
                )
                """
            )
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_ws_tickets_expires_at ON ws_tickets(expires_at)"
            )

            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS user_badges (
                    id BIGSERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL,
                    badge_key TEXT NOT NULL,
                    unlocked_at TIMESTAMPTZ NOT NULL,
                    UNIQUE (user_id, badge_key)
                )
                """
            )
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id)"
            )