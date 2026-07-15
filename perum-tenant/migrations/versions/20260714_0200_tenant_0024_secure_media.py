"""secure media foundation

Revision ID: tenant_0024_secure_media
Revises: tenant_0023_social_realtime
"""
from alembic import op
import sqlalchemy as sa

revision = "tenant_0024_secure_media"
down_revision = "tenant_0023_social_realtime"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "media_objects",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("school_id", sa.Integer(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("purpose", sa.String(40), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("mime_type", sa.String(50), nullable=False),
        sa.Column("extension", sa.String(8), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("storage_key", sa.String(255), nullable=False, unique=True),
        sa.Column("state", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("scanned_at", sa.DateTime()),
        sa.Column("owner_grace_until", sa.DateTime(), nullable=False),
        sa.Column("deleted_at", sa.DateTime()),
        sa.CheckConstraint("state IN ('pending', 'clean', 'infected', 'rejected', 'deleted', 'missing')", name="ck_media_objects_state"),
        sa.CheckConstraint("size_bytes > 0", name="ck_media_objects_size"),
    )
    op.create_index("ix_media_objects_scan", "media_objects", ["state", "created_at"])
    op.create_index("ix_media_objects_owner", "media_objects", ["school_id", "owner_id", "state"])
    op.create_table(
        "media_upload_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("school_id", sa.Integer(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("client_upload_id", sa.String(64), nullable=False),
        sa.Column("purpose", sa.String(40), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("declared_mime", sa.String(50), nullable=False),
        sa.Column("declared_size", sa.Integer(), nullable=False),
        sa.Column("declared_sha256", sa.String(64), nullable=False),
        sa.Column("state", sa.String(20), nullable=False, server_default="created"),
        sa.Column("object_id", sa.String(36), sa.ForeignKey("media_objects.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("completed_at", sa.DateTime()),
        sa.CheckConstraint("state IN ('created', 'uploading', 'completed', 'expired', 'cancelled', 'failed')", name="ck_media_upload_sessions_state"),
        sa.CheckConstraint("declared_size > 0", name="ck_media_upload_sessions_size"),
        sa.UniqueConstraint("school_id", "owner_id", "client_upload_id", name="uq_media_upload_sessions_client"),
    )
    op.create_index("ix_media_upload_sessions_active", "media_upload_sessions", ["school_id", "owner_id", "state", "expires_at"])
    op.create_table(
        "media_bindings",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("school_id", sa.Integer(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("object_id", sa.String(36), sa.ForeignKey("media_objects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("binding_type", sa.String(50), nullable=False),
        sa.Column("resource_id", sa.String(64), nullable=False),
        sa.Column("bound_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("binding_type <> '' AND resource_id <> ''", name="ck_media_bindings_target"),
        sa.UniqueConstraint("school_id", "object_id", "binding_type", "resource_id", name="uq_media_bindings_target"),
    )
    op.create_index("ix_media_bindings_resource", "media_bindings", ["school_id", "binding_type", "resource_id"])
    op.create_table(
        "media_scan_results",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("school_id", sa.Integer(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("object_id", sa.String(36), sa.ForeignKey("media_objects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("scanner", sa.String(80), nullable=False),
        sa.Column("verdict", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("verdict IN ('clean', 'infected', 'unavailable', 'error')", name="ck_media_scan_results_verdict"),
    )
    op.create_index("ix_media_scan_results_object", "media_scan_results", ["object_id", "created_at"])
    op.create_table(
        "media_audit_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("school_id", sa.Integer(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("actor_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("session_id", sa.String(36)),
        sa.Column("object_id", sa.String(36)),
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column("outcome", sa.String(30), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_media_audit_events_school_created", "media_audit_events", ["school_id", "created_at"])


def downgrade() -> None:
    op.drop_table("media_audit_events")
    op.drop_table("media_scan_results")
    op.drop_table("media_bindings")
    op.drop_table("media_upload_sessions")
    op.drop_table("media_objects")
