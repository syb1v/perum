from typing import Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class TenantCompatibility(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    mobile_api_version: int
    minimum_mobile_api_version: int
    minimum_app_version: str


class TenantCapabilities(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    refresh_sessions: bool
    session_management: bool
    push_registration: bool
    push_delivery: bool
    social_friends: bool
    social_messages: bool
    social_realtime: bool
    social_attachments: bool
    support_requester: bool
    support_admin: bool
    support_attachments: bool
    offline_preferences: bool
    student_academics: bool
    student_analytics: bool
    parent_academics: bool
    parent_analytics: bool
    teacher_diary: bool
    teacher_homeroom: bool
    teacher_works: bool
    teacher_analytics: bool
    school_admin_overview: bool
    school_admin_social_moderation: bool
    school_admin_academic_calendar: bool
    school_admin_class_directory: bool
    offline_homework_state: bool
    offline_social_messages: bool
    offline_support_messages: bool
    offline_read_cursors: bool
    offline_social_read_cursors: bool
    offline_support_ticket_creation: bool


class TenantDiscoveryRequest(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    host: str | None = Field(default=None, min_length=1, max_length=2048)
    organization_domain: str | None = Field(default=None, min_length=1, max_length=255)
    school_code: str | None = Field(default=None, min_length=1, max_length=63)
    school_public_id: UUID | None = None

    @model_validator(mode="after")
    def validate_selector(self) -> Self:
        host_selector = self.host is not None
        pair_selector = self.organization_domain is not None and self.school_code is not None
        partial_pair = (self.organization_domain is None) != (self.school_code is None)
        if partial_pair or sum((host_selector, pair_selector, self.school_public_id is not None)) != 1:
            raise ValueError("Provide exactly one tenant selector")
        return self


class TenantDiscoveryResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    tenant_id: UUID
    organization_id: UUID
    school_id: UUID
    organization_name: str
    school_name: str
    canonical_host: str
    primary_host: str
    matched_host: str
    api_base_url: str
    web_base_url: str
    descriptor_revision: str
    cache_ttl_seconds: int = Field(gt=0)
    schema_version: Literal[1]
    compatibility: TenantCompatibility
    capabilities: TenantCapabilities
