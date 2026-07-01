"""exchange — subject_averages, investments, trading_windows, exchange_settings, exchange_logs

Revision ID: tenant_0008_exchange
Revises: tenant_0007_quests
Create Date: 2026-05-24
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "tenant_0008_exchange"
down_revision: Union[str, None] = "tenant_0007_quests"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "subject_averages",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("school_id", sa.Integer, sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=True),
        sa.Column("class_id", sa.Integer, sa.ForeignKey("classes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("subject_id", sa.Integer, sa.ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("week_number", sa.Integer, nullable=False),
        sa.Column("academic_year", sa.Integer, nullable=False),
        sa.Column("average_score", sa.Float, nullable=False, server_default="0"),
        sa.Column("index_change", sa.Float, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    for col in ("school_id", "class_id", "subject_id"):
        op.create_index(f"ix_subject_averages_{col}", "subject_averages", [col])

    op.create_table(
        "investments",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("school_id", sa.Integer, sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("subject_id", sa.Integer, sa.ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("amount", sa.Integer, nullable=False),
        sa.Column("week_number", sa.Integer, nullable=False),
        sa.Column("academic_year", sa.Integer, nullable=False),
        sa.Column("result_amount", sa.Integer, nullable=True),
        sa.Column("index_change", sa.Float, nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime, nullable=True),
    )
    for col in ("school_id", "user_id", "subject_id"):
        op.create_index(f"ix_investments_{col}", "investments", [col])

    op.create_table(
        "trading_windows",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("school_id", sa.Integer, sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=True),
        sa.Column("week_number", sa.Integer, nullable=False),
        sa.Column("academic_year", sa.Integer, nullable=False),
        sa.Column("opens_at", sa.DateTime, nullable=False),
        sa.Column("closes_at", sa.DateTime, nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_trading_windows_school_id", "trading_windows", ["school_id"])

    op.create_table(
        "exchange_settings",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("school_id", sa.Integer, sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=True),
        sa.Column("open_day", sa.Integer, nullable=False, server_default="1"),
        sa.Column("open_time", sa.String(5), nullable=False, server_default="00:00"),
        sa.Column("close_day", sa.Integer, nullable=False, server_default="7"),
        sa.Column("close_time", sa.String(5), nullable=False, server_default="23:59"),
        sa.Column("calc_day", sa.Integer, nullable=False, server_default="7"),
        sa.Column("calc_time", sa.String(5), nullable=False, server_default="20:30"),
        sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_exchange_settings_school_id", "exchange_settings", ["school_id"])

    op.create_table(
        "exchange_logs",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("school_id", sa.Integer, sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("subject_id", sa.Integer, sa.ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("amount", sa.Integer, nullable=False),
        sa.Column("price", sa.Float, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    for col in ("school_id", "user_id", "subject_id"):
        op.create_index(f"ix_exchange_logs_{col}", "exchange_logs", [col])


def downgrade() -> None:
    op.drop_table("exchange_logs")
    op.drop_table("exchange_settings")
    op.drop_table("trading_windows")
    op.drop_table("investments")
    op.drop_table("subject_averages")
