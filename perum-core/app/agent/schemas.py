from datetime import datetime

from pydantic import BaseModel, Field


class AgentProvisionSchoolRequest(BaseModel):
    school_slug: str
    school_name: str
    release_tag: str
    db_password: str
    secret_key: str
    telemetry_token: str
    internal_rpc_token: str | None = None
    redis_db_index: int = 0
    admin_email: str | None = None


class AgentProvisionSchoolResponse(BaseModel):
    success: bool
    school_slug: str
    message: str | None = None


class AgentUpdateSchoolRequest(BaseModel):
    school_slug: str
    image: str
    from_version: str | None = None
    to_version: str


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
