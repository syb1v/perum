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
