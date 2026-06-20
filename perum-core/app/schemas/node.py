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
    max_schools: int | None = Field(default=None, ge=1)
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
    org_id: int | None
    agent_version: str | None
    last_heartbeat: datetime | None
    max_schools: int
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
