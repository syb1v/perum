"""Social rollout, shutdown retention and privacy-safe audit."""

from alembic import op
import sqlalchemy as sa


revision = "tenant_0036_social_hardening"
down_revision = "tenant_0035_social_read_receipts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("school_social_settings") as batch_op:
        batch_op.add_column(sa.Column("disabled_at", sa.DateTime()))
        batch_op.add_column(sa.Column("history_deletes_at", sa.DateTime()))
        batch_op.create_index("ix_school_social_settings_history_deletes_at", ["history_deletes_at"])
    op.create_table(
        "social_audit_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("school_id", sa.Integer(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event_type", sa.String(40), nullable=False),
        sa.Column("actor_role", sa.String(20), nullable=False),
        sa.Column("outcome", sa.String(20), nullable=False, server_default="accepted"),
        sa.Column("details", sa.JSON()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_social_audit_school_created", "social_audit_events", ["school_id", "created_at"])


def downgrade() -> None:
    op.drop_table("social_audit_events")
    with op.batch_alter_table("school_social_settings") as batch_op:
        batch_op.drop_index("ix_school_social_settings_history_deletes_at")
        batch_op.drop_column("history_deletes_at")
        batch_op.drop_column("disabled_at")
