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
    lesson_number: int | None = None
    comment: str | None = None


class UpdateGradeRequest(BaseModel):
    version: int
    grade_value: int | None = None
    work_type_id: int | None = None
    grade_type: str | None = None
    attendance_mark: str | None = None
    topic_id: int | None = None
    comment: str | None = None


class FinalGradeRequest(BaseModel):
    student_id: int
    period_id: int | None = None
    grade_value: int
    grade_type: str = "quarter"
    comment: str | None = None


class TopicCreate(BaseModel):
    name: str


class TopicUpdate(BaseModel):
    name: str


class LessonTemplateUpdate(BaseModel):
    topic_id: int | None = None
    work_type_id: int | None = None
    lesson_number: int | None = None


class LessonOccurrenceUpdate(BaseModel):
    status: str | None = None
    topic_id: int | None = None
