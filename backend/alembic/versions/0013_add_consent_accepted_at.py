"""add consent_accepted_at to users

Revision ID: 0013_add_consent_accepted_at
Revises: 0012_encrypt_sensitive_columns
Create Date: 2026-08-17 00:00:00

Tracks when a user accepted the data-use consent popup shown at signup
(and, for pre-existing accounts, on their next login). NULL means the
account hasn't accepted yet.
"""

from __future__ import annotations

from alembic import op


# revision identifiers, used by Alembic.
revision = "0013_add_consent_accepted_at"
down_revision = "0012_encrypt_sensitive_columns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS consent_accepted_at TIMESTAMPTZ")


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS consent_accepted_at")