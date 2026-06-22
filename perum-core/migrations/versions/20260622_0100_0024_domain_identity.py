"""Доменная идентичность: organizations.domain/node_id/landing_status + schools.subdomain

Revision ID: 0024_domain_identity
Revises: 0023_node_metrics
Create Date: 2026-06-22
"""

import os
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0024_domain_identity"
down_revision: Union[str, None] = "0023_node_metrics"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("organizations", sa.Column("domain", sa.String(255), nullable=True))
    op.add_column("organizations", sa.Column("node_id", sa.Integer(), sa.ForeignKey("nodes.id", ondelete="SET NULL"), nullable=True))
    op.add_column("organizations", sa.Column("landing_status", sa.String(20), nullable=False, server_default="pending"))
    op.create_index("ix_organizations_domain", "organizations", ["domain"], unique=True)
    op.create_index("ix_organizations_node_id", "organizations", ["node_id"])

    op.add_column("schools", sa.Column("subdomain", sa.String(63), nullable=True))

    # Бэкфилл существующих: домен орг = "<slug>.<base>", поддомен школы = slug.
    base = os.environ.get("PUBLIC_BASE_DOMAIN", "perum.local")
    conn = op.get_bind()
    conn.execute(sa.text("UPDATE organizations SET domain = slug || '.' || :base WHERE domain IS NULL"), {"base": base})
    conn.execute(sa.text("UPDATE schools SET subdomain = slug WHERE subdomain IS NULL"))


def downgrade() -> None:
    op.drop_column("schools", "subdomain")
    op.drop_index("ix_organizations_node_id", table_name="organizations")
    op.drop_index("ix_organizations_domain", table_name="organizations")
    op.drop_column("organizations", "landing_status")
    op.drop_column("organizations", "node_id")
    op.drop_column("organizations", "domain")
