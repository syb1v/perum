"""org-node v2: org_admins (операторы узла орг)

Revision ID: 0004_org_admins
Revises: 0003_org_node
Create Date: 2026-05-25
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004_org_admins"
down_revision: Union[str, None] = "0003_org_node"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "org_admins",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("org_id", sa.Integer, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("login", sa.String(50), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(200), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("last_login_at", sa.DateTime, nullable=True),
        sa.UniqueConstraint("login", name="uq_org_admins_login"),
    )
    op.create_index("ix_org_admins_org_id", "org_admins", ["org_id"])
    op.create_index("ix_org_admins_login", "org_admins", ["login"])


def downgrade() -> None:
    op.drop_table("org_admins")
