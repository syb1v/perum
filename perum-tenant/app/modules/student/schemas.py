from datetime import date, datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, RootModel, field_validator


class GradeSummarySubjectOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    subject_id: int
    subject_name: str
    average: float
    count: int
    points: int


class GradesSummaryOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    subjects: list[GradeSummarySubjectOut]
    total_points: int
    total_grades: int


class StudentRecentTransactionOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    type: str
    amount: int
    balance_after: int
    reason: str | None
    created_at: datetime

    @field_validator("created_at")
    @classmethod
    def normalize_created_at(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


class StudentRecentTransactionsOut(RootModel[list[StudentRecentTransactionOut]]):
    root: list[StudentRecentTransactionOut] = Field(max_length=50)


class GradeAnalyticsPeriodOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    name: str
    start_date: datetime
    end_date: datetime


class GradeAnalyticsSubjectOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    subject_id: int
    subject_name: str
    periods: dict[str, float | None]
    year_average: float


class GradesAnalyticsOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    period_type: Literal["quarter", "half_year"]
    current_period: int | None
    periods: list[GradeAnalyticsPeriodOut]
    subjects: list[GradeAnalyticsSubjectOut]


class StudentDiaryGradeOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    value: int | None
    points: int
    weight: float
    type: str
    comment: str | None
    color: str | None
    topic: str | None


class StudentDiaryHomeworkAttachmentOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    filename: str | None
    url_link: str | None


class StudentDiaryHomeworkStateOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["not_started", "in_progress", "completed"]
    version: int
    completed_at: datetime | None


class StudentDiaryHomeworkOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    title: str
    description: str | None
    due_date: datetime | None
    deadline_at: datetime | None
    is_overdue: bool
    student_state: StudentDiaryHomeworkStateOut
    attachments: list[StudentDiaryHomeworkAttachmentOut]


class StudentDiaryControlWorkOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    work_type: str
    title: str | None


class StudentDiaryLessonOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    lesson_number: int
    subject_id: int
    subject_name: str | None
    teacher_name: str | None
    start_time: str
    end_time: str
    room: str | None
    grades: list[StudentDiaryGradeOut]
    homework: list[StudentDiaryHomeworkOut]
    control_work: StudentDiaryControlWorkOut | None
    occurrence_id: int | None
    status: Literal["scheduled", "cancelled", "completed"]
    group_name: str | None = None


class StudentDiaryDayOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    date: date
    day_name: str
    is_today: bool
    lessons: list[StudentDiaryLessonOut]


class StudentDiaryPeriodOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    name: str
    period_type: str
    start_date: datetime
    end_date: datetime


class StudentDiaryOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    class_id: int | None
    class_name: str | None
    week_start: date
    week_end: date
    week_offset: int
    current_period: StudentDiaryPeriodOut | None
    week_periods: list[StudentDiaryPeriodOut]
    diary: dict[str, StudentDiaryDayOut]


class StudentGradeOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    value: int | None
    points: int
    weight: float
    date: date | None
    type: str
    comment: str | None
    subject_id: int
    subject_name: str
    color: str | None
    topic: str | None


class StudentGradesOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    grades: list[StudentGradeOut]


class StudentFinalGradeOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    subject_id: int
    subject_name: str
    period_id: int | None
    period_name: str | None
    grade_value: int
    grade_type: str
    comment: str | None
    color: str | None


class StudentFinalGradesOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    final_grades: list[StudentFinalGradeOut]


class StudentQuestOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int | None
    quest_id: int
    title: str
    description: str | None
    reward: int
    progress: int
    target: int
    status: Literal["active", "available", "completed", "ready"]
    reward_claimed: bool
