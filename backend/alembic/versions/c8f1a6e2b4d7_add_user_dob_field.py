"""add user dob field

Revision ID: c8f1a6e2b4d7
Revises: b7e4f2a9c3d1
Create Date: 2026-08-04 00:00:00.000000
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c8f1a6e2b4d7'
down_revision = 'b7e4f2a9c3d1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("dob", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "dob")