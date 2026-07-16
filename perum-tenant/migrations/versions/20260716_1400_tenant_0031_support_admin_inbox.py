"""support admin-only relay inbox

Revision ID: tenant_0031_support_admin_inbox
Revises: tenant_0030_push_installation_secret
"""
from alembic import op

revision = "tenant_0031_support_admin_inbox"
down_revision = "tenant_0030_push_installation_secret"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("support_messages") as batch_op:
        batch_op.drop_constraint("ck_support_messages_side", type_="check")
        batch_op.create_check_constraint(
            "ck_support_messages_side",
            "side IN ('requester', 'shared_inbox', 'admin_inbox')",
        )


def downgrade() -> None:
    op.execute("DELETE FROM support_messages WHERE side = 'admin_inbox'")
    with op.batch_alter_table("support_messages") as batch_op:
        batch_op.drop_constraint("ck_support_messages_side", type_="check")
        batch_op.create_check_constraint(
            "ck_support_messages_side", "side IN ('requester', 'shared_inbox')"
        )
