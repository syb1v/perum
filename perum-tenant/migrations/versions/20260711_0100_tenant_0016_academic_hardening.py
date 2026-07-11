"""academic integrity hardening

Revision ID: tenant_0016_academic_hardening
Revises: tenant_0015_final_grade_unique
Create Date: 2026-07-11
"""

from typing import Sequence, Union

from alembic import op

revision: str = "tenant_0016_academic_hardening"
down_revision: Union[str, None] = "tenant_0015_final_grade_unique"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for table, columns, comparison in (
        ("lesson_group_students", ("group_id", "student_id"), ">"),
        ("teacher_subjects", ("school_id", "teacher_id", "subject_id", "class_id"), ">"),
        ("schedules", ("class_id", "day_of_week", "lesson_number"), "<"),
        ("class_students", ("student_id",), "<"),
    ):
        matches = " AND ".join(f"duplicate.{column} = {table}.{column}" for column in columns)
        op.execute(
            f"DELETE FROM {table} WHERE EXISTS (SELECT 1 FROM {table} AS duplicate "
            f"WHERE {matches} AND {table}.id {comparison} duplicate.id)"
        )

    constraints = {
        "lesson_group_students": (("uq_lesson_group_student", ("group_id", "student_id")),),
        "teacher_subjects": (("uq_teacher_subject_scope", ("school_id", "teacher_id", "subject_id", "class_id")),),
        "schedules": (
            ("uq_schedule_class_slot", ("class_id", "day_of_week", "lesson_number")),
            ("ck_schedule_day", "day_of_week BETWEEN 0 AND 5"),
            ("ck_schedule_lesson", "lesson_number BETWEEN 1 AND 8"),
        ),
        "class_students": (("uq_class_students_student", ("student_id",)),),
        "lesson_groups": (
            ("ck_lesson_group_day", "day_of_week BETWEEN 0 AND 5"),
            ("ck_lesson_group_lesson", "lesson_number BETWEEN 1 AND 8"),
        ),
        "academic_years": (("ck_academic_year_dates", "start_date <= end_date"),),
        "school_periods": (("ck_school_period_dates", "start_date <= end_date"),),
    }
    for table, table_constraints in constraints.items():
        with op.batch_alter_table(table) as batch_op:
            for name, definition in table_constraints:
                if isinstance(definition, tuple):
                    batch_op.create_unique_constraint(name, list(definition))
                else:
                    batch_op.create_check_constraint(name, definition)


def downgrade() -> None:
    constraints = {
        "school_periods": (("ck_school_period_dates", "check"),),
        "academic_years": (("ck_academic_year_dates", "check"),),
        "lesson_groups": (("ck_lesson_group_lesson", "check"), ("ck_lesson_group_day", "check")),
        "schedules": (("ck_schedule_lesson", "check"), ("ck_schedule_day", "check"), ("uq_schedule_class_slot", "unique")),
        "class_students": (("uq_class_students_student", "unique"),),
        "teacher_subjects": (("uq_teacher_subject_scope", "unique"),),
        "lesson_group_students": (("uq_lesson_group_student", "unique"),),
    }
    for table, table_constraints in constraints.items():
        with op.batch_alter_table(table) as batch_op:
            for name, constraint_type in table_constraints:
                batch_op.drop_constraint(name, type_=constraint_type)
