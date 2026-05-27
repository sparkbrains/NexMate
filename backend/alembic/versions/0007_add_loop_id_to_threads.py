"""add loop_id to threads table

Revision ID: 0007_add_loop_id_to_threads
Revises: 0006_add_threads_table
Create Date: 2026-05-18 00:00:00

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers
revision = "0007_add_loop_id_to_threads"
down_revision = "0006_add_threads_table"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "threads",
        sa.Column("loop_id", sa.UUID(), nullable=True),
    )
    
    op.add_column(
        "threads",
        sa.Column("last_reflected_at", sa.DateTime(timezone=True), nullable=True),
    )
    
    # Create index for efficient loop-based queries
    op.create_index(
        "idx_threads_loop_id",
        "threads",
        ["loop_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_threads_loop_id", table_name="threads")
    op.drop_column("threads", "last_reflected_at")
    op.drop_column("threads", "loop_id")
