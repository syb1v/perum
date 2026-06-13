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

    # Шифрование секретов at-rest (Фаза 10). Fernet-ключ (urlsafe base64, 32 байта).
    # Пусто → секреты хранятся плейнтекстом (dev). Прод: Fernet.generate_key().
    SECRETS_ENCRYPTION_KEY: str = Field(default="")

    # Ограничение попыток входа (rate-limit): N попыток за окно (сек) на ключ ip+login.
    LOGIN_RATE_LIMIT: int = Field(default=10)
    LOGIN_RATE_WINDOW_S: int = Field(default=60)

    # Защита /metrics: если задан — требуется Bearer/X-Metrics-Token. Пусто → открыт (dev).
    METRICS_TOKEN: str = Field(default="")

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

    # Куда писать авто-бэкап БД школы (pg_dump) перед безвозвратным удалением.
    # В проде это смонтированный том perum_backups (см. docker-compose.core.yml).
    BACKUP_DIR: str = Field(default="/backups")

    # Период фонового свипа просроченных подписок (заморозка + дебиторка), сек.
    # 0 — выключить планировщик (тогда только ручной POST /api/billing/enforce).
    BILLING_ENFORCE_INTERVAL_S: int = Field(default=3600)

    # Токен для CI-публикации релизов (POST /api/ci/release). Пусто → CI-эндпоинт
    # выключен (релизы только вручную через platform_admin). Задаётся в .env.prod
    # и в секретах GitHub Actions (RELEASE_PUBLISH_TOKEN), чтобы пайплайн
    # регистрировал релиз тенанта автоматически при реальном изменении кода.
    RELEASE_PUBLISH_TOKEN: str = Field(default="")

    PUBLIC_BASE_DOMAIN: str = Field(
        default="perum.local",
        description="Used when composing org subdomains (acme + perum.local = acme.perum.local)",
    )

    # --- Режим узла организации (org-node v2, см. docs/ARCH_ORG_NODE.md) ---
    ROLE: str = Field(
        default="platform",
        description="platform (центральное ядро) | org_agent (узел организации)",
    )
    CORE_URL: str = Field(
        default="http://perum_core:3000",
        description="Куда агент орг стучится для enroll/релизов (только в режиме org_agent)",
    )
    ENROLLMENT_TOKEN: str = Field(
        default="",
        description="Одноразовый токен подключения узла орг (выдаёт platform_admin)",
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
