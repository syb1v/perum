from pydantic import BaseModel, ConfigDict


class TenantCompatibility(BaseModel):
    model_config = ConfigDict(frozen=True)

    mobile_api_version: int
    minimum_mobile_api_version: int


class TenantCapabilities(BaseModel):
    model_config = ConfigDict(frozen=True)

    native_mobile: bool


class TenantDiscoveryResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    school_name: str
    canonical_host: str
    api_base_url: str
    web_base_url: str
    compatibility: TenantCompatibility
    capabilities: TenantCapabilities
