"""lesson occurrences backwards-compatible layer

Revision ID: tenant_0017_lesson_occurrences
Revises: tenant_0016_academic_hardening
"""
from alembic import op
import sqlalchemy as sa

revision = "tenant_0017_lesson_occurrences"
down_revision = "tenant_0016_academic_hardening"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "lesson_occurrences",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("school_id", sa.Integer(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("class_id", sa.Integer(), sa.ForeignKey("classes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("subject_id", sa.Integer(), sa.ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("schedule_id", sa.Integer(), sa.ForeignKey("schedules.id", ondelete="SET NULL"), nullable=True),
        sa.Column("lesson_date", sa.Date(), nullable=False),
        sa.Column("lesson_number", sa.Integer(), nullable=False),
        sa.Column("teacher_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", sa.String(20), server_default="scheduled", nullable=False),
        sa.Column("topic_id", sa.Integer(), sa.ForeignKey("topics.id", ondelete="SET NULL"), nullable=True),
        sa.Column("work_type_id", sa.Integer(), sa.ForeignKey("work_types.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("school_id", "class_id", "lesson_date", "lesson_number", name="uq_lesson_occurrence_slot"),
        sa.CheckConstraint("lesson_number BETWEEN 1 AND 8", name="ck_lesson_occurrence_number"),
        sa.CheckConstraint("status IN ('scheduled', 'cancelled', 'completed')", name="ck_lesson_occurrence_status"),
    )
    for table in ("grades", "homework", "control_works", "lesson_templates"):
        with op.batch_alter_table(table) as batch_op:
            batch_op.add_column(sa.Column("occurrence_id", sa.Integer(), nullable=True))
            batch_op.create_foreign_key(f"fk_{table}_occurrence", "lesson_occurrences", ["occurrence_id"], ["id"], ondelete="SET NULL")
        op.create_index(f"ix_{table}_occurrence_id", table, ["occurrence_id"])
    with op.batch_alter_table("lesson_templates") as batch_op:
        batch_op.drop_constraint("uq_lesson_template", type_="unique")
        batch_op.create_unique_constraint("uq_lesson_template_occurrence", ["occurrence_id"])
    op.create_index(
        "uq_lesson_template_legacy", "lesson_templates",
        ["class_id", "subject_id", "lesson_date"], unique=True,
        postgresql_where=sa.text("occurrence_id IS NULL"),
        sqlite_where=sa.text("occurrence_id IS NULL"),
    )
    op.create_index(
        "uq_final_grade_without_period", "final_grades",
        ["school_id", "student_id", "subject_id", "class_id"], unique=True,
        postgresql_where=sa.text("period_id IS NULL"),
        sqlite_where=sa.text("period_id IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_final_grade_without_period", table_name="final_grades")
    op.drop_index("uq_lesson_template_legacy", table_name="lesson_templates")
    with op.batch_alter_table("lesson_templates") as batch_op:
        batch_op.drop_constraint("uq_lesson_template_occurrence", type_="unique")
        batch_op.create_unique_constraint("uq_lesson_template", ["class_id", "subject_id", "lesson_date"])
    for table in ("lesson_templates", "control_works", "homework", "grades"):
        op.drop_index(f"ix_{table}_occurrence_id", table_name=table)
        with op.batch_alter_table(table) as batch_op:
            batch_op.drop_constraint(f"fk_{table}_occurrence", type_="foreignkey")
            batch_op.drop_column("occurrence_id")
    op.drop_table("lesson_occurrences")
