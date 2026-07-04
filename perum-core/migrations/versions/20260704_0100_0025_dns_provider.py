"""0025_dns_provider — Cloudflare DNS integration for organizations.

Добавляет поля dns_provider и cf_zone_id в таблицу organizations для
авто-управления A-записями поддоменов школ через Cloudflare API (задача 5).

Revision ID: 0025
Revises: 0024_domain_identity
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0025_dns_provider"
down_revision: str | None = "0024_domain_identity"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column(
            "dns_provider",
            sa.String(20),
            nullable=False,
            server_default="manual",
            comment="manual | cloudflare — кто управляет DNS-записями школ",
        ),
    )
    op.add_column(
        "organizations",
        sa.Column(
            "cf_zone_id",
            sa.String(64),
            nullable=True,
            comment="ID зоны в Cloudflare для этого домена",
        ),
    )
    op.add_column(
        "schools",
        sa.Column(
            "cf_record_id",
            sa.String(64),
            nullable=True,
            comment="ID A-записи поддомена в Cloudflare",
        ),
    )


def downgrade() -> None:
    op.drop_column("schools", "cf_record_id")
    op.drop_column("organizations", "cf_zone_id")
    op.drop_column("organizations", "dns_provider")
