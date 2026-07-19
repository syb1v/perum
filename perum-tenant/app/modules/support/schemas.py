from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SupportCategory = Literal["general", "technical", "account", "academic", "safety", "other"]
SupportStatus = Literal["open", "in_progress", "waiting_requester", "resolved", "closed"]
SupportPriority = Literal["low", "normal", "high", "urgent"]
EscalationStatus = Literal["none", "pending_delivery", "pending_org_approval", "approved", "rejected", "delivery_error"]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class TicketCreate(StrictModel):
    client_ticket_id: str = Field(min_length=1, max_length=64)
    client_message_id: str = Field(min_length=1, max_length=64)
    subject: str = Field(min_length=2, max_length=200)
    category: SupportCategory
    body: str = Field(min_length=1, max_length=4000)


class MessageCreate(StrictModel):
    client_message_id: str = Field(min_length=1, max_length=64)
    body: str = Field(min_length=1, max_length=4000)


class ReadCreate(StrictModel):
    client_action_id: str | None = Field(default=None, min_length=1, max_length=64)
    message_id: str = Field(min_length=36, max_length=36)


class TicketPatch(StrictModel):
    client_action_id: str = Field(min_length=1, max_length=64)
    expected_version: int = Field(ge=1)
    status: SupportStatus | None = None
    category: SupportCategory | None = None
    priority: SupportPriority | None = None


class AssignCreate(StrictModel):
    client_action_id: str = Field(min_length=1, max_length=64)
    expected_version: int = Field(ge=1)
    assignee_id: int | None = None


class EscalateCreate(StrictModel):
    client_action_id: str = Field(min_length=1, max_length=64)
    expected_version: int = Field(ge=1)
    redacted_summary: str = Field(min_length=1, max_length=4000)


class MessageOut(BaseModel):
    id: str
    sender_id: int | None
    side: str
    body: str
    sender_snapshot: str | None = None
    created_at: datetime


class TicketOut(BaseModel):
    id: str
    correlation_id: str
    subject: str
    category: str
    status: str
    priority: str
    assignee_id: int | None
    escalation_status: EscalationStatus
    version: int
    last_message_at: datetime | None
    unread: bool
    created_at: datetime
    updated_at: datetime


class TicketPage(BaseModel):
    items: list[TicketOut]
    next_cursor: str | None = None


class MessagePage(BaseModel):
    items: list[MessageOut]
    next_cursor: str | None = None


class TicketCreateOut(BaseModel):
    ticket: TicketOut
    initial_message: MessageOut
    replayed: bool


class UnreadOut(BaseModel):
    tickets: int
    messages: int


class AdminUnreadOut(UnreadOut):
    unassigned: int
    urgent: int


class AssigneeOut(BaseModel):
    id: int
    name: str
    role: str


class EventOut(BaseModel):
    id: str
    action: str
    actor_id: int | None
    metadata: dict | list | None
    created_at: datetime


class EventPage(BaseModel):
    items: list[EventOut]
    next_cursor: str | None = None


class EscalationDeliveryOut(BaseModel):
    state: Literal["pending", "retrying", "delivered"]
    attempts: int
    created_at: datetime
    updated_at: datetime
    next_attempt_at: datetime | None
    delivered_at: datetime | None
    pending_age_seconds: int | None
    delivery_latency_seconds: int | None
    sla_seconds: int
    sla_breached: bool
