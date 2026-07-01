"""Телеметрия школ: school_metrics (снимок агрегатов + last_heartbeat)

Revision ID: 0011_school_metrics
Revises: 0010_suspended_by
Create Date: 2026-06-12
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0011_school_metrics"
down_revision: Union[str, None] = "0010_suspended_by"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "school_metrics",
        sa.Column("school_id", sa.Integer, sa.ForeignKey("schools.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("last_heartbeat_at", sa.DateTime, nullable=True),
        sa.Column("users_total", sa.Integer, nullable=False, server_default="0"),
        sa.Column("students", sa.Integer, nullable=False, server_default="0"),
        sa.Column("teachers", sa.Integer, nullable=False, server_default="0"),
        sa.Column("parents", sa.Integer, nullable=False, server_default="0"),
        sa.Column("admins", sa.Integer, nullable=False, server_default="0"),
        sa.Column("grades_total", sa.Integer, nullable=False, server_default="0"),
        sa.Column("avg_grade", sa.Float, nullable=True),
        sa.Column("active_24h", sa.Integer, nullable=False, server_default="0"),
        sa.Column("balance_total", sa.BigInteger, nullable=False, server_default="0"),
        sa.Column("payload", sa.JSON, nullable=True),
        sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("school_metrics")
