"""Add fail-closed social deployment readiness."""

from alembic import op
import sqlalchemy as sa


revision = "0033_social_ready"
down_revision = "0032_school_deployment_snapshot"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("school_deployment_snapshots", sa.Column("social_ready", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column("school_deployment_snapshots", "social_ready")
