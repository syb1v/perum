"""lesson occurrence optimistic lock

Revision ID: tenant_0029_lesson_occurrence_version
Revises: tenant_0028_grade_optimistic_lock
"""
from alembic import op
import sqlalchemy as sa

revision = "tenant_0029_lesson_occurrence_version"
down_revision = "tenant_0028_grade_optimistic_lock"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "lesson_occurrences",
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
    )
    with op.batch_alter_table("lesson_occurrences") as batch_op:
        batch_op.create_check_constraint("ck_lesson_occurrence_version", "version > 0")


def downgrade() -> None:
    with op.batch_alter_table("lesson_occurrences") as batch_op:
        batch_op.drop_constraint("ck_lesson_occurrence_version", type_="check")
    op.drop_column("lesson_occurrences", "version")
