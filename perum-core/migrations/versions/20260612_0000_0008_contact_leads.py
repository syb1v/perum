"""Лиды лендинга: contact_leads (форма «Связаться» на апекс-домене ядра)

Revision ID: 0008_contact_leads
Revises: 0007_widen_secrets
Create Date: 2026-06-12
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0008_contact_leads"
down_revision: Union[str, None] = "0007_widen_secrets"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "contact_leads",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("org_name", sa.String(255), nullable=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("message", sa.Text, nullable=True),
        sa.Column("source_host", sa.String(255), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="new"),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("contact_leads")
