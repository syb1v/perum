"""support escalation dead letter

Revision ID: tenant_0038_escalation_dlq
Revises: tenant_0037_scanner_foundation
"""
from alembic import op

revision = "tenant_0038_escalation_dlq"
down_revision = "tenant_0037_scanner_foundation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("support_escalation_outbox") as batch_op:
        batch_op.drop_constraint("ck_support_escalation_outbox_status", type_="check")
        batch_op.create_check_constraint("ck_support_escalation_outbox_status", "status IN ('pending', 'processing', 'delivered', 'error', 'dead_letter')")


def downgrade() -> None:
    op.execute("UPDATE support_escalation_outbox SET status = 'error' WHERE status = 'dead_letter'")
    with op.batch_alter_table("support_escalation_outbox") as batch_op:
        batch_op.drop_constraint("ck_support_escalation_outbox_status", type_="check")
        batch_op.create_check_constraint("ck_support_escalation_outbox_status", "status IN ('pending', 'processing', 'delivered', 'error')")
