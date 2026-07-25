from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, field_validator, model_validator

from app.modules.media.scanner import ClamAVScanner, scanner_runtime
from app.modules.push.service import capability as push_capability
from app.core.config import get_settings


_SEMVER_PATTERN = (
    r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)"
    r"(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?"
    r"(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$"
)
DESCRIPTOR_PATH = Path(__file__).resolve().parents[2] / "mobile-descriptor.json"


class MobileCompatibility(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)

    mobile_api_version: StrictInt = Field(ge=1)
    minimum_mobile_api_version: StrictInt = Field(ge=1)
    minimum_app_version: str

    @field_validator("minimum_app_version")
    @classmethod
    def validate_minimum_app_version(cls, value: str) -> str:
        import re

        if not re.fullmatch(_SEMVER_PATTERN, value):
            raise ValueError("must be a valid SemVer version")
        return value

    @model_validator(mode="after")
    def validate_api_range(self) -> "MobileCompatibility":
        if self.minimum_mobile_api_version > self.mobile_api_version:
            raise ValueError("minimum_mobile_api_version cannot exceed mobile_api_version")
        return self


class MobileCapabilities(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)

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
    offline_homework_state: StrictBool
    offline_social_messages: StrictBool
    offline_support_messages: StrictBool
    offline_read_cursors: StrictBool
    offline_social_read_cursors: StrictBool
    offline_support_ticket_creation: StrictBool


class MobileDescriptor(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)

    schema_version: Literal[1]
    compatibility: MobileCompatibility
    capabilities: MobileCapabilities


class RuntimeReadiness(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)

    scanner_ready: StrictBool
    realtime_ready: StrictBool
    push_registration_ready: StrictBool
    push_delivery_ready: StrictBool
    push_registration_supported: StrictBool
    configured_push_providers: tuple[str, ...]
    social_ready: StrictBool


class LegacyCompatibility(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)

    compatible: StrictBool
    minimum_app_version: str
    api_version: StrictInt


class LegacyPushCapabilities(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)

    registration_supported: StrictBool
    registration_available: StrictBool
    delivery_enabled: StrictBool
    configured_providers: list[str]


class LegacyCapabilities(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)

    refresh_sessions: StrictBool
    session_management: StrictBool
    push_tokens: LegacyPushCapabilities


@lru_cache
def build_descriptor() -> MobileDescriptor:
    return MobileDescriptor.model_validate_json(DESCRIPTOR_PATH.read_text(encoding="utf-8"), strict=True)


def runtime_readiness() -> RuntimeReadiness:
    scanner = scanner_runtime()
    scanner_ready = isinstance(scanner, ClamAVScanner) and scanner.ready()
    try:
        push = LegacyPushCapabilities.model_validate(push_capability(), strict=True)
    except Exception:
        push = LegacyPushCapabilities(
            registration_supported=False,
            registration_available=False,
            delivery_enabled=False,
            configured_providers=[],
        )
    return RuntimeReadiness(
        scanner_ready=scanner_ready,
        realtime_ready=True,
        push_registration_ready=push.registration_available,
        push_delivery_ready=push.delivery_enabled and bool(push.configured_providers),
        push_registration_supported=push.registration_supported,
        configured_push_providers=tuple(push.configured_providers),
        social_ready=get_settings().SOCIAL_ROLLOUT_ENABLED,
    )


def resolve_descriptor() -> tuple[MobileDescriptor, LegacyPushCapabilities]:
    build = build_descriptor()
    readiness = runtime_readiness()
    capabilities = build.capabilities.model_copy(update={
        "push_registration": build.capabilities.push_registration and readiness.push_registration_ready,
        "push_delivery": build.capabilities.push_delivery and readiness.push_delivery_ready,
        "social_realtime": build.capabilities.social_realtime and readiness.realtime_ready,
        "social_attachments": build.capabilities.social_attachments and readiness.scanner_ready,
        "support_attachments": build.capabilities.support_attachments and readiness.scanner_ready,
        "social_friends": build.capabilities.social_friends and readiness.social_ready,
        "social_messages": build.capabilities.social_messages and readiness.social_ready,
        "offline_social_messages": build.capabilities.offline_social_messages and readiness.social_ready,
        "offline_social_read_cursors": build.capabilities.offline_social_read_cursors and readiness.social_ready,
        "social_realtime": build.capabilities.social_realtime and readiness.realtime_ready and readiness.social_ready,
        "social_attachments": build.capabilities.social_attachments and readiness.scanner_ready and readiness.social_ready,
    })
    push = LegacyPushCapabilities(
        registration_supported=build.capabilities.push_registration and readiness.push_registration_supported,
        registration_available=capabilities.push_registration,
        delivery_enabled=capabilities.push_delivery,
        configured_providers=list(readiness.configured_push_providers),
    )
    return build.model_copy(update={"capabilities": capabilities}), push


def legacy_compatibility(descriptor: MobileDescriptor) -> LegacyCompatibility:
    return LegacyCompatibility(
        compatible=True,
        minimum_app_version=descriptor.compatibility.minimum_app_version,
        api_version=descriptor.compatibility.mobile_api_version,
    )


def legacy_capabilities(descriptor: MobileDescriptor, push: LegacyPushCapabilities) -> LegacyCapabilities:
    return LegacyCapabilities(
        refresh_sessions=descriptor.capabilities.refresh_sessions,
        session_management=descriptor.capabilities.session_management,
        push_tokens=push.model_copy(update={
            "registration_available": descriptor.capabilities.push_registration,
            "delivery_enabled": descriptor.capabilities.push_delivery,
        }),
    )
