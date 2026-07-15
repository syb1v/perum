"""support escalations

Revision ID: tenant_0026_support_escalations
Revises: tenant_0025_school_support
"""
from alembic import op
import sqlalchemy as sa

revision = "tenant_0026_support_escalations"
down_revision = "tenant_0025_school_support"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("support_tickets") as batch_op:
        batch_op.add_column(sa.Column("escalation_status", sa.String(30), nullable=False, server_default="none"))
        batch_op.add_column(sa.Column("escalation_requested_at", sa.DateTime()))
        batch_op.add_column(sa.Column("escalation_requested_by", sa.Integer()))
        batch_op.add_column(sa.Column("core_ticket_id", sa.Integer()))
        batch_op.add_column(sa.Column("last_core_message_cursor", sa.Integer(), nullable=False, server_default="0"))
        batch_op.create_check_constraint("ck_support_tickets_escalation_status", "escalation_status IN ('none', 'pending_delivery', 'pending_org_approval', 'approved', 'rejected', 'delivery_error')")
        batch_op.create_foreign_key("fk_support_tickets_escalation_requested_by", "users", ["escalation_requested_by"], ["id"], ondelete="SET NULL")
    with op.batch_alter_table("support_messages") as batch_op:
        batch_op.add_column(sa.Column("sender_snapshot", sa.String(50)))
    op.create_table(
        "support_escalation_outbox",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("school_id", sa.Integer(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("ticket_id", sa.Integer(), sa.ForeignKey("support_tickets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("payload_json", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("next_attempt_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("last_error", sa.Text()),
        sa.Column("delivered_at", sa.DateTime()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("status IN ('pending', 'processing', 'delivered', 'error')", name="ck_support_escalation_outbox_status"),
        sa.UniqueConstraint("ticket_id", name="uq_support_escalation_outbox_ticket"),
    )
    op.create_index("ix_support_escalation_outbox_due", "support_escalation_outbox", ["status", "next_attempt_at"])
    op.create_table(
        "support_escalation_receipts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("school_id", sa.Integer(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("ticket_id", sa.Integer(), sa.ForeignKey("support_tickets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("core_message_id", sa.Integer(), nullable=False),
        sa.Column("message_id", sa.String(36), sa.ForeignKey("support_messages.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("ticket_id", "core_message_id", name="uq_support_escalation_receipt_message"),
    )


def downgrade() -> None:
    op.drop_table("support_escalation_receipts")
    op.drop_index("ix_support_escalation_outbox_due", table_name="support_escalation_outbox")
    op.drop_table("support_escalation_outbox")
    with op.batch_alter_table("support_messages") as batch_op:
        batch_op.drop_column("sender_snapshot")
    with op.batch_alter_table("support_tickets") as batch_op:
        batch_op.drop_constraint("ck_support_tickets_escalation_status", type_="check")
        batch_op.drop_column("last_core_message_cursor")
        batch_op.drop_column("core_ticket_id")
        batch_op.drop_column("escalation_requested_by")
        batch_op.drop_column("escalation_requested_at")
        batch_op.drop_column("escalation_status")
