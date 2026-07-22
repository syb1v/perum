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
    operator_available: bool
    history_mode: Literal["active", "read_only"]
    disabled_at: datetime | None
    history_deletes_at: datetime | None


class RealtimeTicketOut(BaseModel):
    ticket: str
    expires_at: datetime
    websocket_path: str


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


class ConversationCreate(BaseModel):
    student_id: int


class MessageCreate(BaseModel):
    client_message_id: str = Field(min_length=1, max_length=64)
    body: str = Field(min_length=1, max_length=4000)


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    sender_id: int
    client_message_id: str
    body: str | None
    created_at: datetime
    expires_at: datetime


class MessagePage(BaseModel):
    items: list[MessageOut]
    next_cursor: int | None


class ConversationOut(BaseModel):
    id: int
    peer: StudentProfile
    last_message: MessageOut | None
    unread_count: int
    can_send: bool
    disabled_reason: Literal["unavailable", "school_disabled"] | None
    history_deletes_at: datetime | None
    created_at: datetime


class ConversationPage(BaseModel):
    items: list[ConversationOut]
    next_cursor: int | None


class ReadCreate(BaseModel):
    message_id: int
    client_action_id: str | None = Field(None, min_length=1, max_length=64)


class UnreadCountOut(BaseModel):
    unread_count: int


class ReportCreate(BaseModel):
    message_id: int
    category: Literal["harassment", "bullying", "threats", "hate", "sexual", "spam", "other"]
    comment: str | None = Field(None, max_length=1000)
    client_report_id: str = Field(min_length=1, max_length=64)


class ReportOut(BaseModel):
    id: int
    message_id: int
    category: str
    created_at: datetime


class ModerationActionCreate(BaseModel):
    action: Literal["dismiss", "hide_reported_message", "lock_conversation", "unlock_conversation"]
    reason: str = Field(min_length=1, max_length=1000)
    client_action_id: str = Field(min_length=1, max_length=64)
    expected_version: int = Field(ge=1)


class ModerationCaseSummaryOut(BaseModel):
    id: int
    status: str
    version: int
    created_at: datetime
    updated_at: datetime


class ModerationCasePageOut(BaseModel):
    items: list[ModerationCaseSummaryOut]
    next_cursor: int | None


class ModerationEvidenceOut(BaseModel):
    message_id: int
    sender: Literal["reported"]
    body: str | None
    created_at: datetime


class ModerationCaseDetailOut(BaseModel):
    id: int
    status: str
    version: int
    category: str
    comment: str | None
    created_at: datetime
    evidence: list[ModerationEvidenceOut]
    other_participant: str


class ModerationActionOut(BaseModel):
    id: int
    status: str
    version: int
    updated_at: datetime
