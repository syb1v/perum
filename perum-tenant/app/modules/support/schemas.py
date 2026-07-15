from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SupportCategory = Literal["general", "technical", "account", "academic", "safety", "other"]


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
    message_id: str = Field(min_length=36, max_length=36)


class MessageOut(BaseModel):
    id: str
    sender_id: int | None
    side: str
    body: str
    created_at: datetime


class TicketOut(BaseModel):
    id: str
    correlation_id: str
    subject: str
    category: str
    status: str
    priority: str
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
