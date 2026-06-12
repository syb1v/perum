"""Заморозка: suspended_at у organizations и schools (статус 'suspended')

Revision ID: 0009_suspend
Revises: 0008_contact_leads
Create Date: 2026-06-12
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009_suspend"
down_revision: Union[str, None] = "0008_contact_leads"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("organizations", sa.Column("suspended_at", sa.DateTime, nullable=True))
    op.add_column("schools", sa.Column("suspended_at", sa.DateTime, nullable=True))


def downgrade() -> None:
    op.drop_column("schools", "suspended_at")
    op.drop_column("organizations", "suspended_at")
