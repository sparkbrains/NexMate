"""add daily_questions table

Revision ID: 0003_add_daily_questions
Revises: 0002_migrate_journals_v2
Create Date: 2026-05-12 00:00:00

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0003_add_daily_questions"
down_revision = "0002_migrate_journals_v2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "daily_questions",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("question_date", sa.Date(), nullable=False),
        sa.Column("question_text", sa.Text(), nullable=False),
        sa.Column("source_thread_id", sa.Text(), nullable=False),
        sa.Column("source_core_themes", sa.JSON(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default="pending"),
        sa.Column("answered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    # Create indexes
    op.create_index(
        "idx_daily_questions_user_date",
        "daily_questions",
        ["user_id", "question_date"],
        unique=True,
    )
    op.create_index(
        "idx_daily_questions_user_status",
        "daily_questions",
        ["user_id", "status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_daily_questions_user_status", table_name="daily_questions")
    op.drop_index("idx_daily_questions_user_date", table_name="daily_questions")
    op.drop_table("daily_questions")
