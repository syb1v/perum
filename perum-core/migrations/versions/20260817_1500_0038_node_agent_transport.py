"""persist node agent transport capability

Revision ID: 0038_node_agent_transport
Revises: 0037_agent_web_rollout_tx
"""

from alembic import op
import sqlalchemy as sa

revision = "0038_node_agent_transport"
down_revision = "0037_agent_web_rollout_tx"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "nodes",
        sa.Column("agent_transport", sa.String(length=20), server_default="legacy_http", nullable=False),
    )
    op.add_column("nodes", sa.Column("agent_transport_version", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("nodes", "agent_transport_version")
    op.drop_column("nodes", "agent_transport")
