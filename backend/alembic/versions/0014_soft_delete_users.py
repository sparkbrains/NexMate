"""add deleted_at to users for soft delete with restore window

Revision ID: 0014_soft_delete_users
Revises: 0013_add_consent_accepted_at
Create Date: 2026-08-17 00:00:00

Marks an account as soft-deleted (deleted_at set) instead of removing it
immediately. NULL means active. A background job purges rows whose
deleted_at is older than the retention window (see
purge_expired_soft_deleted_users in auth_service.py).
"""

from __future__ import annotations

from alembic import op


# revision identifiers, used by Alembic.
revision = "0014_soft_delete_users"
down_revision = "0013_add_consent_accepted_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NOT NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_users_deleted_at")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS deleted_at")