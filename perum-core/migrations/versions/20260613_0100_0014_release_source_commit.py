"""releases: source_commit (привязка релиза к реальному коммиту тенанта)

Revision ID: 0014_release_source_commit
Revises: 0013_internal_rpc_token
Create Date: 2026-06-13
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0014_release_source_commit"
down_revision: Union[str, None] = "0013_internal_rpc_token"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("releases", sa.Column("source_commit", sa.String(64), nullable=True))


def downgrade() -> None:
    op.drop_column("releases", "source_commit")
