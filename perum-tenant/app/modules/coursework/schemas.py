"""Request bodies for homework & control-work management (legacy contract)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class HomeworkCreate(BaseModel):
    class_id: int
    subject_id: int
    title: str
    description: str | None = None
    due_date: datetime | None = None


class HomeworkUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    due_date: datetime | None = None


class ControlWorkCreate(BaseModel):
    class_id: int
    subject_id: int
    work_type: str = "контрольная"
    title: str | None = None
    work_date: datetime
