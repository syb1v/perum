"""school_secrets: отдельный internal_rpc_token (разведение с telemetry_token)

Revision ID: 0013_internal_rpc_token
Revises: 0012_billing
Create Date: 2026-06-13
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0013_internal_rpc_token"
down_revision: Union[str, None] = "0012_billing"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # nullable: существующие школы получат значение при следующем provision/update
    # (до тех пор ядро ходит в /internal по telemetry_token — обратная совместимость).
    op.add_column(
        "school_secrets",
        sa.Column("internal_rpc_token", sa.String(255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("school_secrets", "internal_rpc_token")
