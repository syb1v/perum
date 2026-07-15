"""social realtime tickets

Revision ID: tenant_0023_social_realtime
Revises: tenant_0022_social_moderation
"""
from alembic import op
import sqlalchemy as sa

revision = "tenant_0023_social_realtime"
down_revision = "tenant_0022_social_moderation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("social_realtime_tickets", sa.Column("id", sa.Integer(), primary_key=True), sa.Column("school_id", sa.Integer(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False), sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False), sa.Column("token_digest", sa.String(64), nullable=False, unique=True), sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()), sa.Column("expires_at", sa.DateTime(), nullable=False), sa.Column("consumed_at", sa.DateTime()))
    op.create_index("ix_social_realtime_tickets_user_active", "social_realtime_tickets", ["school_id", "user_id", "expires_at", "consumed_at"])


def downgrade() -> None:
    op.drop_table("social_realtime_tickets")
