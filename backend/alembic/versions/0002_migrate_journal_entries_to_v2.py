"""migrate journal_entries to journal_entries_v2

Revision ID: 0002_migrate_journal_entries_to_v2
Revises: 0001_create_app_tables
Create Date: 2026-05-08 00:00:00

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "0002_migrate_journal_entries_to_v2"
down_revision = "0001_create_app_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create journal_entries_v2 table
    op.create_table(
        "journal_entries_v2",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("thread_id", sa.Text(), nullable=False),
        sa.Column("user_input", sa.Text(), nullable=False),
        sa.Column("assistant_reply", sa.Text(), nullable=False),
        sa.Column("core_theme", sa.Text(), nullable=False),
        sa.Column("mood", sa.Text(), nullable=False),
        sa.Column(
            "core_beliefs",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "triggers",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "key_facts",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("next_focus", sa.Text(), nullable=False),
        sa.Column("intensity", sa.Integer(), nullable=False, server_default=sa.text("5")),
        sa.Column(
            "raw_summary",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    # Create indexes for journal_entries_v2
    op.create_index(
        "idx_journal_entries_v2_user_thread_created",
        "journal_entries_v2",
        ["user_id", "thread_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "idx_journal_entries_v2_import_dedupe",
        "journal_entries_v2",
        ["user_id", "thread_id", "created_at", "core_theme"],
        unique=True,
    )

    # Migrate data from journal_entries to journal_entries_v2
    op.execute(
        """
        INSERT INTO journal_entries_v2 (
            id, user_id, thread_id, user_input, assistant_reply, 
            core_theme, mood, core_beliefs, triggers, key_facts, 
            next_focus, intensity, raw_summary, created_at
        )
        SELECT 
            id, user_id, thread_id, user_input, assistant_reply,
            summary as core_theme, mood, 
            signals as core_beliefs, 
            '[]'::jsonb as triggers,
            '[]'::jsonb as key_facts,
            next_focus, 
            5 as intensity,
            raw_summary,
            created_at
        FROM journal_entries
        """
    )


def downgrade() -> None:
    # Drop indexes
    op.drop_index("idx_journal_entries_v2_import_dedupe", table_name="journal_entries_v2")
    op.drop_index("idx_journal_entries_v2_user_thread_created", table_name="journal_entries_v2")
    
    # Drop journal_entries_v2 table
    op.drop_table("journal_entries_v2")
