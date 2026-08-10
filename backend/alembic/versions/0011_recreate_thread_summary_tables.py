"""recreate thread_summaries and memory_digest if missing

Revision ID: 0011_recreate_thread_summary_tables
Revises: a3f7c9e21b58
Create Date: 2026-08-10 00:00:00

Some environments had thread_summaries/memory_digest dropped out-of-band
after 0009/0010 originally ran, while alembic_version stayed at head. This
revision re-asserts both objects (and the status column/indexes 0010 adds)
so `alembic upgrade head` can repair drift instead of silently no-op'ing.
"""

from __future__ import annotations

from alembic import op


revision = "0011_recreate_thread_summary_tables"
down_revision = "a3f7c9e21b58"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS thread_summaries (
            thread_id UUID PRIMARY KEY,
            user_id BIGINT NOT NULL,
            summary_text TEXT NOT NULL DEFAULT '',
            token_estimate INT NOT NULL DEFAULT 0,
            turns_summarized INT NOT NULL DEFAULT 0,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS thread_summaries_user_id_idx ON thread_summaries (user_id)"
    )
    op.execute(
        "ALTER TABLE thread_summaries ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS thread_summaries_user_status_idx ON thread_summaries (user_id, status, updated_at DESC)"
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS memory_digest (
            user_id BIGINT PRIMARY KEY,
            digest_text TEXT NOT NULL DEFAULT '',
            token_estimate INT NOT NULL DEFAULT 0,
            thread_count INT NOT NULL DEFAULT 0,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )


def downgrade() -> None:
    pass
