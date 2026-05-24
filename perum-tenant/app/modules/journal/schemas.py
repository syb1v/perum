from pydantic import BaseModel


class AddGradeRequest(BaseModel):
    student_id: int
    subject_id: int
    class_id: int
    grade_value: int | None = None
    work_type_id: int | None = None
    grade_type: str | None = None
    attendance_mark: str | None = None
    topic_id: int | None = None
    lesson_date: str | None = None  # "YYYY-MM-DD"
    comment: str | None = None


class UpdateGradeRequest(BaseModel):
    grade_value: int | None = None
    work_type_id: int | None = None
    grade_type: str | None = None
    attendance_mark: str | None = None
    comment: str | None = None
