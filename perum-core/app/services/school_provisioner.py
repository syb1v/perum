"""Provision / deprovision a per-SCHOOL stack (архитектура v2, см. ARCH_ORG_NODE.md).

Зеркало `tenant_provisioner`, но юнит — школа: контейнеры `school_<slug>_*`, том
`school_<slug>_data`, маршрут `<slug>.<base-domain>`. Docker/Caddy-ресурсы
помечаются namespaced-лейблом `sch-<slug>` (через `school_label_slug`), чтобы не
пересекаться с орг-стеками. Образ — текущий tenant (на Этапе 3 станет «одна школа»).
"""

from __future__ import annotations

import logging
import secrets as secrets_mod
from dataclasses import dataclass
from datetime import datetime

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.docker_client import DockerClient, HealthSpec, get_docker_client
from app.models import School, SchoolDomain, SchoolSecret
from app.services.caddy_admin import CaddyAdmin, get_caddy_admin
from app.services.stack_spec import StackSpec, build_school_stack_spec, school_label_slug
from app.services.tenant_provisioner import ProvisioningError

logger = logging.getLogger("perum.school_provisioner")

REDIS_DB_COUNT = 16


@dataclass
class SchoolProvisionOutcome:
    school: School
    host: str
    admin_login: str | None = None
    admin_temp_password: str | None = None


async def _get_or_create_secret(school: School, db: AsyncSession) -> SchoolSecret:
    existing = await db.get(SchoolSecret, school.id)
    if existing is not None:
        return existing
    secret = SchoolSecret(
        school_id=school.id,
        db_password=secrets_mod.token_urlsafe(24),
        secret_key=secrets_mod.token_urlsafe(36),
        telemetry_token=secrets_mod.token_urlsafe(24),
        redis_db_index=school.id % REDIS_DB_COUNT,
    )
    db.add(secret)
    await db.flush()
    return secret


async def _bootstrap_admin(spec: StackSpec, admin_email: str | None) -> tuple[str | None, str | None]:
    if not admin_email:
        return None, None
    url = f"http://{spec.app_container}:3000/internal/bootstrap-org-admin"
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            url, headers={"X-Telemetry-Token": spec.telemetry_token}, json={"email": admin_email}
        )
    if resp.status_code == 409:
        return None, None
    if resp.status_code >= 300:
        raise ProvisioningError(f"bootstrap school admin failed: {resp.status_code} {resp.text}")
    data = resp.json()
    return data.get("login"), data.get("temporary_password")


async def _safe_cleanup(label_slug: str, docker: DockerClient, caddy: CaddyAdmin) -> None:
    try:
        await docker.remove_stack(label_slug)
    except Exception as exc:  # noqa: BLE001
        logger.error("school %s: cleanup remove_stack failed: %s", label_slug, exc)
    try:
        await caddy.remove_route(label_slug)
    except Exception as exc:  # noqa: BLE001
        logger.error("school %s: cleanup remove_route failed: %s", label_slug, exc)


async def _bring_up(spec: StackSpec, label_slug: str, settings: Settings, docker: DockerClient, caddy: CaddyAdmin, admin_email: str | None) -> SchoolProvisionOutcome:
    try:
        await docker.ensure_network(spec.network)
        await docker.ensure_image(spec.postgres_image)
        await docker.ensure_image(spec.tenant_image)
        await docker.remove_containers(label_slug)

        await docker.create_volume(spec.volume, slug=label_slug)
        await docker.run_container(
            name=spec.db_container, image=spec.postgres_image, slug=label_slug, role="db",
            environment={"POSTGRES_USER": "perum", "POSTGRES_PASSWORD": spec.db_password, "POSTGRES_DB": "perum"},
            volumes={spec.volume: {"bind": "/var/lib/postgresql/data", "mode": "rw"}},
            health=HealthSpec(test=["CMD-SHELL", "pg_isready -U perum -d perum"]),
            network=spec.network,
        )
        await docker.wait_for_healthy(spec.db_container, timeout_s=settings.DB_HEALTH_TIMEOUT_S)

        await docker.run_container(
            name=spec.app_container, image=spec.tenant_image, slug=label_slug, role="app",
            environment=spec.app_env, network=spec.network,
        )
        await docker.wait_for_healthy(spec.app_container, timeout_s=settings.APP_HEALTH_TIMEOUT_S)

        code, out = await docker.exec(spec.app_container, ["alembic", "upgrade", "head"], workdir="/app")
        if code != 0:
            raise ProvisioningError(f"alembic upgrade failed (exit {code}):\n{out[-2000:]}")

        code, out = await docker.exec(spec.app_container, ["python", "-m", "app.scripts.seed_defaults"], workdir="/app")
        if code != 0:
            raise ProvisioningError(f"seed_defaults failed (exit {code}):\n{out[-2000:]}")

        admin_login, admin_pw = await _bootstrap_admin(spec, admin_email)

        host = f"{spec.slug}.{settings.PUBLIC_BASE_DOMAIN}"
        await caddy.add_route(label_slug, host, f"{spec.app_container}:3000")
        logger.info("school %s: provisioned, route %s -> %s:3000", spec.slug, host, spec.app_container)
        return SchoolProvisionOutcome(school=None, host=host, admin_login=admin_login, admin_temp_password=admin_pw)  # type: ignore[arg-type]
    except Exception as exc:
        logger.warning("school %s: provisioning failed, cleaning up: %s", spec.slug, exc)
        await _safe_cleanup(label_slug, docker, caddy)
        raise


async def _upsert_subdomain(school: School, host: str, db: AsyncSession) -> None:
    result = await db.execute(select(SchoolDomain).where(SchoolDomain.domain == host))
    domain = result.scalar_one_or_none()
    now = datetime.utcnow()
    if domain is None:
        db.add(SchoolDomain(school_id=school.id, domain=host, domain_type="subdomain", status="active", activated_at=now))
    else:
        domain.status = "active"
        domain.activated_at = now


async def provision_school(school: School, db: AsyncSession, settings: Settings | None = None) -> SchoolProvisionOutcome:
    settings = settings or get_settings()
    docker = get_docker_client()
    caddy = get_caddy_admin()
    label_slug = school_label_slug(school.slug)

    secret = await _get_or_create_secret(school, db)
    school.status = "provisioning"
    await db.commit()
    await db.refresh(school)
    await db.refresh(secret)

    spec = build_school_stack_spec(school, secret, settings)
    try:
        outcome = await _bring_up(spec, label_slug, settings, docker, caddy, admin_email=school.admin_email)
    except Exception as exc:
        school.status = "failed"
        await db.commit()
        raise ProvisioningError(str(exc)) from exc

    school.status = "active"
    school.activated_at = datetime.utcnow()
    school.release_tag = settings.TENANT_IMAGE
    await _upsert_subdomain(school, outcome.host, db)
    await db.commit()
    await db.refresh(school)
    outcome.school = school
    return outcome


async def deprovision_school(school: School, db: AsyncSession) -> None:
    docker = get_docker_client()
    caddy = get_caddy_admin()
    await _safe_cleanup(school_label_slug(school.slug), docker, caddy)
    result = await db.execute(select(SchoolDomain).where(SchoolDomain.school_id == school.id))
    for domain in result.scalars().all():
        domain.status = "removed"
    school.status = "archived"
    school.archived_at = datetime.utcnow()
    await db.commit()
    logger.info("school %s: deprovisioned", school.slug)
