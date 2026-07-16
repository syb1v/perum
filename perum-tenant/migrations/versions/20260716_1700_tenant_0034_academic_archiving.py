"""archive subjects and topics

Revision ID: tenant_0034_academic_archiving
Revises: tenant_0033_homework_state_receipts
"""
from alembic import op
import sqlalchemy as sa

revision = "tenant_0034_academic_archiving"
down_revision = "tenant_0033_homework_state_receipts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table in ("subjects", "topics"):
        op.add_column(table, sa.Column("is_archived", sa.Boolean(), nullable=False, server_default=sa.false()))
        op.add_column(table, sa.Column("archived_at", sa.DateTime(), nullable=True))
        op.add_column(table, sa.Column("archived_by", sa.Integer(), nullable=True))
        with op.batch_alter_table(table) as batch_op:
            batch_op.create_foreign_key(f"fk_{table}_archived_by", "users", ["archived_by"], ["id"], ondelete="SET NULL")
    op.create_index("ix_subjects_school_archived", "subjects", ["school_id", "is_archived"])
    op.create_index("ix_topics_subject_archived", "topics", ["subject_id", "is_archived"])


def downgrade() -> None:
    op.drop_index("ix_topics_subject_archived", table_name="topics")
    op.drop_index("ix_subjects_school_archived", table_name="subjects")
    for table in ("topics", "subjects"):
        with op.batch_alter_table(table) as batch_op:
            batch_op.drop_constraint(f"fk_{table}_archived_by", type_="foreignkey")
        op.drop_column(table, "archived_by")
        op.drop_column(table, "archived_at")
        op.drop_column(table, "is_archived")
