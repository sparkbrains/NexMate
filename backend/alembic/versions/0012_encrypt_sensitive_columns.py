"""schema changes to support app-layer encryption of sensitive columns

Revision ID: 0012_encrypt_sensitive_columns
Revises: 0011_create_insights_summaries_table
Create Date: 2026-08-14 00:00:00

users.dob and thread_messages.content are now encrypted app-side (see
apps/crypto.py) before being written. dob can no longer be a typed DATE
column since encrypted output isn't a valid date literal. thread_messages'
dedupe unique index compared raw content, which no longer works once
content is encrypted (ciphertext differs every call for identical
plaintext) -- it's replaced with an index on a sha256 hash of the
plaintext, computed app-side before encryption.
"""

from __future__ import annotations

from alembic import op


# revision identifiers, used by Alembic.
revision = "0012_encrypt_sensitive_columns"
down_revision = "0011_create_insights_summaries_table"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ALTER COLUMN dob TYPE TEXT USING dob::TEXT")

    op.execute("ALTER TABLE thread_messages ADD COLUMN IF NOT EXISTS content_hash TEXT")
    op.execute(
        """
        UPDATE thread_messages SET content_hash = encode(sha256(content::bytea), 'hex')
        WHERE content_hash IS NULL
        """
    )
    op.execute("ALTER TABLE thread_messages ALTER COLUMN content_hash SET NOT NULL")

    op.execute("DROP INDEX IF EXISTS idx_thread_messages_import_dedupe")
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_thread_messages_import_dedupe_hash
        ON thread_messages(user_id, thread_id, role, created_at, content_hash)
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_thread_messages_import_dedupe_hash")
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_thread_messages_import_dedupe
        ON thread_messages(user_id, thread_id, role, created_at, content)
        """
    )
    op.execute("ALTER TABLE thread_messages DROP COLUMN IF EXISTS content_hash")
    op.execute("ALTER TABLE users ALTER COLUMN dob TYPE DATE USING NULLIF(dob, '')::DATE")