"""recreate daily_questions if missing

Revision ID: 9c2b6e5f1a0d
Revises: 7d59e8349b73
Create Date: 2026-08-12 00:00:00

Some environments had daily_questions dropped out-of-band after 0003/0004/0005
originally ran, while alembic_version stayed at head. This revision re-asserts
the table (with the question_order and expired_at columns/indexes those
revisions add) so `alembic upgrade head` can repair drift instead of silently
no-op'ing, mirroring 0011_recreate_thread_summary_tables.
"""
from __future__ import annotations

from alembic import op


revision = "9c2b6e5f1a0d"
down_revision = "7d59e8349b73"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS daily_questions (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL,
            question_date DATE NOT NULL,
            question_text TEXT NOT NULL,
            source_thread_id TEXT NOT NULL,
            source_core_themes JSON NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            question_order INTEGER NOT NULL DEFAULT 1,
            answered_at TIMESTAMPTZ,
            expired_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_daily_questions_user_status "
        "ON daily_questions (user_id, status)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_daily_questions_user_date_order "
        "ON daily_questions (user_id, question_date, question_order)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_daily_questions_expired "
        "ON daily_questions (expired_at)"
    )


def downgrade() -> None:
    pass
