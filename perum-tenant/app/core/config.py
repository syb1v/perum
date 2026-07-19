"""Tenant identity + runtime config.

A tenant container learns *which org it is* purely from environment variables
injected by the control plane when it provisions the stack (ORG_SLUG,
DATABASE_URL, …). There is no hard-coded org anywhere — one image, N instances.
"""

from functools import lru_cache

from pydantic import Field, model_validator
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

    SECRET_KEY: str = "dev-secret-change-me-perum-tenant"
    ACCESS_TOKEN_TTL_MINUTES: int = 60 * 24 * 7
    REFRESH_TOKEN_TTL_DAYS: int = 30
    JWT_ISSUER: str = "perum-tenant"
    JWT_AUDIENCE: str = "perum-mobile"
    JWT_ALGORITHM: str = "HS256"
    TELEMETRY_TOKEN: str = ""
    # Отдельный токен для входящего /internal-RPC от ядра (управление учётками
    # school_admin). Раздельно с TELEMETRY_TOKEN (исходящий bearer метрик), чтобы
    # утечка одного не давала прав другого (AUDIT, isolation #6). Пусто → гард
    # падает обратно на TELEMETRY_TOKEN (совместимость со старым ядром).
    INTERNAL_RPC_TOKEN: str = ""
    CONTROL_PLANE_URL: str = "http://perum_core:3000"
    SCHOOL_PUBLIC_ID: str = ""
    RELEASE_IMAGE: str = ""
    SUPPORT_ESCALATION_INTERVAL_S: int = 15
    SUPPORT_ESCALATION_DELIVERY_SLA_S: int = 300
    # Период отправки телеметрии (агрегаты без PII) в ядро, сек. 0 — выключить.
    TELEMETRY_INTERVAL_S: int = 60
    SOCIAL_RETENTION_INTERVAL_S: int = 3600
    SOCIAL_RETENTION_BATCH_SIZE: int = 500
    SOCIAL_ROLLOUT_ENABLED: bool = False
    SOCIAL_ROLLOUT_GENERATION: int = 0
    MEDIA_ENABLED: bool = False
    MEDIA_ROOT: str = "/app/data/media"
    MEDIA_MAX_BYTES: int = 10 * 1024 * 1024
    MEDIA_SESSION_TTL_S: int = 3600
    MEDIA_CLEANUP_INTERVAL_S: int = 300
    MEDIA_UNBOUND_TTL_S: int = 86400
    MEDIA_OWNER_GRACE_S: int = 3600
    MEDIA_CLEANUP_BATCH_SIZE: int = 100
    SCANNER_HOST: str = ""
    SCANNER_PORT: int = Field(default=3310, ge=1, le=65535)
    SCANNER_TIMEOUT_S: float = Field(default=15, gt=0)
    SCANNER_CONNECT_TIMEOUT_S: float = Field(default=3, gt=0)
    SCANNER_CHUNK_BYTES: int = Field(default=64 * 1024, ge=1, le=1024 * 1024)
    SCANNER_MAX_PARALLEL: int = Field(default=2, ge=1)
    SCANNER_MAX_SIGNATURE_AGE_H: int = Field(default=48, ge=1)
    SCANNER_LEASE_S: int = Field(default=120, ge=1)
    SCANNER_RETRY_BASE_S: int = Field(default=30, ge=1)
    SCANNER_RETRY_MAX_S: int = Field(default=3600, ge=1)
    PUSH_TOKEN_ENCRYPTION_KEY: str = ""
    PUSH_TOKEN_HASH_KEY: str = ""
    PUSH_DELIVERY_ENABLED: bool = False

    @model_validator(mode="after")
    def validate_scanner_timing(self) -> "Settings":
        if self.SCANNER_LEASE_S <= self.SCANNER_TIMEOUT_S + self.SCANNER_CONNECT_TIMEOUT_S:
            raise ValueError("SCANNER_LEASE_S must exceed scanner operation and connect timeouts")
        if self.SCANNER_RETRY_BASE_S > self.SCANNER_RETRY_MAX_S:
            raise ValueError("SCANNER_RETRY_BASE_S cannot exceed SCANNER_RETRY_MAX_S")
        return self

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
