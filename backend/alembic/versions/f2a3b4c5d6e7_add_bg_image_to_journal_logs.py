"""add bg_image to journal_logs

Revision ID: f2a3b4c5d6e7
Revises: e1a2b3c4d5f6
Create Date: 2026-08-06 00:00:00.000000
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = 'f2a3b4c5d6e7'
down_revision = 'e1a2b3c4d5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('journal_logs', sa.Column('bg_image', sa.Text(), nullable=False, server_default=''))


def downgrade() -> None:
    op.drop_column('journal_logs', 'bg_image')
