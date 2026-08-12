"""merge heads

Revision ID: 7d59e8349b73
Revises: 0011_recreate_thread_summary_tables, 885c81616b41
Create Date: 2026-08-12 15:15:38.438381
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '7d59e8349b73'
down_revision = ('0011_recreate_thread_summary_tables', '885c81616b41')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
