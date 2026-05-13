"""add threads table for thread metadata

Revision ID: 0006_add_threads_table
Revises: 0005_add_expired_status_to_daily_questions
Create Date: 2026-05-13 00:00:00

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers
revision = "0006_add_threads_table"
down_revision = "0005_add_expired_status_to_daily_questions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "threads",
        sa.Column("thread_id", sa.Text(), primary_key=True),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    # Create indexes for efficient queries
    op.create_index(
        "idx_threads_user_id",
        "threads",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "idx_threads_user_updated",
        "threads",
        ["user_id", "updated_at"],
        unique=False,
    )

    # Add foreign key constraint
    op.execute(
        """
        ALTER TABLE threads
        ADD CONSTRAINT fk_threads_user_id
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        """
    )


def downgrade() -> None:
    op.drop_index("idx_threads_user_updated", table_name="threads")
    op.drop_index("idx_threads_user_id", table_name="threads")
    op.execute("ALTER TABLE threads DROP CONSTRAINT IF EXISTS fk_threads_user_id")
    op.drop_table("threads")
