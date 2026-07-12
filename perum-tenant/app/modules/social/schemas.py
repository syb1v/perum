from datetime import datetime, time
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class SettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    social_enabled: bool
    friend_scope: Literal["classmates", "school"]
    social_min_grade: int | None
    social_max_grade: int | None
    parent_chat_visibility: Literal["disabled", "metadata", "full"]
    message_retention_days: int
    message_links_allowed: bool
    message_attachments_enabled: bool
    social_quiet_hours_start: time | None
    social_quiet_hours_end: time | None
    social_moderation_enabled: bool


class SettingsPatch(BaseModel):
    social_enabled: bool | None = None
    friend_scope: Literal["classmates", "school"] | None = None
    social_min_grade: int | None = Field(None, ge=1, le=11)
    social_max_grade: int | None = Field(None, ge=1, le=11)
    parent_chat_visibility: Literal["disabled", "metadata", "full"] | None = None
    message_retention_days: int | None = Field(None, ge=30, le=3650)
    message_attachments_enabled: bool | None = None
    social_quiet_hours_start: time | None = None
    social_quiet_hours_end: time | None = None

    @model_validator(mode="after")
    def validate_range(self):
        if self.social_min_grade is not None and self.social_max_grade is not None and self.social_min_grade > self.social_max_grade:
            raise ValueError("social_min_grade must not exceed social_max_grade")
        return self


class StudentProfile(BaseModel):
    id: int
    name: str
    avatar: str | None
    class_name: str


class StudentPage(BaseModel):
    items: list[StudentProfile]
    next_cursor: int | None


class FriendRequestCreate(BaseModel):
    student_id: int
    client_request_id: str = Field(min_length=1, max_length=64)


class FriendRequestOut(BaseModel):
    id: int
    status: str
    student: StudentProfile
    created_at: datetime
    expires_at: datetime


class BlockCreate(BaseModel):
    student_id: int
    reason_code: str | None = Field(None, max_length=50)


class BlockOut(BaseModel):
    id: int
    student: StudentProfile
    reason_code: str | None
    created_at: datetime
