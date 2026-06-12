"""Биллинг: subscriptions + invoices (R2)

Revision ID: 0012_billing
Revises: 0011_school_metrics
Create Date: 2026-06-12
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0012_billing"
down_revision: Union[str, None] = "0011_school_metrics"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "subscriptions",
        sa.Column("org_id", sa.Integer, sa.ForeignKey("organizations.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="trial"),
        sa.Column("trial_ends_at", sa.DateTime, nullable=True),
        sa.Column("paid_until", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, nullable=True),
    )
    op.create_table(
        "invoices",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("org_id", sa.Integer, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("plan", sa.String(30), nullable=False),
        sa.Column("amount_rub", sa.Integer, nullable=False, server_default="0"),
        sa.Column("period_start", sa.DateTime, nullable=True),
        sa.Column("period_end", sa.DateTime, nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="open"),
        sa.Column("provider", sa.String(30), nullable=False, server_default="manual"),
        sa.Column("provider_ref", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("paid_at", sa.DateTime, nullable=True),
    )
    op.create_index("ix_invoices_org_id", "invoices", ["org_id"])


def downgrade() -> None:
    op.drop_table("invoices")
    op.drop_table("subscriptions")
