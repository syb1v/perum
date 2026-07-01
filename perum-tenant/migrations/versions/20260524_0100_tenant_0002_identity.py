"""tenant identity — organizations, schools, users

Revision ID: tenant_0002_identity
Revises: tenant_0001_init
Create Date: 2026-05-24
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "tenant_0002_identity"
down_revision: Union[str, None] = "tenant_0001_init"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "organizations",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("slug", sa.String(40), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("slug", name="uq_organizations_slug"),
    )

    op.create_table(
        "schools",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column(
            "org_id",
            sa.Integer,
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_schools_org_id", "schools", ["org_id"])

    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column(
            "school_id",
            sa.Integer,
            sa.ForeignKey("schools.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("role", sa.String(30), nullable=False),
        sa.Column("login", sa.String(150), nullable=False),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("first_name", sa.String(100), nullable=True),
        sa.Column("last_name", sa.String(100), nullable=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("must_change_password", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("balance", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("avatar_url", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("last_login_at", sa.DateTime, nullable=True),
        sa.UniqueConstraint("login", name="uq_users_login"),
    )
    op.create_index("ix_users_school_id", "users", ["school_id"])


def downgrade() -> None:
    op.drop_index("ix_users_school_id", table_name="users")
    op.drop_table("users")
    op.drop_index("ix_schools_org_id", table_name="schools")
    op.drop_table("schools")
    op.drop_table("organizations")
