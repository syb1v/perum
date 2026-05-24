"""Provision (and deprovision) a per-org tenant stack.

Implements PROVISIONING.md steps for Phase 1: generate secrets (3), bring up the
db + app containers via the Docker SDK (5), wait for health (6), run alembic
migrations (7), register the Caddy route (10), finalize status (11). Seeding (8)
and org_admin bootstrap (9) arrive with Phase 2.

The provisioning routine is a standalone async function so it can later move
behind a background task / queue; for Phase 1 the create handler awaits it
directly and returns the final org state.
"""

from __future__ import annotations

import logging
import secrets as secrets_mod
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.docker_client import DockerClient, HealthSpec, get_docker_client
from app.models import Organization, OrganizationDomain, OrganizationSecret
from app.services.caddy_admin import CaddyAdmin, get_caddy_admin
from app.services.stack_spec import StackSpec, build_stack_spec

logger = logging.getLogger("perum.provisioner")

REDIS_DB_COUNT = 16  # Redis ships with logical DBs 0..15


class ProvisioningError(RuntimeError):
    pass


async def _get_or_create_secret(
    org: Organization, db: AsyncSession
) -> OrganizationSecret:
    existing = await db.get(OrganizationSecret, org.id)
    if existing is not None:
        return existing
    secret = OrganizationSecret(
        org_id=org.id,
        db_password=secrets_mod.token_urlsafe(24),
        secret_key=secrets_mod.token_urlsafe(36),
        telemetry_token=secrets_mod.token_urlsafe(24),
        redis_db_index=org.id % REDIS_DB_COUNT,
    )
    db.add(secret)
    await db.flush()
    return secret


async def _bring_up_stack(
    spec: StackSpec, settings: Settings, docker: DockerClient, caddy: CaddyAdmin
) -> str:
    """Create the stack and return the routed host. Cleans up on failure."""
    try:
        await docker.ensure_network(spec.network)
        await docker.ensure_image(spec.postgres_image)
        await docker.ensure_image(spec.tenant_image)

        # Defensive clean slate (a prior failed attempt may have left containers).
        await docker.remove_containers(spec.slug)

        # --- Postgres ---
        await docker.create_volume(spec.volume, slug=spec.slug)
        await docker.run_container(
            name=spec.db_container,
            image=spec.postgres_image,
            slug=spec.slug,
            role="db",
            environment={
                "POSTGRES_USER": "perum",
                "POSTGRES_PASSWORD": spec.db_password,
                "POSTGRES_DB": "perum",
            },
            volumes={spec.volume: {"bind": "/var/lib/postgresql/data", "mode": "rw"}},
            health=HealthSpec(test=["CMD-SHELL", "pg_isready -U perum -d perum"]),
            network=spec.network,
        )
        await docker.wait_for_healthy(
            spec.db_container, timeout_s=settings.DB_HEALTH_TIMEOUT_S
        )
        logger.info("org %s: db healthy", spec.slug)

        # --- Tenant app (relies on the image's HEALTHCHECK) ---
        await docker.run_container(
            name=spec.app_container,
            image=spec.tenant_image,
            slug=spec.slug,
            role="app",
            environment=spec.app_env,
            network=spec.network,
        )
        await docker.wait_for_healthy(
            spec.app_container, timeout_s=settings.APP_HEALTH_TIMEOUT_S
        )
        logger.info("org %s: app healthy", spec.slug)

        # --- Migrations ---
        code, out = await docker.exec(
            spec.app_container, ["alembic", "upgrade", "head"], workdir="/app"
        )
        if code != 0:
            raise ProvisioningError(
                f"alembic upgrade failed (exit {code}):\n{out[-2000:]}"
            )
        logger.info("org %s: migrations applied", spec.slug)

        # --- Caddy route ---
        host = f"{spec.slug}.{settings.PUBLIC_BASE_DOMAIN}"
        await caddy.add_route(spec.slug, host, f"{spec.app_container}:3000")
        logger.info("org %s: route %s -> %s:3000 added", spec.slug, host, spec.app_container)
        return host
    except Exception as exc:
        logger.warning("org %s: provisioning failed, cleaning up: %s", spec.slug, exc)
        await _safe_cleanup(spec.slug, docker, caddy)
        raise


async def _safe_cleanup(slug: str, docker: DockerClient, caddy: CaddyAdmin) -> None:
    try:
        await docker.remove_stack(slug)
    except Exception as exc:  # noqa: BLE001
        logger.error("org %s: cleanup remove_stack failed: %s", slug, exc)
    try:
        await caddy.remove_route(slug)
    except Exception as exc:  # noqa: BLE001
        logger.error("org %s: cleanup remove_route failed: %s", slug, exc)


async def _upsert_subdomain(
    org: Organization, host: str, db: AsyncSession
) -> None:
    result = await db.execute(
        select(OrganizationDomain).where(OrganizationDomain.domain == host)
    )
    domain = result.scalar_one_or_none()
    now = datetime.utcnow()
    if domain is None:
        db.add(
            OrganizationDomain(
                org_id=org.id,
                domain=host,
                domain_type="subdomain",
                status="active",
                activated_at=now,
            )
        )
    else:
        domain.status = "active"
        domain.activated_at = now


async def provision(
    org: Organization,
    db: AsyncSession,
    settings: Settings | None = None,
) -> Organization:
    """Full provisioning flow with control-DB bookkeeping.

    Mutates and commits the org's status: provisioning → active (or failed).
    Raises ProvisioningError on failure (org left in `failed`, resources cleaned).
    """
    settings = settings or get_settings()
    docker = get_docker_client()
    caddy = get_caddy_admin()

    secret = await _get_or_create_secret(org, db)
    org.status = "provisioning"
    await db.commit()
    await db.refresh(org)
    await db.refresh(secret)

    spec = build_stack_spec(org, secret, settings)

    try:
        host = await _bring_up_stack(spec, settings, docker, caddy)
    except Exception as exc:
        org.status = "failed"
        await db.commit()
        raise ProvisioningError(str(exc)) from exc

    org.status = "active"
    org.activated_at = datetime.utcnow()
    await _upsert_subdomain(org, host, db)
    await db.commit()
    await db.refresh(org)
    logger.info("org %s: provisioned and active at %s", org.slug, host)
    return org


async def deprovision(org: Organization, db: AsyncSession) -> None:
    """Tear down an org's stack + route and mark domains removed.

    Removes containers AND the data volume. The org row itself is kept (status
    archived) for audit; the caller decides whether to delete it.
    """
    docker = get_docker_client()
    caddy = get_caddy_admin()
    await _safe_cleanup(org.slug, docker, caddy)

    result = await db.execute(
        select(OrganizationDomain).where(OrganizationDomain.org_id == org.id)
    )
    for domain in result.scalars().all():
        domain.status = "removed"
    org.status = "archived"
    org.archived_at = datetime.utcnow()
    await db.commit()
    logger.info("org %s: deprovisioned", org.slug)
