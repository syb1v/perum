from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ReplaceParentStudentsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    student_ids: list[int] = Field(max_length=100)

    @field_validator("student_ids")
    @classmethod
    def _unique_positive_ids(cls, value: list[int]) -> list[int]:
        if any(student_id <= 0 for student_id in value):
            raise ValueError("student_ids must contain positive IDs")
        if len(value) != len(set(value)):
            raise ValueError("student_ids must not contain duplicates")
        return value


class AdminParentStudentsOut(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    parent_id: int
    student_ids: list[int]
