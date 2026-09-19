"""persist crash-durable Agent Web rollout transaction

Revision ID: 0037_agent_web_rollout_tx
Revises: 0036_agent_desired_web_image
"""
from alembic import op
import sqlalchemy as sa

revision = "0037_agent_web_rollout_tx"
down_revision = "0036_agent_desired_web_image"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("agent_state", sa.Column("web_rollout_target_image", sa.String(255), nullable=True))
    op.add_column("agent_state", sa.Column("web_rollout_previous_image_id", sa.String(255), nullable=True))
    op.add_column("agent_state", sa.Column("web_rollout_previous_image_ref", sa.String(255), nullable=True))
    op.add_column("agent_state", sa.Column("web_rollout_phase", sa.String(32), nullable=True))
    op.add_column("agent_state", sa.Column("web_rollout_started_at", sa.DateTime(), nullable=True))
    op.add_column("agent_state", sa.Column("web_rollout_updated_at", sa.DateTime(), nullable=True))
    op.add_column("agent_state", sa.Column("web_rollout_error_code", sa.String(64), nullable=True))


def downgrade() -> None:
    op.drop_column("agent_state", "web_rollout_error_code")
    op.drop_column("agent_state", "web_rollout_updated_at")
    op.drop_column("agent_state", "web_rollout_started_at")
    op.drop_column("agent_state", "web_rollout_phase")
    op.drop_column("agent_state", "web_rollout_previous_image_ref")
    op.drop_column("agent_state", "web_rollout_previous_image_id")
    op.drop_column("agent_state", "web_rollout_target_image")
