"""push foundation

Revision ID: tenant_0027_push_foundation
Revises: tenant_0026_support_escalations
"""
from alembic import op
import sqlalchemy as sa

revision = "tenant_0027_push_foundation"
down_revision = "tenant_0026_support_escalations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("push_installations", sa.Column("id", sa.String(36), primary_key=True), sa.Column("school_id", sa.Integer(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False), sa.Column("platform", sa.String(20), nullable=False), sa.Column("device_name", sa.String(255)), sa.Column("state", sa.String(20), nullable=False, server_default="active"), sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()), sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()), sa.CheckConstraint("platform IN ('ios', 'android')", name="ck_push_installations_platform"), sa.CheckConstraint("state IN ('active', 'revoked')", name="ck_push_installations_state"))
    op.create_index("ix_push_installations_school_id", "push_installations", ["school_id"])
    op.create_table("push_endpoints", sa.Column("id", sa.String(36), primary_key=True), sa.Column("school_id", sa.Integer(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False), sa.Column("installation_id", sa.String(36), sa.ForeignKey("push_installations.id", ondelete="CASCADE"), nullable=False), sa.Column("provider", sa.String(20), nullable=False), sa.Column("environment", sa.String(20), nullable=False), sa.Column("app_id", sa.String(200), nullable=False), sa.Column("app_version", sa.String(50)), sa.Column("token_ciphertext", sa.LargeBinary(), nullable=False), sa.Column("token_key_id", sa.String(32), nullable=False), sa.Column("token_hash", sa.String(64), nullable=False), sa.Column("state", sa.String(20), nullable=False, server_default="active"), sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()), sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()), sa.UniqueConstraint("installation_id", "provider", "environment", "app_id", name="uq_push_endpoint_installation_provider_env_app"), sa.CheckConstraint("provider IN ('expo', 'fcm', 'apns', 'rustore', 'huawei')", name="ck_push_endpoints_provider"), sa.CheckConstraint("environment IN ('development', 'production')", name="ck_push_endpoints_environment"), sa.CheckConstraint("state IN ('active', 'replaced', 'invalid', 'revoked')", name="ck_push_endpoints_state"))
    op.create_index("ix_push_endpoints_school_id", "push_endpoints", ["school_id"])
    op.create_index("ix_push_endpoints_installation_id", "push_endpoints", ["installation_id"])
    op.create_index("ix_push_endpoints_token_hash", "push_endpoints", ["token_hash"])
    op.create_table("push_registrations", sa.Column("id", sa.String(36), primary_key=True), sa.Column("school_id", sa.Integer(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False), sa.Column("installation_id", sa.String(36), sa.ForeignKey("push_installations.id", ondelete="CASCADE"), nullable=False), sa.Column("endpoint_id", sa.String(36), sa.ForeignKey("push_endpoints.id", ondelete="CASCADE"), nullable=False), sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False), sa.Column("refresh_session_id", sa.Integer(), sa.ForeignKey("refresh_sessions.id", ondelete="CASCADE"), nullable=False), sa.Column("state", sa.String(20), nullable=False, server_default="active"), sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()), sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()), sa.Column("revoked_at", sa.DateTime()), sa.UniqueConstraint("installation_id", "user_id", name="uq_push_registration_installation_user"), sa.CheckConstraint("state IN ('active', 'revoked')", name="ck_push_registrations_state"))
    for column in ("school_id", "installation_id", "endpoint_id", "user_id", "refresh_session_id"):
        op.create_index(f"ix_push_registrations_{column}", "push_registrations", [column])
    op.create_table("push_outbox", sa.Column("id", sa.String(36), primary_key=True), sa.Column("school_id", sa.Integer(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False), sa.Column("installation_id", sa.String(36), sa.ForeignKey("push_installations.id", ondelete="CASCADE"), nullable=False), sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False), sa.Column("event_key", sa.String(255), nullable=False), sa.Column("category", sa.String(50), nullable=False), sa.Column("target", sa.String(255), nullable=False), sa.Column("state", sa.String(20), nullable=False, server_default="suppressed"), sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"), sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()), sa.UniqueConstraint("installation_id", "user_id", "event_key", name="uq_push_outbox_installation_user_event"), sa.CheckConstraint("state IN ('pending', 'suppressed', 'delivered', 'failed')", name="ck_push_outbox_state"))
    op.create_index("ix_push_outbox_school_id", "push_outbox", ["school_id"])
    op.create_index("ix_push_outbox_user_id", "push_outbox", ["user_id"])


def downgrade() -> None:
    op.drop_table("push_outbox")
    op.drop_table("push_registrations")
    op.drop_table("push_endpoints")
    op.drop_table("push_installations")
