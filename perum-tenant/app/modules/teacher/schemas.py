from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


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
