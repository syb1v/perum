"""init control plane schema

Revision ID: 0001_init
Revises:
Create Date: 2026-05-24
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001_init"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "platform_admins",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("login", sa.String(50), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(200), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("last_login_at", sa.DateTime, nullable=True),
    )
    op.create_index("ix_platform_admins_login", "platform_admins", ["login"], unique=True)

    op.create_table(
        "organizations",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("slug", sa.String(40), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default=sa.text("'provisioning'")),
        sa.Column("deployment_mode", sa.String(30), nullable=False, server_default=sa.text("'shared_host'")),
        sa.Column("plan", sa.String(30), nullable=False, server_default=sa.text("'trial'")),
        sa.Column("admin_email", sa.String(255), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("activated_at", sa.DateTime, nullable=True),
        sa.Column("archived_at", sa.DateTime, nullable=True),
    )
    op.create_index("ix_organizations_slug", "organizations", ["slug"], unique=True)

    op.create_table(
        "organization_domains",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column(
            "org_id",
            sa.Integer,
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("domain", sa.String(255), nullable=False),
        sa.Column("domain_type", sa.String(20), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default=sa.text("'pending_dns'")),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("activated_at", sa.DateTime, nullable=True),
        sa.UniqueConstraint("domain", name="uq_organization_domains_domain"),
    )
    op.create_index("ix_organization_domains_org_id", "organization_domains", ["org_id"])


def downgrade() -> None:
    op.drop_index("ix_organization_domains_org_id", table_name="organization_domains")
    op.drop_table("organization_domains")
    op.drop_index("ix_organizations_slug", table_name="organizations")
    op.drop_table("organizations")
    op.drop_index("ix_platform_admins_login", table_name="platform_admins")
    op.drop_table("platform_admins")
