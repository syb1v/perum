"""social direct messages

Revision ID: tenant_0021_social_messages
Revises: tenant_0020_user_preferences
"""
from alembic import op
import sqlalchemy as sa

revision = "tenant_0021_social_messages"
down_revision = "tenant_0020_user_preferences"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "conversations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("school_id", sa.Integer(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_low_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_high_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("last_message_id", sa.Integer()),
        sa.Column("last_message_at", sa.DateTime()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("user_low_id < user_high_id", name="ck_conversations_pair_order"),
        sa.UniqueConstraint("school_id", "user_low_id", "user_high_id", name="uq_conversations_pair"),
    )
    op.create_index("ix_conversations_school_id", "conversations", ["school_id"])
    op.create_index("ix_conversations_user_low_id", "conversations", ["user_low_id"])
    op.create_index("ix_conversations_user_high_id", "conversations", ["user_high_id"])
    op.create_table(
        "conversation_members",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("school_id", sa.Integer(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("conversation_id", sa.Integer(), sa.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("last_read_message_id", sa.Integer()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("conversation_id", "user_id", name="uq_conversation_members_user"),
    )
    for column in ("school_id", "conversation_id", "user_id"):
        op.create_index(f"ix_conversation_members_{column}", "conversation_members", [column])
    op.create_table(
        "messages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("school_id", sa.Integer(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("conversation_id", sa.Integer(), sa.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sender_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("client_message_id", sa.String(64), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("conversation_id", "sender_id", "client_message_id", name="uq_messages_client_id"),
    )
    for column in ("school_id", "conversation_id", "sender_id", "expires_at"):
        op.create_index(f"ix_messages_{column}", "messages", [column])


def downgrade() -> None:
    op.drop_table("messages")
    op.drop_table("conversation_members")
    op.drop_table("conversations")
