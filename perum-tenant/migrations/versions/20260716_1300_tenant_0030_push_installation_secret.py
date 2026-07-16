"""push installation proof of possession

Revision ID: tenant_0030_push_installation_secret
Revises: tenant_0029_lesson_occurrence_version
"""
from alembic import op
import sqlalchemy as sa

revision = "tenant_0030_push_installation_secret"
down_revision = "tenant_0029_lesson_occurrence_version"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("push_installations", sa.Column("secret_hash", sa.String(64), nullable=True))


def downgrade() -> None:
    op.drop_column("push_installations", "secret_hash")
