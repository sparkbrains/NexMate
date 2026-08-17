"""create insights_summaries table

Revision ID: 0011_create_insights_summaries_table
Revises: 885c81616b41
Create Date: 2026-08-14 00:00:00

"""

from __future__ import annotations

from alembic import op


# revision identifiers, used by Alembic.
revision = "0011_create_insights_summaries_table"
down_revision = "885c81616b41"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # One row per (user_id, period_type) -- holds the latest AI-generated
    # narrative summary of the Insights page for that view ('week' or
    # 'month'), upserted in place. generated_date gates the once-per-
    # calendar-day-per-view generation limit.
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS insights_summaries (
            user_id BIGINT NOT NULL,
            period_type TEXT NOT NULL,
            period_key TEXT NOT NULL,
            summary_text TEXT NOT NULL,
            generated_date DATE NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (user_id, period_type)
        )
        """
    )


def downgrade() -> None:
    op.drop_table("insights_summaries")