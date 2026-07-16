"""create loops table

Revision ID: 0008_create_loops_table
Revises: 0007_add_loop_id_to_threads
Create Date: 2026-07-13 00:00:00

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "0008_create_loops_table"
down_revision = "0007_add_loop_id_to_threads"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create the loops table if it doesn't already exist.
    # Using raw SQL so this is idempotent for databases that already had the
    # table bootstrapped via db.py's CREATE TABLE IF NOT EXISTS path.
    op.execute(
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

    # For databases where the loops table already existed without confidence_score,
    # add the column if it's missing. ADD COLUMN IF NOT EXISTS is idempotent.
    op.execute(
        """
        ALTER TABLE loops
            ADD COLUMN IF NOT EXISTS confidence_score FLOAT NOT NULL DEFAULT 0.0
        """
    )

    # Indexes — use IF NOT EXISTS so re-running is safe too.
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_loops_user_id ON loops (user_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_loops_user_last_detected ON loops (user_id, last_detected_at)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_loops_user_last_detected")
    op.execute("DROP INDEX IF EXISTS idx_loops_user_id")
    op.drop_table("loops")
