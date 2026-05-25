"""Single source of truth for the shape of a per-org tenant stack.

``build_stack_spec`` resolves all names, images and env for an org from its DB
record + secrets + settings. Two consumers read the same spec:

* ``app.services.tenant_provisioner`` brings the stack up via the Docker SDK.
* ``render_compose`` produces the equivalent human-readable compose manifest
  (used in tests and for ops visibility).

Keeping both behind one spec means the running stack and the rendered manifest
cannot drift. The reference template at
``deploy/stack-templates/org-stack.docker-compose.yml.tmpl`` mirrors
``COMPOSE_TEMPLATE`` below.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from jinja2 import Template

from app.core.config import Settings
from app.models import Organization, OrganizationSecret, School, SchoolSecret


def container_name(slug: str, role: str) -> str:
    return f"org_{slug}_{role}"


def volume_name(slug: str) -> str:
    return f"org_{slug}_data"


def project_name(slug: str) -> str:
    return f"org_{slug}"


# --- v2: школьные стеки (silo = школа). Префикс school_; label-slug namespace. ---

def school_container_name(slug: str, role: str) -> str:
    return f"school_{slug}_{role}"


def school_volume_name(slug: str) -> str:
    return f"school_{slug}_data"


def school_project_name(slug: str) -> str:
    return f"school_{slug}"


def school_label_slug(slug: str) -> str:
    """Ключ Docker/Caddy-лейблов школьного стека — namespace, чтобы не
    пересекаться с орг-стеками в `com.perum.org`."""
    return f"sch-{slug}"


@dataclass
class StackSpec:
    slug: str
    org_name: str
    project: str
    network: str
    app_container: str
    db_container: str
    volume: str
    tenant_image: str
    postgres_image: str
    db_password: str
    secret_key: str
    telemetry_token: str
    redis_db_index: int
    database_url: str
    redis_url: str
    control_plane_url: str
    app_env: dict[str, str] = field(default_factory=dict)


def build_stack_spec(
    org: Organization, secret: OrganizationSecret, settings: Settings
) -> StackSpec:
    slug = org.slug
    db_container = container_name(slug, "db")
    app_container = container_name(slug, "app")

    # Tenant DATABASE_URL is a plain libpq URL in the template; the tenant app
    # and its alembic env normalise the scheme to asyncpg internally.
    database_url = f"postgresql://perum:{secret.db_password}@{db_container}:5432/perum"
    redis_url = f"{settings.SHARED_REDIS_URL.rstrip('/')}/{secret.redis_db_index}"
    postgres_image = f"{settings.IMAGE_REGISTRY}/library/postgres:15-alpine"

    app_env = {
        "ORG_SLUG": slug,
        "ORG_NAME": org.name,
        "DATABASE_URL": database_url,
        "REDIS_URL": redis_url,
        "CONTROL_PLANE_URL": settings.CONTROL_PLANE_URL,
        "TELEMETRY_TOKEN": secret.telemetry_token,
        "SECRET_KEY": secret.secret_key,
    }

    return StackSpec(
        slug=slug,
        org_name=org.name,
        project=project_name(slug),
        network=settings.DOCKER_NETWORK,
        app_container=app_container,
        db_container=db_container,
        volume=volume_name(slug),
        tenant_image=settings.TENANT_IMAGE,
        postgres_image=postgres_image,
        db_password=secret.db_password,
        secret_key=secret.secret_key,
        telemetry_token=secret.telemetry_token,
        redis_db_index=secret.redis_db_index,
        database_url=database_url,
        redis_url=redis_url,
        control_plane_url=settings.CONTROL_PLANE_URL,
        app_env=app_env,
    )


def build_school_stack_spec(
    school: School, secret: SchoolSecret, settings: Settings
) -> StackSpec:
    """Спек школьного стека. Контейнеры `school_<slug>_*`, тот же tenant-образ.
    `slug` в спеке = slug школы (для имён/хоста); namespacing Docker/Caddy-лейблов
    делает провижинер через `school_label_slug`."""
    slug = school.slug
    db_container = school_container_name(slug, "db")
    app_container = school_container_name(slug, "app")

    database_url = f"postgresql://perum:{secret.db_password}@{db_container}:5432/perum"
    redis_url = f"{settings.SHARED_REDIS_URL.rstrip('/')}/{secret.redis_db_index}"
    postgres_image = f"{settings.IMAGE_REGISTRY}/library/postgres:15-alpine"

    app_env = {
        # Tenant-образ пока читает ORG_SLUG/ORG_NAME — на Этапе 3 семантика станет
        # «одна школа»; до тех пор школьный стек идентифицируется slug-ом школы.
        "ORG_SLUG": slug,
        "ORG_NAME": school.name,
        "DATABASE_URL": database_url,
        "REDIS_URL": redis_url,
        "CONTROL_PLANE_URL": settings.CONTROL_PLANE_URL,
        "TELEMETRY_TOKEN": secret.telemetry_token,
        "SECRET_KEY": secret.secret_key,
    }

    return StackSpec(
        slug=slug,
        org_name=school.name,
        project=school_project_name(slug),
        network=settings.DOCKER_NETWORK,
        app_container=app_container,
        db_container=db_container,
        volume=school_volume_name(slug),
        tenant_image=settings.TENANT_IMAGE,
        postgres_image=postgres_image,
        db_password=secret.db_password,
        secret_key=secret.secret_key,
        telemetry_token=secret.telemetry_token,
        redis_db_index=secret.redis_db_index,
        database_url=database_url,
        redis_url=redis_url,
        control_plane_url=settings.CONTROL_PLANE_URL,
        app_env=app_env,
    )


COMPOSE_TEMPLATE = """\
# Per-org tenant stack — rendered from perum-core/app/services/stack_spec.py.
#
# Phase 1 brings stacks up via the Docker SDK (app/core/docker_client.py); this
# rendered file is an informational manifest, not the bring-up mechanism. It is
# valid compose, though: `docker compose -p {{ project }} up -d` against a
# rendered copy would create the same stack.
name: {{ project }}
services:
  app:
    image: {{ tenant_image }}
    container_name: {{ app_container }}
    environment:
      ORG_SLUG: {{ slug }}
      ORG_NAME: "{{ org_name }}"
      DATABASE_URL: {{ database_url }}
      REDIS_URL: {{ redis_url }}
      CONTROL_PLANE_URL: {{ control_plane_url }}
      TELEMETRY_TOKEN: {{ telemetry_token }}
      SECRET_KEY: {{ secret_key }}
    networks: [{{ network }}]
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped
  db:
    image: {{ postgres_image }}
    container_name: {{ db_container }}
    environment:
      POSTGRES_USER: perum
      POSTGRES_PASSWORD: {{ db_password }}
      POSTGRES_DB: perum
    volumes:
      - {{ volume }}:/var/lib/postgresql/data
    networks: [{{ network }}]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U perum -d perum"]
      interval: 5s
      timeout: 3s
      retries: 10
volumes:
  {{ volume }}: {}
networks:
  {{ network }}:
    external: true
"""

_REDACTED = "***"


def render_compose(spec: StackSpec, *, redact_secrets: bool = False) -> str:
    """Render the compose manifest for a stack. Secrets can be masked for display."""
    ctx = {
        "project": spec.project,
        "slug": spec.slug,
        "org_name": spec.org_name,
        "network": spec.network,
        "app_container": spec.app_container,
        "db_container": spec.db_container,
        "volume": spec.volume,
        "tenant_image": spec.tenant_image,
        "postgres_image": spec.postgres_image,
        "database_url": spec.database_url,
        "redis_url": spec.redis_url,
        "control_plane_url": spec.control_plane_url,
        "db_password": _REDACTED if redact_secrets else spec.db_password,
        "secret_key": _REDACTED if redact_secrets else spec.secret_key,
        "telemetry_token": _REDACTED if redact_secrets else spec.telemetry_token,
    }
    if redact_secrets:
        # also redact the password embedded in DATABASE_URL
        ctx["database_url"] = spec.database_url.replace(spec.db_password, _REDACTED)
    return Template(COMPOSE_TEMPLATE).render(**ctx)
