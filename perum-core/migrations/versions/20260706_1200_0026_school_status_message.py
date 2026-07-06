"""0026_school_status_message — error message for failed school provisioning.

Revision ID: 0026
Revises: 0025_dns_provider
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0026_school_status_message"
down_revision: str | None = "0025_dns_provider"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "schools",
        sa.Column(
            "status_message",
            sa.Text(),
            nullable=True,
            comment="Последнее сообщение об ошибке при провижининге/обновлении",
        ),
    )


def downgrade() -> None:
    op.drop_column("schools", "status_message")
