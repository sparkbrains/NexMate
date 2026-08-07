"""add user motivation field

Revision ID: c4361a6d7046
Revises: e1a2b3c4d5f6
Create Date: 2026-08-06 00:00:00.000000
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c4361a6d7046'
down_revision = 'e1a2b3c4d5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("motivation", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "motivation")
