"""nodes: снимок реальной загрузки (cpu/ram/disk) + латентность ядро→воркер

Revision ID: 0023_node_metrics
Revises: 0022_news_support
Create Date: 2026-06-20
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0023_node_metrics"
down_revision: Union[str, None] = "0022_news_support"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_COLS = [
    ("last_cpu_percent", sa.Float()),
    ("last_ram_used_mb", sa.Integer()),
    ("last_ram_total_mb", sa.Integer()),
    ("last_disk_used_gb", sa.Float()),
    ("last_disk_total_gb", sa.Float()),
    ("last_ping_ms", sa.Integer()),
    ("metrics_at", sa.DateTime()),
]


def upgrade() -> None:
    for name, col_type in _COLS:
        op.add_column("nodes", sa.Column(name, col_type, nullable=True))


def downgrade() -> None:
    for name, _ in reversed(_COLS):
        op.drop_column("nodes", name)
