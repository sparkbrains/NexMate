"""merge_heads

Revision ID: 885c81616b41
Revises: a3f7c9e21b58, f2a3b4c5d6e7
Create Date: 2026-08-11 18:52:14.589876
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '885c81616b41'
down_revision = ('a3f7c9e21b58', 'f2a3b4c5d6e7')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
