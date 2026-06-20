"""nodes.enabled — визуальный вкл/выкл ноды (не используется планировщиком, если выкл)

Revision ID: 0021_node_enabled
Revises: 0020_platform_settings
Create Date: 2026-06-20
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0021_node_enabled"
down_revision: Union[str, None] = "0020_platform_settings"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "nodes",
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )


def downgrade() -> None:
    op.drop_column("nodes", "enabled")
