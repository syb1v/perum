from datetime import datetime

from pydantic import BaseModel


class NotificationOut(BaseModel):
    id: int
    title: str
    text: str
    type: str
    ref_type: str | None
    ref_id: str | None
    is_read: bool
    created_at: datetime | None


class NotificationListOut(BaseModel):
    success: bool
    notifications: list[NotificationOut]
    unread_count: int


class SuccessOut(BaseModel):
    success: bool
