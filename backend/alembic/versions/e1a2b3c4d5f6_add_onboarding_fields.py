"""add onboarding fields

Revision ID: e1a2b3c4d5f6
Revises: c8f1a6e2b4d7
Create Date: 2026-08-06 00:00:00.000000
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e1a2b3c4d5f6'
down_revision = 'c8f1a6e2b4d7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("has_journaled_before", sa.Boolean(), nullable=True))
    op.add_column("users", sa.Column("onboarding_completed_at", sa.DateTime(timezone=True), nullable=True))
    # Accounts created before this feature shipped never saw the onboarding
    # flow — treat them as already onboarded instead of surfacing it now.
    op.execute("UPDATE users SET onboarding_completed_at = created_at WHERE onboarding_completed_at IS NULL")


def downgrade() -> None:
    op.drop_column("users", "onboarding_completed_at")
    op.drop_column("users", "has_journaled_before")
