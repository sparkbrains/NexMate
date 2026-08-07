"""add user_badges table

Revision ID: a3f7c9e21b58
Revises: 7d16a874ade7
Create Date: 2026-08-07 00:00:00.000000
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a3f7c9e21b58'
down_revision = '7d16a874ade7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_badges",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("badge_key", sa.Text(), nullable=False),
        sa.Column("unlocked_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "badge_key", name="uq_user_badges_user_badge"),
    )
    op.create_index("idx_user_badges_user", "user_badges", ["user_id"])


def downgrade() -> None:
    op.drop_index("idx_user_badges_user", table_name="user_badges")
    op.drop_table("user_badges")
