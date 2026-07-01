"""journal / grades — grades, final_grades, transactions, homework, control_works

Revision ID: tenant_0004_journal
Revises: tenant_0003_academic
Create Date: 2026-05-24
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "tenant_0004_journal"
down_revision: Union[str, None] = "tenant_0003_academic"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _school_col():
    return sa.Column(
        "school_id", sa.Integer, sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=True
    )


def upgrade() -> None:
    op.create_table(
        "grades",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        _school_col(),
        sa.Column("student_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("teacher_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("class_id", sa.Integer, sa.ForeignKey("classes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("subject_id", sa.Integer, sa.ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("topic_id", sa.Integer, sa.ForeignKey("topics.id", ondelete="SET NULL"), nullable=True),
        sa.Column("work_type_id", sa.Integer, sa.ForeignKey("work_types.id", ondelete="SET NULL"), nullable=True),
        sa.Column("grade_value", sa.Integer, nullable=True),
        sa.Column("weight", sa.Float, nullable=False, server_default=sa.text("1.0")),
        sa.Column("value", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("attendance_mark", sa.String(10), nullable=True),
        sa.Column("comment", sa.Text, nullable=True),
        sa.Column("lesson_date", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    for col in ("school_id", "student_id", "teacher_id", "class_id", "subject_id"):
        op.create_index(f"ix_grades_{col}", "grades", [col])

    op.create_table(
        "final_grades",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        _school_col(),
        sa.Column("student_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("subject_id", sa.Integer, sa.ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("class_id", sa.Integer, sa.ForeignKey("classes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("teacher_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("period_id", sa.Integer, sa.ForeignKey("school_periods.id", ondelete="SET NULL"), nullable=True),
        sa.Column("grade_value", sa.Integer, nullable=False),
        sa.Column("grade_type", sa.String(20), nullable=False, server_default=sa.text("'quarter'")),
        sa.Column("comment", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, nullable=True),
    )
    op.create_index("ix_final_grades_student_id", "final_grades", ["student_id"])
    op.create_index("ix_final_grades_subject_id", "final_grades", ["subject_id"])
    op.create_index("ix_final_grades_class_id", "final_grades", ["class_id"])
    op.create_index("ix_final_grades_period_id", "final_grades", ["period_id"])

    op.create_table(
        "transactions",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        _school_col(),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("amount", sa.Integer, nullable=False),
        sa.Column("balance_after", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("type", sa.String(30), nullable=False),
        sa.Column("reason", sa.String(255), nullable=True),
        sa.Column("related_id", sa.Integer, nullable=True),
        sa.Column("created_by", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_transactions_school_id", "transactions", ["school_id"])
    op.create_index("ix_transactions_user_id", "transactions", ["user_id"])

    op.create_table(
        "homework",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        _school_col(),
        sa.Column("class_id", sa.Integer, sa.ForeignKey("classes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("subject_id", sa.Integer, sa.ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("teacher_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("due_date", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_homework_school_id", "homework", ["school_id"])
    op.create_index("ix_homework_class_id", "homework", ["class_id"])
    op.create_index("ix_homework_subject_id", "homework", ["subject_id"])

    op.create_table(
        "homework_attachments",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("homework_id", sa.Integer, sa.ForeignKey("homework.id", ondelete="CASCADE"), nullable=False),
        sa.Column("file_path", sa.String(500), nullable=True),
        sa.Column("filename", sa.String(255), nullable=True),
        sa.Column("url_link", sa.String(1000), nullable=True),
        sa.Column("expires_at", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_homework_attachments_homework_id", "homework_attachments", ["homework_id"])

    op.create_table(
        "control_works",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        _school_col(),
        sa.Column("class_id", sa.Integer, sa.ForeignKey("classes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("subject_id", sa.Integer, sa.ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("teacher_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("work_type", sa.String(30), nullable=False, server_default=sa.text("'контрольная'")),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("work_date", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_control_works_school_id", "control_works", ["school_id"])
    op.create_index("ix_control_works_class_id", "control_works", ["class_id"])


def downgrade() -> None:
    for table in [
        "control_works",
        "homework_attachments",
        "homework",
        "transactions",
        "final_grades",
        "grades",
    ]:
        op.drop_table(table)
