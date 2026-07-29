from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictBool, field_validator


class AgentProvisionSchoolRequest(BaseModel):
    org_public_id: UUID | None = None
    org_slug: str | None = None
    org_name: str | None = None
    org_domain: str | None = None
    school_public_id: UUID | None = None
    school_slug: str
    school_name: str
    release_tag: str
    db_password: str
    secret_key: str
    telemetry_token: str
    internal_rpc_token: str | None = None
    redis_db_index: int = 0
    admin_email: str | None = None
    # Полный публичный домен школы (`<subdomain>.<org.domain>`) — воркор ставит на него
    # маршрут в Caddy ноды. Пусто → fallback `<slug>.<base>` (легаси).
    host: str | None = None
    social_rollout_enabled: StrictBool = False
    social_rollout_generation: int = Field(default=0, ge=0)


class AgentLandingRequest(BaseModel):
    """Поднять/обновить контейнер-лендинг организации на ноде (по корневому домену)."""
    domain: str
    org_name: str
    org_slug: str
    org_public_id: UUID | None = None
    school_hosts: list[str] = Field(default_factory=list)  # для списка школ на странице лендинга


class AgentLandingResponse(BaseModel):
    success: bool
    domain: str
    message: str | None = None


class AgentProvisionSchoolResponse(BaseModel):
    success: bool
    school_slug: str
    message: str | None = None


class AgentUpdateSchoolRequest(BaseModel):
    school_slug: str
    image: str
    from_version: str | None = None
    to_version: str
    social_rollout_enabled: StrictBool = False
    social_rollout_generation: int = Field(default=0, ge=0)


class AgentSocialRuntimeConfigRequest(BaseModel):
    enabled: StrictBool
    generation: int = Field(ge=0)


class AgentSocialRuntimeConfigResponse(BaseModel):
    success: bool
    school_slug: str
    applied_generation: int
    rolled_back: bool = False
    message: str | None = None


class AgentUpdateSchoolResponse(BaseModel):
    success: bool
    school_slug: str
    rolled_back: bool = False
    message: str | None = None


class AgentSuspendSchoolRequest(BaseModel):
    school_slug: str


class AgentSchoolActionResponse(BaseModel):
    success: bool
    school_slug: str
    message: str | None = None


class AgentNodeActionResponse(BaseModel):
    success: bool
    restarted: list[str] = []
    message: str | None = None


class AgentDeprovisionSchoolRequest(BaseModel):
    school_slug: str
    mode: str = Field(default="archive", pattern="^(archive|purge)$")


class AgentSchoolInfo(BaseModel):
    slug: str
    status: str
    release_tag: str | None = None
    containers: list[str] = []


class AgentSchoolListResponse(BaseModel):
    schools: list[AgentSchoolInfo]
    total: int


class AgentLandingState(BaseModel):
    """Фактическое состояние лендинга орг на ноде. Ядро сверяет его с
    `Organization.landing_status`, иначе однажды выставленный `failed` остаётся
    навсегда даже после успешного восстановления маршрута воркером."""

    domain: str
    running: StrictBool
    routed: StrictBool


class AgentHealthResponse(BaseModel):
    node_name: str | None = None
    status: str
    schools_count: int
    cpu_percent: float | None = None
    ram_used_mb: int | None = None
    ram_total_mb: int | None = None
    disk_used_gb: float | None = None
    disk_total_gb: float | None = None
    uptime_seconds: int | None = None
    agent_version: str | None = None
    landings: list[AgentLandingState] = Field(default_factory=list)
    timestamp: datetime


class AgentHeartbeatRequest(BaseModel):
    node_name: str | None = None
    schools_count: int = 0
    cpu_percent: float | None = None
    ram_used_mb: int | None = None
    ram_total_mb: int | None = None
    disk_used_gb: float | None = None
    disk_total_gb: float | None = None
    agent_version: str | None = None


class AgentHeartbeatResponse(BaseModel):
    success: bool
    node_id: int | None = None


class SchoolDeploymentSnapshotV1(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal[1]
    school_id: UUID
    release_image: str = Field(min_length=1, max_length=255)
    scanner_ready: StrictBool
    realtime_ready: StrictBool
    push_registration_ready: StrictBool
    push_delivery_ready: StrictBool
    social_ready: StrictBool = False
    social_generation: int = Field(default=0, ge=0)
    observed_at: datetime

    @field_validator("observed_at")
    @classmethod
    def validate_observed_at(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("observed_at must include a timezone")
        return value


class AgentInternalRpcRequest(BaseModel):
    """Прокси внутреннего RPC школы на ноде: ядро не достаёт контейнер школы на ноде
    напрямую (он в сети ноды), поэтому шлёт команду воркеру, а тот ходит локально в
    /internal стека школы (управление админами школы и т.п.)."""
    method: str
    path: str
    body: dict | None = None


class AgentInternalRpcResponse(BaseModel):
    status_code: int
    data: dict | None = None
