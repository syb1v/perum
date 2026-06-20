"""enrollment_tokens.org_id → nullable (pool-ноды без организации)

Revision ID: 0018_nullable_enrollment_token_org
Revises: 0017_add_update_history
Create Date: 2026-06-20
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0018_nullable_token_org"
down_revision: Union[str, None] = "0017_add_update_history"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("enrollment_tokens") as batch_op:
        batch_op.alter_column("org_id", nullable=True)


def downgrade() -> None:
    with op.batch_alter_table("enrollment_tokens") as batch_op:
        batch_op.alter_column("org_id", nullable=False)
