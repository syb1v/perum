from datetime import date

from pydantic import BaseModel, ConfigDict, Field


class JournalWorkTypeOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    name: str
    weight: float


class JournalWorkTypesOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    work_types: list[JournalWorkTypeOut]


class JournalTeacherSubjectOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    name: str
    short_name: str | None
    category: str


class JournalTeacherClassOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    name: str
    grade_level: int | None
    subjects: list[JournalTeacherSubjectOut]


class JournalTeacherSubjectsOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    classes: list[JournalTeacherClassOut]


class JournalTopicOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    name: str
    order_num: int


class JournalTopicsOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    topics: list[JournalTopicOut]


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
    model_config = ConfigDict(extra="forbid")

    name: str


class TopicUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str


class LessonTemplateUpdate(BaseModel):
    topic_id: int | None = None
    work_type_id: int | None = None
    lesson_number: int | None = None


class LessonOccurrenceUpdate(BaseModel):
    version: int = Field(ge=1)
    status: str | None = None
    topic_id: int | None = None
    lesson_date: date | None = None
    lesson_number: int | None = Field(default=None, ge=1, le=8)
