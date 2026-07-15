"""school support data model

Revision ID: tenant_0025_school_support
Revises: tenant_0024_secure_media
"""
from alembic import op
import sqlalchemy as sa

revision = "tenant_0025_school_support"
down_revision = "tenant_0024_secure_media"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "support_tickets",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("public_id", sa.String(36), nullable=False, unique=True),
        sa.Column("correlation_id", sa.String(36), nullable=False, unique=True),
        sa.Column("school_id", sa.Integer(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("creator_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("subject", sa.String(255), nullable=False),
        sa.Column("category", sa.String(20), nullable=False, server_default="general"),
        sa.Column("status", sa.String(20), nullable=False, server_default="open"),
        sa.Column("priority", sa.String(20), nullable=False, server_default="normal"),
        sa.Column("assignee_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("client_ticket_id", sa.String(64), nullable=False),
        sa.Column("last_message_id", sa.String(36)),
        sa.Column("last_message_side", sa.String(20)),
        sa.Column("last_message_at", sa.DateTime()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("closed_at", sa.DateTime()),
        sa.CheckConstraint("category IN ('general', 'technical', 'account', 'academic', 'safety', 'other')", name="ck_support_tickets_category"),
        sa.CheckConstraint("status IN ('open', 'in_progress', 'waiting_requester', 'resolved', 'closed')", name="ck_support_tickets_status"),
        sa.CheckConstraint("priority IN ('low', 'normal', 'high', 'urgent')", name="ck_support_tickets_priority"),
        sa.CheckConstraint("version > 0", name="ck_support_tickets_version"),
        sa.UniqueConstraint("school_id", "creator_id", "client_ticket_id", name="uq_support_tickets_client"),
    )
    op.create_index("ix_support_tickets_inbox", "support_tickets", ["school_id", "status", "priority", "last_message_at"])
    op.create_table(
        "support_messages",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("school_id", sa.Integer(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("ticket_id", sa.Integer(), sa.ForeignKey("support_tickets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sender_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("client_message_id", sa.String(64), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("side", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("side IN ('requester', 'shared_inbox')", name="ck_support_messages_side"),
        sa.UniqueConstraint("ticket_id", "sender_id", "client_message_id", name="uq_support_messages_client"),
    )
    op.create_index("ix_support_messages_ticket_created", "support_messages", ["ticket_id", "created_at", "id"])
    op.create_table(
        "support_ticket_participants",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("school_id", sa.Integer(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("ticket_id", sa.Integer(), sa.ForeignKey("support_tickets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE")),
        sa.Column("last_read_message_id", sa.String(36), sa.ForeignKey("support_messages.id", ondelete="SET NULL")),
        sa.Column("read_at", sa.DateTime()),
        sa.CheckConstraint("kind IN ('requester', 'shared_inbox')", name="ck_support_ticket_participants_kind"),
        sa.CheckConstraint("(kind = 'requester' AND user_id IS NOT NULL) OR (kind = 'shared_inbox' AND user_id IS NULL)", name="ck_support_ticket_participants_user"),
        sa.UniqueConstraint("ticket_id", "kind", name="uq_support_ticket_participants_kind"),
    )
    op.create_table(
        "support_ticket_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("school_id", sa.Integer(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("ticket_id", sa.Integer(), sa.ForeignKey("support_tickets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("actor_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("metadata_json", sa.JSON()),
        sa.Column("metadata_text", sa.Text()),
        sa.Column("client_action_id", sa.String(64)),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("ticket_id", "client_action_id", name="uq_support_ticket_events_client_action"),
    )
    op.create_index("ix_support_ticket_events_ticket_created", "support_ticket_events", ["ticket_id", "created_at", "id"])
    with op.batch_alter_table("notifications") as batch_op:
        batch_op.add_column(sa.Column("ref_type", sa.String(50)))
        batch_op.add_column(sa.Column("ref_id", sa.String(64)))


def downgrade() -> None:
    with op.batch_alter_table("notifications") as batch_op:
        batch_op.drop_column("ref_id")
        batch_op.drop_column("ref_type")
    op.drop_table("support_ticket_events")
    op.drop_table("support_ticket_participants")
    op.drop_table("support_messages")
    op.drop_table("support_tickets")
