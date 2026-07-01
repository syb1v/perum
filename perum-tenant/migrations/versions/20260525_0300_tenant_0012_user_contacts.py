"""user contacts — add patronymic, phone to users

Revision ID: tenant_0012_user_contacts
Revises: tenant_0011_appeals
Create Date: 2026-05-25
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "tenant_0012_user_contacts"
down_revision: Union[str, None] = "tenant_0011_appeals"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("patronymic", sa.String(100), nullable=True))
    op.add_column("users", sa.Column("phone", sa.String(50), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "phone")
    op.drop_column("users", "patronymic")
