"""grade optimistic lock

Revision ID: tenant_0028_grade_optimistic_lock
Revises: tenant_0027_push_foundation
"""
from alembic import op
import sqlalchemy as sa

revision = "tenant_0028_grade_optimistic_lock"
down_revision = "tenant_0027_push_foundation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("grades", sa.Column("version", sa.Integer(), nullable=False, server_default="1"))


def downgrade() -> None:
    op.drop_column("grades", "version")
