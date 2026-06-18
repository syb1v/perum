"""add update_history table

Revision ID: 0017_add_update_history
Revises: 0016_add_plan_limits
Create Date: 2026-06-18
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0017_add_update_history"
down_revision: Union[str, None] = "0016_add_plan_limits"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "update_history",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column(
            "school_id",
            sa.Integer,
            sa.ForeignKey("schools.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("from_version", sa.String(64), nullable=True),
        sa.Column("to_version", sa.String(64), nullable=False),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default="pending",
            comment="pending | success | failed | rolled_back",
        ),
        sa.Column("started_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
        sa.Column("completed_at", sa.DateTime, nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
    )


def downgrade() -> None:
    op.drop_table("update_history")
