from typing import Literal

from pydantic import BaseModel

from app.schemas.public import TenantCapabilities


class DeploymentDescriptorDiagnostic(BaseModel):
    schema_valid: bool
    release_match: bool
    snapshot_present: bool
    snapshot_fresh: bool
    snapshot_age_bucket: Literal["absent", "future", "lt_1m", "1m_5m", "5m_15m", "15m_1h", "gte_1h"]
    snapshot_accepted: bool
    social_rollout_converged: bool
    effective_capabilities: TenantCapabilities
