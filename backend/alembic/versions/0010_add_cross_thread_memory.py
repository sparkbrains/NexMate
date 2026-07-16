"""add cross-thread memory digest

Revision ID: 0010_add_cross_thread_memory
Revises: abf0d72a79b8
Create Date: 2026-07-15 00:00:00

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0010_add_cross_thread_memory"
down_revision = "abf0d72a79b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Track whether a thread's summary is still "active" (counted toward the
    # cross-thread context budget) or has been "merged" into the rolling digest.
    op.execute(
        "ALTER TABLE thread_summaries ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS thread_summaries_user_status_idx ON thread_summaries (user_id, status, updated_at DESC)"
    )

    # One row per user — a continuously re-compressed digest of everything
    # folded out of thread_summaries once the cross-thread context budget fills.
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
    op.execute("DROP TABLE IF EXISTS memory_digest")
    op.execute("DROP INDEX IF EXISTS thread_summaries_user_status_idx")
    op.execute("ALTER TABLE thread_summaries DROP COLUMN IF EXISTS status")