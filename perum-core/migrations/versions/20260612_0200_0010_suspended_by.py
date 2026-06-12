"""Источник заморозки школы: schools.suspended_by ('manual' | 'org')

Revision ID: 0010_suspended_by
Revises: 0009_suspend
Create Date: 2026-06-12
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0010_suspended_by"
down_revision: Union[str, None] = "0009_suspend"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("schools", sa.Column("suspended_by", sa.String(10), nullable=True))


def downgrade() -> None:
    op.drop_column("schools", "suspended_by")
