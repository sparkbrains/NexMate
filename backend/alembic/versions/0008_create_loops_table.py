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
    op.create_table(
        "loops",
        sa.Column("loop_id", sa.UUID(), primary_key=True),
        sa.Column("thread_id", sa.Text(), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("loop_name", sa.Text(), nullable=False),
        sa.Column("core_belief", sa.Text(), nullable=False),
        sa.Column("trigger", sa.Text(), nullable=False),
        sa.Column("valence", sa.Text(), nullable=False),
        sa.Column("first_detected_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_detected_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("detection_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "detection_dates",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "matched_entries",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("suggestion", sa.Text(), nullable=False),
        sa.Column("confidence_score", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column(
            "validation_metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )

    op.create_index("idx_loops_user_id", "loops", ["user_id"], unique=False)
    op.create_index(
        "idx_loops_user_last_detected",
        "loops",
        ["user_id", "last_detected_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_loops_user_last_detected", table_name="loops")
    op.drop_index("idx_loops_user_id", table_name="loops")
    op.drop_table("loops")
