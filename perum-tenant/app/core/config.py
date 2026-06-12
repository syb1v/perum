"""Tenant identity + runtime config.

A tenant container learns *which org it is* purely from environment variables
injected by the control plane when it provisions the stack (ORG_SLUG,
DATABASE_URL, …). There is no hard-coded org anywhere — one image, N instances.
"""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    ORG_SLUG: str = Field(default="unknown", description="This stack's org slug")
    ORG_NAME: str = ""

    DATABASE_URL: str = Field(
        default="postgresql://perum:perum@localhost:5432/perum",
        description="libpq-style URL; normalised to asyncpg via async_database_url",
    )
    REDIS_URL: str = "redis://shared_redis:6379/0"

    SECRET_KEY: str = "dev-secret-change-me"
    ACCESS_TOKEN_TTL_MINUTES: int = 60 * 24 * 7
    JWT_ALGORITHM: str = "HS256"
    TELEMETRY_TOKEN: str = ""
    CONTROL_PLANE_URL: str = "http://perum_core:3000"
    # Период отправки телеметрии (агрегаты без PII) в ядро, сек. 0 — выключить.
    TELEMETRY_INTERVAL_S: int = 60

    @property
    def async_database_url(self) -> str:
        url = self.DATABASE_URL
        for prefix in ("postgresql+asyncpg://", ):
            if url.startswith(prefix):
                return url
        if url.startswith("postgresql://"):
            return "postgresql+asyncpg://" + url[len("postgresql://"):]
        if url.startswith("postgres://"):
            return "postgresql+asyncpg://" + url[len("postgres://"):]
        return url


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
