"""add loop_id to threads table

Revision ID: 0007_add_loop_id_to_threads
Revises: 0006_add_threads_table
Create Date: 2026-05-18 00:00:00

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers
revision = "0007_add_loop_id_to_threads"
down_revision = "0006_add_threads_table"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE threads ADD COLUMN IF NOT EXISTS loop_id UUID"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE threads DROP COLUMN IF EXISTS loop_id")