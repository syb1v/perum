"""org-node v2: enrollment_tokens (подключение узла орг)

Revision ID: 0005_enrollment_tokens
Revises: 0004_org_admins
Create Date: 2026-05-26
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005_enrollment_tokens"
down_revision: Union[str, None] = "0004_org_admins"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "enrollment_tokens",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("org_id", sa.Integer, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime, nullable=False),
        sa.Column("used_at", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("token_hash", name="uq_enrollment_tokens_hash"),
    )
    op.create_index("ix_enrollment_tokens_org_id", "enrollment_tokens", ["org_id"])
    op.create_index("ix_enrollment_tokens_token_hash", "enrollment_tokens", ["token_hash"])


def downgrade() -> None:
    op.drop_table("enrollment_tokens")
