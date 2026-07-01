"""nodes.country_code — ISO-код страны для флага в UI

Revision ID: 0019_add_node_country
Revises: 0018_nullable_enrollment_token_org
Create Date: 2026-06-20
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0019_add_node_country"
down_revision: Union[str, None] = "0018_nullable_token_org"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("nodes", sa.Column("country_code", sa.String(length=2), nullable=True))


def downgrade() -> None:
    op.drop_column("nodes", "country_code")
