"""mobile refresh sessions

Revision ID: tenant_0018_refresh_sessions
Revises: tenant_0017_lesson_occurrences
"""
from alembic import op
import sqlalchemy as sa

revision = "tenant_0018_refresh_sessions"
down_revision = "tenant_0017_lesson_occurrences"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "refresh_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("session_token", sa.String(64), nullable=False, unique=True),
        sa.Column("refresh_token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("previous_refresh_token_hash", sa.String(64), nullable=True),
        sa.Column("token_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("device_id", sa.String(255), nullable=True),
        sa.Column("device_name", sa.String(255), nullable=True),
        sa.Column("device_platform", sa.String(50), nullable=True),
        sa.Column("app_version", sa.String(50), nullable=True),
        sa.Column("last_ip", sa.String(64), nullable=True),
        sa.Column("user_agent", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("last_used_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_refresh_sessions_user_id", "refresh_sessions", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_refresh_sessions_user_id", table_name="refresh_sessions")
    op.drop_table("refresh_sessions")
