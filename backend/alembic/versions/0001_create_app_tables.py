"""create app tables

Revision ID: 0001_create_app_tables
Revises:
Create Date: 2026-04-22 00:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "0001_create_app_tables"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )

    op.create_table(
        "sessions",
        sa.Column("token", sa.Text(), primary_key=True),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )

    op.create_table(
        "thread_messages",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("thread_id", sa.Text(), nullable=False),
        sa.Column("role", sa.Text(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "journal_entries",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("thread_id", sa.Text(), nullable=False),
        sa.Column("user_input", sa.Text(), nullable=False),
        sa.Column("assistant_reply", sa.Text(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("mood", sa.Text(), nullable=False),
        sa.Column(
            "signals",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("next_focus", sa.Text(), nullable=False),
        sa.Column(
            "raw_summary",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_index("idx_sessions_user_id", "sessions", ["user_id"], unique=False)
    op.create_index("idx_sessions_expires_at", "sessions", ["expires_at"], unique=False)
    op.create_index(
        "idx_thread_messages_user_thread_created",
        "thread_messages",
        ["user_id", "thread_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "idx_thread_messages_import_dedupe",
        "thread_messages",
        ["user_id", "thread_id", "role", "created_at", "content"],
        unique=True,
    )
    op.execute(
        """
        CREATE INDEX idx_thread_messages_user_updated
        ON thread_messages(user_id, created_at DESC)
        """
    )
    op.create_index(
        "idx_journal_entries_user_thread_created",
        "journal_entries",
        ["user_id", "thread_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "idx_journal_entries_import_dedupe",
        "journal_entries",
        ["user_id", "thread_id", "created_at", "summary"],
        unique=True,
    )
    op.execute(
        """
        CREATE INDEX idx_journal_entries_user_created
        ON journal_entries(user_id, created_at DESC)
        """
    )
    op.create_index("idx_journal_entries_user_mood", "journal_entries", ["user_id", "mood"], unique=False)
    op.create_index(
        "idx_journal_entries_signals_gin",
        "journal_entries",
        ["signals"],
        unique=False,
        postgresql_using="gin",
    )


def downgrade() -> None:
    op.drop_index("idx_journal_entries_signals_gin", table_name="journal_entries")
    op.drop_index("idx_journal_entries_user_mood", table_name="journal_entries")
    op.drop_index("idx_journal_entries_user_created", table_name="journal_entries")
    op.drop_index("idx_journal_entries_import_dedupe", table_name="journal_entries")
    op.drop_index("idx_journal_entries_user_thread_created", table_name="journal_entries")
    op.drop_index("idx_thread_messages_user_updated", table_name="thread_messages")
    op.drop_index("idx_thread_messages_import_dedupe", table_name="thread_messages")
    op.drop_index("idx_thread_messages_user_thread_created", table_name="thread_messages")
    op.drop_index("idx_sessions_expires_at", table_name="sessions")
    op.drop_index("idx_sessions_user_id", table_name="sessions")
    op.drop_table("journal_entries")
    op.drop_table("thread_messages")
    op.drop_table("sessions")
    op.drop_table("users")
