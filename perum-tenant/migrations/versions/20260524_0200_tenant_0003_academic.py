"""academic core — subjects, classes, schedule, years, periods, bell schedules

Revision ID: tenant_0003_academic
Revises: tenant_0002_identity
Create Date: 2026-05-24
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "tenant_0003_academic"
down_revision: Union[str, None] = "tenant_0002_identity"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def _school_col():
    # Fresh ForeignKey per call — a ForeignKey instance binds to one column only.
    return sa.Column(
        "school_id", sa.Integer, sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=True
    )


def _created_at():
    return sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now())


def upgrade() -> None:
    op.create_table(
        "subjects",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        _school_col(),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("short_name", sa.String(20), nullable=True),
        sa.Column("category", sa.String(20), nullable=False, server_default=sa.text("'normal'")),
        sa.Column("in_exchange", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("exchange_coefficient", sa.Float, nullable=False, server_default=sa.text("1.0")),
        sa.Column("profile_weight", sa.Float, nullable=False, server_default=sa.text("1.0")),
        sa.Column("is_profile_track", sa.Boolean, nullable=False, server_default=sa.text("false")),
        _created_at(),
    )
    op.create_index("ix_subjects_school_id", "subjects", ["school_id"])

    op.create_table(
        "work_types",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        _school_col(),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("weight", sa.Float, nullable=False, server_default=sa.text("1.0")),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        _created_at(),
    )
    op.create_index("ix_work_types_school_id", "work_types", ["school_id"])

    op.create_table(
        "bell_schedules",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        _school_col(),
        sa.Column("name", sa.String(150), nullable=False),
        _created_at(),
    )
    op.create_index("ix_bell_schedules_school_id", "bell_schedules", ["school_id"])

    op.create_table(
        "bell_schedule_items",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column(
            "bell_schedule_id",
            sa.Integer,
            sa.ForeignKey("bell_schedules.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("lesson_number", sa.Integer, nullable=False),
        sa.Column("start_time", sa.String(5), nullable=True),
        sa.Column("end_time", sa.String(5), nullable=True),
        sa.Column("is_saturday", sa.Boolean, nullable=False, server_default=sa.text("false")),
    )
    op.create_index("ix_bell_schedule_items_bell_schedule_id", "bell_schedule_items", ["bell_schedule_id"])

    op.create_table(
        "classes",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        _school_col(),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("grade_level", sa.Integer, nullable=True),
        sa.Column("is_profile", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("teacher_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column(
            "bell_schedule_id",
            sa.Integer,
            sa.ForeignKey("bell_schedules.id", ondelete="SET NULL"),
            nullable=True,
        ),
        _created_at(),
    )
    op.create_index("ix_classes_school_id", "classes", ["school_id"])
    op.create_index("ix_classes_grade_level", "classes", ["grade_level"])
    op.create_index("ix_classes_teacher_id", "classes", ["teacher_id"])
    op.create_index("ix_classes_bell_schedule_id", "classes", ["bell_schedule_id"])

    op.create_table(
        "class_students",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("class_id", sa.Integer, sa.ForeignKey("classes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("student_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("added_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_class_students_class_id", "class_students", ["class_id"])
    op.create_index("ix_class_students_student_id", "class_students", ["student_id"])

    op.create_table(
        "topics",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        _school_col(),
        sa.Column("subject_id", sa.Integer, sa.ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("order_num", sa.Integer, nullable=False, server_default=sa.text("0")),
        _created_at(),
    )
    op.create_index("ix_topics_school_id", "topics", ["school_id"])
    op.create_index("ix_topics_subject_id", "topics", ["subject_id"])

    op.create_table(
        "teacher_subjects",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        _school_col(),
        sa.Column("teacher_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("subject_id", sa.Integer, sa.ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("class_id", sa.Integer, sa.ForeignKey("classes.id", ondelete="CASCADE"), nullable=False),
        _created_at(),
    )
    op.create_index("ix_teacher_subjects_school_id", "teacher_subjects", ["school_id"])
    op.create_index("ix_teacher_subjects_teacher_id", "teacher_subjects", ["teacher_id"])
    op.create_index("ix_teacher_subjects_subject_id", "teacher_subjects", ["subject_id"])
    op.create_index("ix_teacher_subjects_class_id", "teacher_subjects", ["class_id"])

    op.create_table(
        "schedules",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        _school_col(),
        sa.Column("class_id", sa.Integer, sa.ForeignKey("classes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("subject_id", sa.Integer, sa.ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("teacher_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("day_of_week", sa.Integer, nullable=False),
        sa.Column("lesson_number", sa.Integer, nullable=False),
        sa.Column("room", sa.String(20), nullable=True),
        _created_at(),
    )
    op.create_index("ix_schedules_school_id", "schedules", ["school_id"])
    op.create_index("ix_schedules_class_id", "schedules", ["class_id"])
    op.create_index("ix_schedules_subject_id", "schedules", ["subject_id"])
    op.create_index("ix_schedules_teacher_id", "schedules", ["teacher_id"])

    op.create_table(
        "lesson_groups",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        _school_col(),
        sa.Column("class_id", sa.Integer, sa.ForeignKey("classes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("day_of_week", sa.Integer, nullable=False),
        sa.Column("lesson_number", sa.Integer, nullable=False),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column("room_name", sa.String(20), nullable=True),
        sa.Column("teacher_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        _created_at(),
    )
    op.create_index("ix_lesson_groups_school_id", "lesson_groups", ["school_id"])
    op.create_index("ix_lesson_groups_class_id", "lesson_groups", ["class_id"])
    op.create_index("ix_lesson_groups_teacher_id", "lesson_groups", ["teacher_id"])

    op.create_table(
        "lesson_group_students",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("group_id", sa.Integer, sa.ForeignKey("lesson_groups.id", ondelete="CASCADE"), nullable=False),
        sa.Column("student_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("added_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_lesson_group_students_group_id", "lesson_group_students", ["group_id"])
    op.create_index("ix_lesson_group_students_student_id", "lesson_group_students", ["student_id"])

    op.create_table(
        "academic_years",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        _school_col(),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column("start_date", sa.DateTime, nullable=False),
        sa.Column("end_date", sa.DateTime, nullable=False),
        sa.Column("is_current", sa.Boolean, nullable=False, server_default=sa.text("false")),
        _created_at(),
    )
    op.create_index("ix_academic_years_school_id", "academic_years", ["school_id"])

    op.create_table(
        "school_periods",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column(
            "academic_year_id",
            sa.Integer,
            sa.ForeignKey("academic_years.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("period_type", sa.String(50), nullable=False),
        sa.Column("target_grades", sa.Text, nullable=True),
        sa.Column("start_date", sa.DateTime, nullable=False),
        sa.Column("end_date", sa.DateTime, nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        _created_at(),
    )
    op.create_index("ix_school_periods_academic_year_id", "school_periods", ["academic_year_id"])


def downgrade() -> None:
    for table in [
        "school_periods",
        "academic_years",
        "lesson_group_students",
        "lesson_groups",
        "schedules",
        "teacher_subjects",
        "topics",
        "class_students",
        "classes",
        "bell_schedule_items",
        "bell_schedules",
        "work_types",
        "subjects",
    ]:
        op.drop_table(table)
