from datetime import date, datetime
from typing import Literal

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


class JournalTopicArchiveOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    detail: Literal["ok"]
    is_archived: Literal[True]


class JournalTopicRestoreOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    detail: Literal["ok"]
    is_archived: Literal[False]


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


class LessonOccurrenceUpdateOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    occurrence_id: int
    status: Literal["scheduled", "cancelled", "completed"]
    lesson_date: date
    lesson_number: int = Field(ge=1, le=8)
    topic_id: int | None
    version: int = Field(ge=1)


class JournalGradeSubjectOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    name: str
    category: str


class JournalGradeStudentOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    first_name: str | None
    last_name: str | None


class JournalGradeDetailOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    version: int = Field(ge=1)
    grade_value: int | None
    points: int
    grade_type: str
    work_type_id: int | None
    weight: float
    lesson_date: date | None
    comment: str | None
    attendance_mark: str | None
    color: str | None
    created_at: datetime | None
    subject: JournalGradeSubjectOut | None
    student: JournalGradeStudentOut | None
    topic_id: int | None
    topic_name: str | None


class JournalGradeUpdateOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    version: int = Field(ge=1)
    grade_value: int | None
    points: int
    points_diff: int
    new_balance: int
    color: str | None


class JournalGradeCreateOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    grade_id: int
    grade_value: int | None
    points: int
    new_balance: int
    color: str | None
    attendance_mark: str | None
    message: str


class JournalGradeDeleteOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    message: str


class JournalGridSubjectOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    name: str
    category: str


class JournalGridGradeOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    grade_value: int | None
    points: int
    grade_type: str
    work_type_id: int | None
    weight: float
    attendance_mark: str | None
    lesson_date: date | None
    comment: str | None
    color: str | None
    topic_id: int | None
    topic_name: str | None


class JournalGridStudentOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    first_name: str | None
    last_name: str | None
    patronymic: str | None
    grades: list[JournalGridGradeOut]
    average: float | None


class JournalPeriodOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    name: str
    period_type: str
    target_grades: str | None
    academic_year_id: int
    start_date: date | None
    end_date: date | None


class JournalFinalGradeOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    student_id: int
    subject_id: int
    period_id: int | None
    grade_value: int
    grade_type: str
    comment: str | None


class JournalControlWorkOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    class_id: int
    subject_id: int
    work_type: str
    title: str | None
    work_date: datetime


class JournalHolidayPeriodOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    start_date: date
    end_date: date


class JournalLessonTemplateOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    occurrence_id: int | None
    lesson_date: date
    lesson_number: int | None
    topic_id: int | None
    work_type_id: int | None


class JournalOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    subject: JournalGridSubjectOut
    students: list[JournalGridStudentOut]
    dates: list[date]
    schedule_slots: dict[str, list[int]]
    current_period: JournalPeriodOut | None
    available_periods: list[JournalPeriodOut]
    final_grades: list[JournalFinalGradeOut]
    control_works: list[JournalControlWorkOut]
    can_set_final_grade: bool
    holiday_periods: list[JournalHolidayPeriodOut]
    readonly: bool
    subgroup_name: str | None
    lesson_templates: dict[str, JournalLessonTemplateOut]


class JournalFinalGradeSetOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: Literal[True]
    final_grade_id: int


class JournalMutationSuccessOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: Literal[True]


class JournalLessonTemplateSetOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: Literal[True]
    updated_grades: int
