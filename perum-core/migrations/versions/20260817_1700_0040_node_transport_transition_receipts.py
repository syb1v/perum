"""Persist idempotent node transport transition receipts.

Revision ID: 0040_node_transport_receipts
Revises: 0039_node_web_rollout
"""

from alembic import op
import sqlalchemy as sa


revision = "0040_node_transport_receipts"
down_revision = "0039_node_web_rollout"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "node_transport_transitions",
        sa.Column("transition_id", sa.String(length=36), primary_key=True),
        sa.Column("node_id", sa.Integer(), sa.ForeignKey("nodes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("expected_transport", sa.String(length=20), nullable=False),
        sa.Column("expected_transport_version", sa.String(length=255), nullable=True),
        sa.Column("expected_web_rollout_version", sa.String(length=32), nullable=True),
        sa.Column("agent_image", sa.String(length=255), nullable=False),
        sa.Column("phase", sa.String(length=20), nullable=False),
        sa.Column("error_code", sa.String(length=40), nullable=True),
        sa.Column("error_reason", sa.String(length=160), nullable=True),
        sa.Column("resulting_transport", sa.String(length=20), nullable=True),
        sa.Column("resulting_transport_version", sa.String(length=255), nullable=True),
        sa.Column("resulting_web_rollout_version", sa.String(length=32), nullable=True),
        sa.Column("committed_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_node_transport_transitions_node_id", "node_transport_transitions", ["node_id"])


def downgrade() -> None:
    op.drop_index("ix_node_transport_transitions_node_id", table_name="node_transport_transitions")
    op.drop_table("node_transport_transitions")
