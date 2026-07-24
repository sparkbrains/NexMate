"""add user profile fields

Revision ID: dda3ccc43d44
Revises: 0010_add_cross_thread_memory
Create Date: 2026-07-24 12:13:40.383425
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'dda3ccc43d44'
down_revision = '0010_add_cross_thread_memory'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("name", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("age", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("subscription_tier", sa.Text(), nullable=True, server_default="Bronze"))
    
    op.add_column("pending_signups", sa.Column("name", sa.Text(), nullable=True))
    op.add_column("pending_signups", sa.Column("age", sa.Integer(), nullable=True))
    op.add_column("pending_signups", sa.Column("subscription_tier", sa.Text(), nullable=True, server_default="Bronze"))


def downgrade() -> None:
    op.drop_column("pending_signups", "subscription_tier")
    op.drop_column("pending_signups", "age")
    op.drop_column("pending_signups", "name")
    
    op.drop_column("users", "subscription_tier")
    op.drop_column("users", "age")
    op.drop_column("users", "name")
