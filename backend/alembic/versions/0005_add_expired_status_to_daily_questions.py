"""add expired status to daily_questions

Revision ID: 0005_add_expired_status_to_daily_questions
Revises: 0004_update_daily_questions_multiple
Create Date: 2026-05-12 00:00:00

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers
revision = "0005_add_expired_status_to_daily_questions"
down_revision = "0004_update_daily_questions_multiple"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add expired_at column to track when questions expire
    op.add_column(
        "daily_questions",
        sa.Column(
            "expired_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )

    # Create index for expired questions
    op.create_index(
        "idx_daily_questions_expired",
        "daily_questions",
        ["expired_at"],
        unique=False,
    )


def downgrade() -> None:
    # Drop the new index and column
    op.drop_index("idx_daily_questions_expired", table_name="daily_questions")
    op.drop_column("daily_questions", "expired_at")
