"""Versioned mobile descriptor contracts published with tenant releases."""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, field_validator, model_validator


_SEMVER_RE = re.compile(
    r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)"
    r"(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?"
    r"(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$"
)


class MobileCompatibilityV1(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    mobile_api_version: StrictInt = Field(ge=1)
    minimum_mobile_api_version: StrictInt = Field(ge=1)
    minimum_app_version: str

    @field_validator("minimum_app_version")
    @classmethod
    def validate_minimum_app_version(cls, value: str) -> str:
        if not _SEMVER_RE.fullmatch(value):
            raise ValueError("must be a valid SemVer version")
        return value

    @model_validator(mode="after")
    def validate_api_range(self) -> "MobileCompatibilityV1":
        if self.minimum_mobile_api_version > self.mobile_api_version:
            raise ValueError("minimum_mobile_api_version cannot exceed mobile_api_version")
        return self


class MobileBuildCapabilitiesV1(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    refresh_sessions: StrictBool
    session_management: StrictBool
    push_registration: StrictBool
    push_delivery: StrictBool
    social_friends: StrictBool
    social_messages: StrictBool
    social_realtime: StrictBool
    social_attachments: StrictBool
    support_requester: StrictBool
    support_admin: StrictBool
    support_attachments: StrictBool
    offline_preferences: StrictBool
    student_academics: StrictBool
    student_analytics: StrictBool
    parent_academics: StrictBool
    parent_analytics: StrictBool
    teacher_diary: StrictBool
    teacher_homeroom: StrictBool
    teacher_works: StrictBool
    teacher_analytics: StrictBool
    school_admin_overview: StrictBool
    school_admin_social_moderation: StrictBool
    school_admin_academic_calendar: StrictBool
    offline_homework_state: StrictBool
    offline_social_messages: StrictBool
    offline_support_messages: StrictBool
    offline_read_cursors: StrictBool
    offline_social_read_cursors: StrictBool
    offline_support_ticket_creation: StrictBool


class MobileReleaseManifestV1(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    schema_version: Literal[1]
    compatibility: MobileCompatibilityV1
    capabilities: MobileBuildCapabilitiesV1
