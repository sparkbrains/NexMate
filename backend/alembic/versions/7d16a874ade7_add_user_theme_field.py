"""add user theme field

Revision ID: 7d16a874ade7
Revises: c4361a6d7046
Create Date: 2026-08-06 00:00:00.000000
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '7d16a874ade7'
down_revision = 'c4361a6d7046'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("theme", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "theme")
