"""org-node v2: schools, school_secrets, school_domains, releases

Revision ID: 0003_org_node
Revises: 0002_org_secrets
Create Date: 2026-05-25
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003_org_node"
down_revision: Union[str, None] = "0002_org_secrets"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "schools",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("org_id", sa.Integer, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("slug", sa.String(50), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="provisioning"),
        sa.Column("release_tag", sa.String(64), nullable=True),
        sa.Column("admin_email", sa.String(255), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("activated_at", sa.DateTime, nullable=True),
        sa.Column("archived_at", sa.DateTime, nullable=True),
        sa.UniqueConstraint("slug", name="uq_schools_slug"),
    )
    op.create_index("ix_schools_org_id", "schools", ["org_id"])
    op.create_index("ix_schools_slug", "schools", ["slug"])

    op.create_table(
        "school_secrets",
        sa.Column("school_id", sa.Integer, sa.ForeignKey("schools.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("db_password", sa.String(128), nullable=False),
        sa.Column("secret_key", sa.String(128), nullable=False),
        sa.Column("telemetry_token", sa.String(128), nullable=False),
        sa.Column("redis_db_index", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "school_domains",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("school_id", sa.Integer, sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("domain", sa.String(255), nullable=False),
        sa.Column("domain_type", sa.String(20), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="pending_dns"),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("activated_at", sa.DateTime, nullable=True),
        sa.UniqueConstraint("domain", name="uq_school_domains_domain"),
    )
    op.create_index("ix_school_domains_school_id", "school_domains", ["school_id"])

    op.create_table(
        "releases",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("channel", sa.String(30), nullable=False, server_default="stable"),
        sa.Column("version_tag", sa.String(64), nullable=False),
        sa.Column("image", sa.String(255), nullable=True),
        sa.Column("changelog", sa.Text, nullable=True),
        sa.Column("is_current", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("published_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("published_by", sa.Integer, sa.ForeignKey("platform_admins.id", ondelete="SET NULL"), nullable=True),
        sa.UniqueConstraint("channel", "version_tag", name="uq_release_channel_version"),
    )


def downgrade() -> None:
    op.drop_table("releases")
    op.drop_table("school_domains")
    op.drop_table("school_secrets")
    op.drop_table("schools")
