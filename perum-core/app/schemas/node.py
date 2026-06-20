from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class NodeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64, examples=["node-01"])
    hostname: str = Field(min_length=1, max_length=255, examples=["192.168.1.100"])
    ssh_port: int = Field(default=22, ge=1, le=65535)
    cpu_cores: int = Field(default=2, ge=1)
    ram_gb: float = Field(default=2.0, gt=0)
    disk_gb: float = Field(default=20.0, gt=0)
    country_code: str | None = Field(default=None, max_length=2, examples=["RU"])
    org_id: int | None = None
    max_schools: int = Field(default=5, ge=1)


class NodeUpdate(BaseModel):
    name: str | None = None
    hostname: str | None = Field(default=None, min_length=1, max_length=255)
    ssh_port: int | None = Field(default=None, ge=1, le=65535)
    country_code: str | None = Field(default=None, max_length=2)
    max_schools: int | None = Field(default=None, ge=1)
    enabled: bool | None = None
    status: str | None = None


class NodeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    hostname: str
    ssh_port: int
    cpu_cores: int
    ram_gb: float
    disk_gb: float
    country_code: str | None
    status: str
    enabled: bool
    org_id: int | None
    agent_version: str | None
    last_heartbeat: datetime | None
    max_schools: int
    # Реальная загрузка (снимок монитор-петли) + латентность ядро→воркер.
    last_cpu_percent: float | None = None
    last_ram_used_mb: int | None = None
    last_ram_total_mb: int | None = None
    last_disk_used_gb: float | None = None
    last_disk_total_gb: float | None = None
    last_ping_ms: int | None = None
    metrics_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class NodeListResponse(BaseModel):
    nodes: list[NodeResponse]
    total: int


class NodeUtilizationResponse(BaseModel):
    node_id: int
    schools_count: int
    max_schools: int
    capacity_percent: float
    ram_used_gb: float | None = None
    cpu_used_percent: float | None = None
    disk_used_gb: float | None = None


class CapacityRecommendationRequest(BaseModel):
    school_count: int = Field(ge=1, le=1000)
    expected_users_per_school: int = Field(default=200, ge=10, le=5000)


class NodeConfig(BaseModel):
    cpu_cores: int
    ram_gb: float
    disk_gb: float
    schools_per_node: int
    nodes_needed: int


class CapacityRecommendationResponse(BaseModel):
    recommendations: list[NodeConfig]
    total_schools: int
    summary: str


class NodeBulkActionRequest(BaseModel):
    # action: enable | disable | restart
    action: str = Field(examples=["restart"])
    # scope: all (все ноды) | pool (только без организации) | org (ноды организации org_id)
    scope: str = Field(default="all", examples=["all"])
    org_id: int | None = None


class NodeActionResult(BaseModel):
    node_id: int
    node_name: str
    ok: bool
    message: str | None = None


class NodeBulkActionResponse(BaseModel):
    action: str
    scope: str
    total: int
    succeeded: int
    results: list[NodeActionResult]


class BootstrapScriptResponse(BaseModel):
    filename: str
    content: str
    instructions: str
    docker_compose: str
    enrollment_token: str


class NodeAssignmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    node_id: int
    school_id: int
    assigned_at: datetime


class UpdateHistoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    school_id: int
    from_version: str | None
    to_version: str
    status: str
    started_at: datetime
    completed_at: datetime | None
    error_message: str | None


class UpdateHistoryListResponse(BaseModel):
    history: list[UpdateHistoryResponse]
    total: int
