from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class TeacherClassOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    name: str
    student_count: int
    created_at: datetime | None


class TeacherClassesOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    classes: list[TeacherClassOut]


class TeacherHomeworkOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    title: str
    description: str
    created_at: datetime | None
    class_name: str | None
    subject_name: str | None


class TeacherHomeworkListOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    homework: list[TeacherHomeworkOut]


class TeacherWorkOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    type: Literal["homework", "control"]
    class_id: int
    class_name: str | None
    subject_id: int
    subject_name: str | None
    title: str
    description: str | None
    due_date: str | None
    created_at: str | None


class TeacherWorksOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    works: list[TeacherWorkOut]
    has_more: bool


class TeacherDiaryHomeworkAttachmentOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    filename: str | None
    url_link: str | None


class TeacherDiaryHomeworkOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    title: str
    description: str | None
    due_date: datetime | None
    attachments: list[TeacherDiaryHomeworkAttachmentOut]


class TeacherDiaryControlWorkOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    work_type: str
    title: str


class TeacherDiaryLessonOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    lesson_number: int
    subject_id: int
    subject_name: str | None
    class_id: int
    class_name: str | None
    room: str | None
    start_time: str | None
    end_time: str | None
    homework: list[TeacherDiaryHomeworkOut]
    control_work: TeacherDiaryControlWorkOut | None
    occurrence_id: int | None
    status: Literal["scheduled", "cancelled", "completed"]
    version: int | None


class TeacherDiaryDayOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    date: date
    day_name: str
    is_today: bool
    lessons: list[TeacherDiaryLessonOut]


class TeacherDiaryOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    teacher_id: int
    teacher_name: str
    week_start: date
    week_end: date
    week_offset: int
    diary: dict[str, TeacherDiaryDayOut]


class TeacherHomeroomClassOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    name: str
    grade_level: int | None
    is_profile: int


class TeacherHomeroomStudentOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    login: str
    first_name: str | None
    last_name: str | None
    patronymic: str | None
    balance: int
    is_online: bool
    enrollment_status: Literal["active"]


class TeacherHomeroomStatsOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    student_count: int
    avg_balance: float
    total_grades: int
    avg_grade: float


class TeacherHomeroomOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    has_class: bool
    class_: TeacherHomeroomClassOut | None = Field(alias="class", serialization_alias="class")
    students: list[TeacherHomeroomStudentOut]
    stats: TeacherHomeroomStatsOut


class TeacherBulkBalanceOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str
