"""Request bodies for homework & control-work management (legacy contract)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class HomeworkCreate(BaseModel):
    class_id: int
    subject_id: int
    title: str
    description: str | None = None
    due_date: datetime | None = None
    lesson_number: int | None = None
    assigned_occurrence_id: int | None = Field(default=None, ge=1)
    target_occurrence_id: int | None = Field(default=None, ge=1)
    published_at: datetime | None = None
    deadline_at: datetime | None = None

    @model_validator(mode="after")
    def validate_semantics(self):
        if self.deadline_at is not None and self.deadline_at.tzinfo is None:
            raise ValueError("deadline_at must include timezone")
        if self.published_at is not None and self.published_at.tzinfo is None:
            raise ValueError("published_at must include timezone")
        if self.deadline_at is not None and self.target_occurrence_id is None:
            raise ValueError("target_occurrence_id is required with deadline_at")
        return self


class HomeworkUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    due_date: datetime | None = None
    assigned_occurrence_id: int | None = Field(default=None, ge=1)
    target_occurrence_id: int | None = Field(default=None, ge=1)
    published_at: datetime | None = None
    deadline_at: datetime | None = None

    @model_validator(mode="after")
    def validate_semantics(self):
        for field_name in ("published_at", "deadline_at"):
            value = getattr(self, field_name)
            if value is not None and value.tzinfo is None:
                raise ValueError(f"{field_name} must include timezone")
        return self


class HomeworkStateUpdate(BaseModel):
    client_action_id: str = Field(min_length=1, max_length=64)
    version: int = Field(ge=0)
    status: str = Field(pattern=r"^(not_started|in_progress|completed)$")


class HomeworkStudentStateOut(BaseModel):
    status: Literal["not_started", "in_progress", "completed"]
    version: int
    completed_at: datetime | None


class HomeworkAttachmentOut(BaseModel):
    id: int
    filename: str | None
    url_link: str | None


class HomeworkOut(BaseModel):
    id: int
    class_id: int
    class_name: str | None
    subject_id: int
    subject_name: str | None
    title: str
    description: str | None
    due_date: datetime | None
    assigned_occurrence_id: int | None
    target_occurrence_id: int | None
    published_at: datetime | None
    deadline_at: datetime | None
    is_overdue: bool
    student_state: HomeworkStudentStateOut | None
    created_at: datetime | None
    attachments: list[HomeworkAttachmentOut]


class HomeworkListOut(BaseModel):
    homework: list[HomeworkOut]


class HomeworkStateOut(HomeworkStudentStateOut):
    homework_id: int
    replayed: bool


class ControlWorkCreate(BaseModel):
    class_id: int
    subject_id: int
    work_type: str = "контрольная"
    title: str | None = None
    work_date: datetime
    lesson_number: int | None = None
