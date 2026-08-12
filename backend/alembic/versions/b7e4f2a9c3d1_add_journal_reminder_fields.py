"""add journal reminder fields

Revision ID: b7e4f2a9c3d1
Revises: dda3ccc43d44
Create Date: 2026-08-03 00:00:00.000000
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b7e4f2a9c3d1'
down_revision = 'dda3ccc43d44'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("reminder_enabled", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("users", sa.Column("reminder_time", sa.Text(), nullable=False, server_default="20:00"))


def downgrade() -> None:
    op.drop_column("users", "reminder_time")
    op.drop_column("users", "reminder_enabled")
