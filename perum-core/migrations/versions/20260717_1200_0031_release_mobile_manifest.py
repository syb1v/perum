"""release mobile descriptor manifest

Revision ID: 0031_release_mobile_manifest
Revises: 0030_support_org_relay
"""
from alembic import op
import sqlalchemy as sa

revision = "0031_release_mobile_manifest"
down_revision = "0030_support_org_relay"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("releases", sa.Column("mobile_descriptor_schema_version", sa.Integer(), nullable=True))
    op.add_column("releases", sa.Column("mobile_compatibility", sa.JSON(), nullable=True))
    op.add_column("releases", sa.Column("mobile_build_capabilities", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("releases", "mobile_build_capabilities")
    op.drop_column("releases", "mobile_compatibility")
    op.drop_column("releases", "mobile_descriptor_schema_version")
