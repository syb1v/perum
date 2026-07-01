import re
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

# first char a letter, last char alnum, middle 1-38 of [a-z0-9-] → total length 3-40
SLUG_PATTERN = re.compile(r"^[a-z][a-z0-9-]{1,38}[a-z0-9]$")
# Базовая валидация доменного имени (FQDN): метки a-z0-9 с дефисами, TLD ≥2 букв.
DOMAIN_PATTERN = re.compile(r"^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$")


def slug_from_domain(domain: str) -> str:
    """Внутренний инфра-токен из домена: `acme.ru` → `acme-ru` (имена контейнеров/
    маршрутов/БД). Наружу не показывается — идентичность орг это домен."""
    s = re.sub(r"[^a-z0-9]+", "-", domain.strip().lower()).strip("-")
    if not s or not s[0].isalpha():
        s = "org-" + s
    return s[:40].rstrip("-")


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
    # Идентичность орг — её ДОМЕН (он же лендинг). slug выводится из домена внутри ядра.
    domain: str = Field(min_length=4, max_length=253, examples=["acme.ru"])
    node_id: int = Field(examples=[1], description="нода, где живёт орг (лендинг + школы)")
    name: str = Field(min_length=2, max_length=255, examples=["Acme Education"])
    admin_email: EmailStr | None = None
    plan: str = "trial"
    notes: str | None = None

    @field_validator("domain")
    @classmethod
    def validate_domain(cls, v: str) -> str:
        v = v.strip().lower().rstrip(".")
        if v.startswith(("http://", "https://")):
            v = v.split("//", 1)[1]
        v = v.split("/", 1)[0].split(":", 1)[0]
        if not DOMAIN_PATTERN.match(v):
            raise ValueError("домен должен быть валидным FQDN, напр. acme.ru")
        return v

    @field_validator("plan")
    @classmethod
    def validate_plan(cls, v: str) -> str:
        # Симметрично PUT /billing: неизвестный план не должен молча стать trial.
        from app.services.billing import PLANS

        if v not in PLANS:
            raise ValueError(f"unknown plan; allowed: {', '.join(PLANS)}")
        return v


class OrganizationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    domain: str | None
    node_id: int | None
    landing_status: str
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
