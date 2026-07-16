"""create thread_summaries table

Revision ID: 0009_create_thread_summaries_table
Revises: 0008_create_loops_table
Create Date: 2026-07-15 00:00:00

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "0009_create_thread_summaries_table"
down_revision = "0008_create_loops_table"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create the thread_summaries table if it doesn't already exist.
    # One row per thread — holds the running compacted summary of older turns
    # once a thread's chat_history grows past the token threshold.
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


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS thread_summaries_user_id_idx")
    op.drop_table("thread_summaries")