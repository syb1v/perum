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

    CADDY_ADMIN_URL: str = Field(
        default="http://caddy:2019",
        description="Caddy admin API endpoint for route management",
    )

    TENANT_IMAGE: str = Field(
        default="ghcr.io/syb1v/perum-tenant:latest",
        description="Image used when provisioning new org stacks",
    )

    SHARED_REDIS_URL: str = "redis://shared_redis:6379"
    DOCKER_NETWORK: str = "perum_internal"

    PUBLIC_BASE_DOMAIN: str = Field(
        default="perum.local",
        description="Used when composing org subdomains (acme + perum.local = acme.perum.local)",
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
