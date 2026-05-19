"""add_journal_log_features

Revision ID: 75b3d0ccf67c
Revises: 0006_add_threads_table
Create Date: 2026-05-18 10:36:41.748399
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '75b3d0ccf67c'
down_revision = '0006_add_threads_table'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('journal_logs', sa.Column('core_theme', sa.Text(), server_default='', nullable=False))
    op.add_column('journal_logs', sa.Column('core_beliefs', sa.JSON(), server_default='[]', nullable=False))
    op.add_column('journal_logs', sa.Column('triggers', sa.JSON(), server_default='[]', nullable=False))


def downgrade() -> None:
    op.drop_column('journal_logs', 'triggers')
    op.drop_column('journal_logs', 'core_beliefs')
    op.drop_column('journal_logs', 'core_theme')
