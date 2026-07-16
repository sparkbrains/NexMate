"""merge journal_logs and thread_summaries branches

Revision ID: abf0d72a79b8
Revises: 0009_create_thread_summaries_table, 75b3d0ccf67c
Create Date: 2026-07-15 12:31:05.991350
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'abf0d72a79b8'
down_revision = ('0009_create_thread_summaries_table', '75b3d0ccf67c')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
