"""school deployment snapshot

Revision ID: 0032_school_deployment_snapshot
Revises: 0031_release_mobile_manifest
"""
from alembic import op
import sqlalchemy as sa

revision = "0032_school_deployment_snapshot"
down_revision = "0031_release_mobile_manifest"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "school_deployment_snapshots",
        sa.Column("school_id", sa.Integer(), nullable=False),
        sa.Column("schema_version", sa.Integer(), nullable=False),
        sa.Column("release_image", sa.String(length=255), nullable=False),
        sa.Column("scanner_ready", sa.Boolean(), nullable=False),
        sa.Column("realtime_ready", sa.Boolean(), nullable=False),
        sa.Column("push_registration_ready", sa.Boolean(), nullable=False),
        sa.Column("push_delivery_ready", sa.Boolean(), nullable=False),
        sa.Column("observed_at", sa.DateTime(), nullable=False),
        sa.Column("received_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["school_id"], ["schools.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("school_id"),
    )


def downgrade() -> None:
    op.drop_table("school_deployment_snapshots")
