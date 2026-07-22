from datetime import datetime

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
