"""organization-approved support relay

Revision ID: 0030_support_org_relay
Revises: 0029_support_escalations
"""
from alembic import op

revision = "0030_support_org_relay"
down_revision = "0029_support_escalations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_unique_constraint(
        "uq_support_message_client", "support_messages", ["ticket_id", "client_message_id"]
    )


def downgrade() -> None:
    op.drop_constraint("uq_support_message_client", "support_messages", type_="unique")
