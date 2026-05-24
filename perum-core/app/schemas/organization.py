import re
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

# first char a letter, last char alnum, middle 1-38 of [a-z0-9-] → total length 3-40
SLUG_PATTERN = re.compile(r"^[a-z][a-z0-9-]{1,38}[a-z0-9]$")
RESERVED_SLUGS = {
    "admin",
    "www",
    "api",
    "docs",
    "control",
    "platform",
    "support",
    "help",
    "status",
    "billing",
    "auth",
    "static",
    "assets",
    "internal",
}


class OrganizationCreate(BaseModel):
    slug: str = Field(min_length=3, max_length=40, examples=["acme"])
    name: str = Field(min_length=2, max_length=255, examples=["Acme Education"])
    admin_email: EmailStr | None = None
    plan: str = "trial"
    deployment_mode: str = "shared_host"
    notes: str | None = None

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, v: str) -> str:
        v = v.strip().lower()
        if v in RESERVED_SLUGS:
            raise ValueError(f"slug '{v}' is reserved")
        if not SLUG_PATTERN.match(v):
            raise ValueError(
                "slug must start with a letter, end with a letter or digit, "
                "contain only lowercase letters/digits/hyphens, length 3-40"
            )
        return v

    @field_validator("deployment_mode")
    @classmethod
    def validate_deployment_mode(cls, v: str) -> str:
        if v not in ("shared_host", "dedicated_vm"):
            raise ValueError("deployment_mode must be 'shared_host' or 'dedicated_vm'")
        return v


class OrganizationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    name: str
    status: str
    deployment_mode: str
    plan: str
    admin_email: str | None
    created_at: datetime
    activated_at: datetime | None


class OrgAdminCredentials(BaseModel):
    """One-time initial org_admin credentials, returned to the platform operator
    who created the org. In prod this is delivered to the org_admin by email."""

    login: str
    temporary_password: str


class ProvisionResult(BaseModel):
    """Returned by create/reprovision: the org plus (when freshly bootstrapped)
    the initial org_admin login."""

    organization: OrganizationRead
    org_admin: OrgAdminCredentials | None = None
