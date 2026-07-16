"""homework semantics and per-student state

Revision ID: tenant_0032_homework_semantics
Revises: tenant_0031_support_admin_inbox
"""
from alembic import op
import sqlalchemy as sa

revision = "tenant_0032_homework_semantics"
down_revision = "tenant_0031_support_admin_inbox"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("homework", sa.Column("assigned_occurrence_id", sa.Integer(), nullable=True))
    op.add_column("homework", sa.Column("target_occurrence_id", sa.Integer(), nullable=True))
    op.add_column("homework", sa.Column("published_at", sa.DateTime(), nullable=True))
    op.add_column("homework", sa.Column("deadline_at", sa.DateTime(), nullable=True))
    op.create_index("ix_homework_assigned_occurrence_id", "homework", ["assigned_occurrence_id"])
    op.create_index("ix_homework_target_occurrence_id", "homework", ["target_occurrence_id"])
    with op.batch_alter_table("homework") as batch_op:
        batch_op.create_foreign_key("fk_homework_assigned_occurrence", "lesson_occurrences", ["assigned_occurrence_id"], ["id"], ondelete="SET NULL")
        batch_op.create_foreign_key("fk_homework_target_occurrence", "lesson_occurrences", ["target_occurrence_id"], ["id"], ondelete="SET NULL")
    op.create_table(
        "homework_student_states",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("school_id", sa.Integer(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("homework_id", sa.Integer(), sa.ForeignKey("homework.id", ondelete="CASCADE"), nullable=False),
        sa.Column("student_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="not_started"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("homework_id", "student_id", name="uq_homework_student_state"),
        sa.CheckConstraint("status IN ('not_started', 'in_progress', 'completed')", name="ck_homework_student_state_status"),
        sa.CheckConstraint("version > 0", name="ck_homework_student_state_version"),
    )
    op.create_index("ix_homework_student_states_school_id", "homework_student_states", ["school_id"])
    op.create_index("ix_homework_student_states_homework_id", "homework_student_states", ["homework_id"])
    op.create_index("ix_homework_student_states_student_id", "homework_student_states", ["student_id"])


def downgrade() -> None:
    op.drop_table("homework_student_states")
    with op.batch_alter_table("homework") as batch_op:
        batch_op.drop_constraint("fk_homework_target_occurrence", type_="foreignkey")
        batch_op.drop_constraint("fk_homework_assigned_occurrence", type_="foreignkey")
    op.drop_index("ix_homework_target_occurrence_id", table_name="homework")
    op.drop_index("ix_homework_assigned_occurrence_id", table_name="homework")
    op.drop_column("homework", "deadline_at")
    op.drop_column("homework", "published_at")
    op.drop_column("homework", "target_occurrence_id")
    op.drop_column("homework", "assigned_occurrence_id")
