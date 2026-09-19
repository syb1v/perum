"""Persist proven node Web rollout capability.

Revision ID: 0039_node_web_rollout
Revises: 0038_node_agent_transport
"""

from alembic import op
import sqlalchemy as sa


revision = "0039_node_web_rollout"
down_revision = "0038_node_agent_transport"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("nodes", sa.Column("web_rollout_version", sa.String(length=32), nullable=True))


def downgrade() -> None:
    op.drop_column("nodes", "web_rollout_version")
