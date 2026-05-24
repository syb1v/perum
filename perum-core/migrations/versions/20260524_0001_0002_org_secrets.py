"""organization secrets

Revision ID: 0002_org_secrets
Revises: 0001_init
Create Date: 2026-05-24
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002_org_secrets"
down_revision: Union[str, None] = "0001_init"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "organization_secrets",
        sa.Column(
            "org_id",
            sa.Integer,
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("db_password", sa.String(128), nullable=False),
        sa.Column("secret_key", sa.String(128), nullable=False),
        sa.Column("telemetry_token", sa.String(128), nullable=False),
        sa.Column("redis_db_index", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("organization_secrets")
