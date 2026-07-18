"""Durable scanner claims, retries and evidence."""

from alembic import op
import sqlalchemy as sa


revision = "tenant_0037_scanner_foundation"
down_revision = "tenant_0036_social_hardening"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("media_objects") as batch_op:
        batch_op.add_column(sa.Column("scan_attempts", sa.Integer(), nullable=False, server_default="0"))
        batch_op.add_column(sa.Column("next_scan_at", sa.DateTime()))
        batch_op.add_column(sa.Column("scan_lease_token", sa.String(36)))
        batch_op.add_column(sa.Column("scan_lease_expires_at", sa.DateTime()))
        batch_op.create_index("ix_media_objects_scan_claim", ["state", "next_scan_at", "scan_lease_expires_at", "created_at"])
    with op.batch_alter_table("media_scan_results") as batch_op:
        batch_op.add_column(sa.Column("engine_version", sa.String(40)))
        batch_op.add_column(sa.Column("signature_version", sa.String(40)))
        batch_op.add_column(sa.Column("signature_at", sa.DateTime()))
        batch_op.add_column(sa.Column("detail_code", sa.String(40)))
        batch_op.add_column(sa.Column("duration_ms", sa.Integer()))


def downgrade() -> None:
    with op.batch_alter_table("media_scan_results") as batch_op:
        for column in ("duration_ms", "detail_code", "signature_at", "signature_version", "engine_version"):
            batch_op.drop_column(column)
    with op.batch_alter_table("media_objects") as batch_op:
        batch_op.drop_index("ix_media_objects_scan_claim")
        for column in ("scan_lease_expires_at", "scan_lease_token", "next_scan_at", "scan_attempts"):
            batch_op.drop_column(column)
