"""hardening: расширить колонки секретов до 255 (под шифрование at-rest)

Revision ID: 0007_widen_secrets
Revises: 0006_agent_state
Create Date: 2026-05-27
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007_widen_secrets"
down_revision: Union[str, None] = "0006_agent_state"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLES = ("organization_secrets", "school_secrets")
_COLS = ("db_password", "secret_key", "telemetry_token")


def upgrade() -> None:
    for t in _TABLES:
        for c in _COLS:
            op.alter_column(t, c, type_=sa.String(255), existing_nullable=False)


def downgrade() -> None:
    for t in _TABLES:
        for c in _COLS:
            op.alter_column(t, c, type_=sa.String(128), existing_nullable=False)
