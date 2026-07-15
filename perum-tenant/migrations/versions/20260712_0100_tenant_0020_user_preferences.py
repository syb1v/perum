"""user preferences and idempotency receipts

Revision ID: tenant_0020_user_preferences
Revises: tenant_0019_social_friends
"""
from alembic import op
import sqlalchemy as sa

revision = "tenant_0020_user_preferences"
down_revision = "tenant_0019_social_friends"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_preferences",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("push_preview_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.execute(sa.text("INSERT INTO user_preferences (user_id) SELECT id FROM users"))
    op.create_table(
        "idempotency_receipts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("scope", sa.String(100), nullable=False),
        sa.Column("idempotency_key", sa.String(255), nullable=False),
        sa.Column("request_fingerprint", sa.String(64), nullable=False),
        sa.Column("response_status", sa.Integer(), nullable=False),
        sa.Column("response_body", sa.Text(), nullable=False),
        sa.Column("response_etag", sa.String(64)),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "scope", "idempotency_key", name="uq_idempotency_receipts_scope_key"),
    )
    op.create_index("ix_idempotency_receipts_user_id", "idempotency_receipts", ["user_id"])


def downgrade() -> None:
    op.drop_table("idempotency_receipts")
    op.drop_table("user_preferences")
