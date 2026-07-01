"""add plan limits to organizations

Revision ID: 0016_add_plan_limits
Revises: 0015_add_nodes
Create Date: 2026-06-18
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0016_add_plan_limits"
down_revision: Union[str, None] = "0015_add_nodes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column(
            "plan_tier",
            sa.String(32),
            nullable=False,
            server_default="starter",
            comment="free | starter | pro | enterprise",
        ),
    )
    op.add_column(
        "organizations",
        sa.Column("max_schools", sa.Integer, nullable=False, server_default="5"),
    )
    op.add_column(
        "organizations",
        sa.Column("max_custom_domains", sa.Integer, nullable=False, server_default="1"),
    )
    op.add_column(
        "organizations",
        sa.Column(
            "custom_landing_enabled",
            sa.Boolean,
            nullable=False,
            server_default="false",
        ),
    )
    op.add_column(
        "organizations",
        sa.Column("max_nodes", sa.Integer, nullable=False, server_default="1"),
    )


def downgrade() -> None:
    op.drop_column("organizations", "max_nodes")
    op.drop_column("organizations", "custom_landing_enabled")
    op.drop_column("organizations", "max_custom_domains")
    op.drop_column("organizations", "max_schools")
    op.drop_column("organizations", "plan_tier")
