"""persist agent desired Web image

Revision ID: 0036_agent_desired_web_image
Revises: 0035_pilot_entitlements
"""
from alembic import op
import sqlalchemy as sa

revision = "0036_agent_desired_web_image"
down_revision = "0035_pilot_entitlements"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("agent_state", sa.Column("desired_web_image", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("agent_state", "desired_web_image")
