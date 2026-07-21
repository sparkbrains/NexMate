"""add_journal_log_features

Revision ID: 75b3d0ccf67c
Revises: 0006_add_threads_table
Create Date: 2026-05-18 10:36:41.748399
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '75b3d0ccf67c'
down_revision = '0006_add_threads_table'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS journal_logs (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL,
            book_id BIGINT,
            entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
            mood_emoji TEXT NOT NULL DEFAULT '',
            mood_label TEXT NOT NULL DEFAULT '',
            body TEXT NOT NULL DEFAULT '',
            translated TEXT NOT NULL DEFAULT '',
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        "ALTER TABLE journal_logs ADD COLUMN IF NOT EXISTS core_theme TEXT NOT NULL DEFAULT ''"
    )
    op.execute(
        "ALTER TABLE journal_logs ADD COLUMN IF NOT EXISTS core_beliefs JSON NOT NULL DEFAULT '[]'"
    )
    op.execute(
        "ALTER TABLE journal_logs ADD COLUMN IF NOT EXISTS triggers JSON NOT NULL DEFAULT '[]'"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE journal_logs DROP COLUMN IF EXISTS triggers")
    op.execute("ALTER TABLE journal_logs DROP COLUMN IF EXISTS core_beliefs")
    op.execute("ALTER TABLE journal_logs DROP COLUMN IF EXISTS core_theme")
