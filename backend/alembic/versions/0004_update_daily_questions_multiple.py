"""
update daily_questions to support multiple questions per day

Revision ID: 0004_update_daily_questions_multiple
Revises: 0003_add_daily_questions
Create Date: 2026-05-12 00:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers
revision = "0004_update_daily_questions_multiple"
down_revision = "0003_add_daily_questions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Drop the unique constraint/index that enforces one question per day.
    #    Use raw SQL with IF EXISTS to handle either form (index or constraint).
    op.execute("DROP INDEX IF EXISTS uq_daily_questions_user_date")
    op.execute("DROP INDEX IF EXISTS idx_daily_questions_user_date")
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'uq_daily_questions_user_date'
            ) THEN
                ALTER TABLE daily_questions DROP CONSTRAINT uq_daily_questions_user_date;
            END IF;
        END $$;
        """
    )

    # 2. Add question_order for multiple questions per day
    op.add_column(
        "daily_questions",
        sa.Column(
            "question_order",
            sa.Integer(),
            nullable=False,
            server_default="1",
        ),
    )

    # 3. Add index for ordering: user_id + date + order
    op.create_index(
        "idx_daily_questions_user_date_order",
        "daily_questions",
        ["user_id", "question_date", "question_order"],
        unique=False,
    )


def downgrade() -> None:
    # 3. Drop the new index
    op.drop_index("idx_daily_questions_user_date_order", table_name="daily_questions")

    # 2. Drop the column we added
    op.drop_column("daily_questions", "question_order")

    # 1. Restore the old unique index (one question per day)
    op.create_index(
        "idx_daily_questions_user_date",
        "daily_questions",
        ["user_id", "question_date"],
        unique=True,
    )