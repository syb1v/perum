from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_NAME: str = "perum-core"
    ENVIRONMENT: str = Field(default="dev", description="dev | staging | prod")

    DATABASE_URL: str = Field(
        default="postgresql+asyncpg://perum:perum@perum_control_db:5432/perum_control",
        description="Async SQLAlchemy URL for the control plane DB",
    )

    SECRET_KEY: str = Field(default="dev-secret-change-me")
    ACCESS_TOKEN_TTL_MINUTES: int = 60 * 24 * 7
    JWT_ALGORITHM: str = "HS256"

    # First platform_admin: seeded on startup only if no admins exist yet AND a
    # password is set. In dev the compose file provides admin/admin; in prod set
    # BOOTSTRAP_ADMIN_PASSWORD via .env (or create the admin out of band).
    BOOTSTRAP_ADMIN_LOGIN: str = "admin"
    BOOTSTRAP_ADMIN_PASSWORD: str = ""

    CADDY_ADMIN_URL: str = Field(
        default="http://caddy:2019",
        description="Caddy admin API endpoint for route management",
    )

    CONTROL_PLANE_URL: str = Field(
        default="http://perum_core:3000",
        description="How org stacks reach the control plane (telemetry, RPC)",
    )

    WEB_UPSTREAM: str = Field(
        default="perum_web:3000",
        description="Frontend upstream; serves non-/api paths on every host",
    )

    TENANT_IMAGE: str = Field(
        default="perum-tenant:dev",
        description="Image used when provisioning new org stacks",
    )

    IMAGE_REGISTRY: str = Field(
        default="docker.io",
        description=(
            "Registry prefix for base images (postgres) pulled by org stacks. "
            "In Russia, Docker Hub is blocked — set mirror.gcr.io. Mirrors the "
            "IMAGE_REGISTRY used by deploy/docker-compose.core.yml."
        ),
    )

    SHARED_REDIS_URL: str = "redis://shared_redis:6379"
    DOCKER_NETWORK: str = "perum_internal"

    # Provisioning timeouts (seconds) for waiting on container health.
    DB_HEALTH_TIMEOUT_S: int = 60
    APP_HEALTH_TIMEOUT_S: int = 90

    PUBLIC_BASE_DOMAIN: str = Field(
        default="perum.local",
        description="Used when composing org subdomains (acme + perum.local = acme.perum.local)",
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
