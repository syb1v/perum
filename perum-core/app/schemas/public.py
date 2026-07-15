from typing import Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class TenantCompatibility(BaseModel):
    model_config = ConfigDict(frozen=True)

    mobile_api_version: int
    minimum_mobile_api_version: int


class TenantCapabilities(BaseModel):
    model_config = ConfigDict(frozen=True)

    native_mobile: bool


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
    compatibility: TenantCompatibility
    capabilities: TenantCapabilities
