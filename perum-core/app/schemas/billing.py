from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class ClosedModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class EffectiveEntitlementResponse(ClosedModel):
    allowed: bool
    source: Literal["subscription", "pilot", "none"]
    pilot_entitlement_id: int | None
    pilot_expires_at: str | None
    blocked_by_suspension: bool
    suspension_source: str | None


class PilotEntitlementResponse(ClosedModel):
    id: int
    org_id: int
    starts_at: datetime
    expires_at: datetime
    reason: str
    approval_reference: str
    idempotency_key: str
    granted_by: int
    reconciliation_state: str
    reconciled_at: datetime | None
    reconciled_by: int | None
    created_at: datetime | None
    active: bool | None = None


class PilotGrantResponse(ClosedModel):
    pilot_entitlement: PilotEntitlementResponse
    effective_entitlement: EffectiveEntitlementResponse
    created: bool
    lifecycle_action: Literal["none"] = "none"


class PilotEntitlementListResponse(ClosedModel):
    active_pilot_entitlement_id: int | None
    pilot_entitlements: list[PilotEntitlementResponse]


class SchoolResumeFailure(ClosedModel):
    slug: str
    error: str


class PilotResumeResponse(ClosedModel):
    pilot_entitlement_id: int
    reconciliation_state: Literal["resumed", "resume_partial"]
    organization_resumed: bool
    schools_resumed: list[str]
    schools_skipped: list[str]
    schools_failed: list[SchoolResumeFailure]
