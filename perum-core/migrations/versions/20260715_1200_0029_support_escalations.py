"""Organization-gated school support escalations.

Revision ID: 0029_support_escalations
Revises: 0028_public_tenant_identity
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0029_support_escalations"
down_revision: str | None = "0028_public_tenant_identity"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("support_tickets", sa.Column("source", sa.String(20), nullable=False, server_default="direct"))
    op.add_column("support_tickets", sa.Column("school_id", sa.Integer(), nullable=True))
    op.add_column("support_tickets", sa.Column("tenant_ticket_public_id", sa.String(128), nullable=True))
    op.add_column("support_tickets", sa.Column("correlation_id", sa.String(128), nullable=True))
    op.add_column("support_tickets", sa.Column("redacted_snapshot", sa.JSON(), nullable=True))
    op.add_column("support_tickets", sa.Column("approval_status", sa.String(20), nullable=False, server_default="not_required"))
    op.add_column("support_tickets", sa.Column("approval_version", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("support_tickets", sa.Column("approved_by_org_admin_id", sa.Integer(), nullable=True))
    op.add_column("support_tickets", sa.Column("approved_at", sa.DateTime(), nullable=True))
    op.add_column("support_tickets", sa.Column("rejected_by_org_admin_id", sa.Integer(), nullable=True))
    op.add_column("support_tickets", sa.Column("rejected_at", sa.DateTime(), nullable=True))
    op.add_column("support_tickets", sa.Column("outbound_ack_cursor", sa.Integer(), nullable=True))
    op.create_check_constraint("ck_support_tickets_source", "support_tickets", "source IN ('direct', 'school')")
    op.create_check_constraint(
        "ck_support_tickets_approval_status",
        "support_tickets",
        "approval_status IN ('not_required', 'pending', 'approved', 'rejected')",
    )
    op.create_foreign_key("fk_support_tickets_school", "support_tickets", "schools", ["school_id"], ["id"], ondelete="CASCADE")
    op.create_foreign_key("fk_support_tickets_approved_by", "support_tickets", "org_admins", ["approved_by_org_admin_id"], ["id"], ondelete="SET NULL")
    op.create_foreign_key("fk_support_tickets_rejected_by", "support_tickets", "org_admins", ["rejected_by_org_admin_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_support_tickets_school_id", "support_tickets", ["school_id"])
    op.create_index(
        "uq_support_school_correlation",
        "support_tickets",
        ["school_id", "correlation_id"],
        unique=True,
        postgresql_where=sa.text("source = 'school'"),
        sqlite_where=sa.text("source = 'school'"),
    )
    op.add_column("support_messages", sa.Column("public_id", sa.Uuid(), nullable=True))
    op.add_column("support_messages", sa.Column("client_message_id", sa.String(128), nullable=True))
    if op.get_context().dialect.name == "postgresql":
        op.execute("UPDATE support_messages SET public_id = md5('support-message-' || id::text)::uuid WHERE public_id IS NULL")
    else:
        from uuid import uuid4

        conn = op.get_bind()
        messages = sa.table("support_messages", sa.column("id", sa.Integer()), sa.column("public_id", sa.Uuid()))
        for row in conn.execute(sa.select(messages.c.id).where(messages.c.public_id.is_(None))):
            conn.execute(messages.update().where(messages.c.id == row.id).values(public_id=uuid4()))
    with op.batch_alter_table("support_messages") as batch_op:
        batch_op.alter_column("public_id", existing_type=sa.Uuid(), nullable=False)
    op.create_index("ix_support_messages_public_id", "support_messages", ["public_id"], unique=True)
    op.create_table(
        "support_escalation_events",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("ticket_id", sa.Integer(), sa.ForeignKey("support_tickets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("org_admin_id", sa.Integer(), sa.ForeignKey("org_admins.id", ondelete="CASCADE"), nullable=False),
        sa.Column("action", sa.String(20), nullable=False),
        sa.Column("client_action_id", sa.String(128), nullable=False),
        sa.Column("from_version", sa.Integer(), nullable=False),
        sa.Column("to_version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("ticket_id", "client_action_id", name="uq_support_escalation_action"),
    )
    op.create_index("ix_support_escalation_events_ticket_id", "support_escalation_events", ["ticket_id"])


def downgrade() -> None:
    op.drop_index("ix_support_escalation_events_ticket_id", table_name="support_escalation_events")
    op.drop_table("support_escalation_events")
    op.drop_index("ix_support_messages_public_id", table_name="support_messages")
    op.drop_column("support_messages", "client_message_id")
    op.drop_column("support_messages", "public_id")
    op.drop_index("uq_support_school_correlation", table_name="support_tickets")
    op.drop_index("ix_support_tickets_school_id", table_name="support_tickets")
    op.drop_constraint("fk_support_tickets_rejected_by", "support_tickets", type_="foreignkey")
    op.drop_constraint("fk_support_tickets_approved_by", "support_tickets", type_="foreignkey")
    op.drop_constraint("fk_support_tickets_school", "support_tickets", type_="foreignkey")
    op.drop_constraint("ck_support_tickets_approval_status", "support_tickets", type_="check")
    op.drop_constraint("ck_support_tickets_source", "support_tickets", type_="check")
    for name in ("outbound_ack_cursor", "rejected_at", "rejected_by_org_admin_id", "approved_at", "approved_by_org_admin_id", "approval_version", "approval_status", "redacted_snapshot", "correlation_id", "tenant_ticket_public_id", "school_id", "source"):
        op.drop_column("support_tickets", name)
