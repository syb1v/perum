"""org-node v2: agent_state (локальная идентичность узла орг)

Revision ID: 0006_agent_state
Revises: 0005_enrollment_tokens
Create Date: 2026-05-26
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006_agent_state"
down_revision: Union[str, None] = "0005_enrollment_tokens"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "agent_state",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("org_slug", sa.String(40), nullable=False),
        sa.Column("org_name", sa.String(255), nullable=True),
        sa.Column("core_url", sa.String(255), nullable=False),
        sa.Column("release_tag", sa.String(64), nullable=True),
        sa.Column("enrolled_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("agent_state")
