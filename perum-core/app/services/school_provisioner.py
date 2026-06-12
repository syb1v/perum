"""Provision / deprovision a per-SCHOOL stack (архитектура v2, см. ARCH_ORG_NODE.md).

Зеркало `tenant_provisioner`, но юнит — школа: контейнеры `school_<slug>_*`, том
`school_<slug>_data`, маршрут `<slug>.<base-domain>`. Docker/Caddy-ресурсы
помечаются namespaced-лейблом `sch-<slug>` (через `school_label_slug`), чтобы не
пересекаться с орг-стеками. Образ — текущий tenant (на Этапе 3 станет «одна школа»).
"""

from __future__ import annotations

import logging
import os
import secrets as secrets_mod
from dataclasses import dataclass
from datetime import datetime

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.docker_client import DockerClient, HealthSpec, get_docker_client
from app.models import Release, School, SchoolDomain, SchoolSecret
from app.services.caddy_admin import CaddyAdmin, get_caddy_admin
from app.services.stack_spec import (
    StackSpec,
    build_school_stack_spec,
    school_appdata_volume_name,
    school_container_name,
    school_label_slug,
    school_volume_name,
)

_APP_DATA_BIND = "/app/data"  # сюда tenant пишет вложения (UPLOAD_DIR=data/uploads/...)
from app.services.tenant_provisioner import ProvisioningError

logger = logging.getLogger("perum.school_provisioner")

REDIS_DB_COUNT = 16


async def current_release_image(db: AsyncSession, settings: Settings, channel: str = "stable") -> str:
    """Образ текущего релиза канала; fallback — settings.TENANT_IMAGE."""
    rel = (
        await db.execute(
            select(Release).where(Release.channel == channel, Release.is_current.is_(True)).limit(1)
        )
    ).scalar_one_or_none()
    if rel and (rel.image or rel.version_tag):
        return rel.image or rel.version_tag
    return settings.TENANT_IMAGE


# Явный healthcheck приложения школы. Tenant-образ и так несёт HEALTHCHECK
# (curl /health), но задаём его в спеке стека, чтобы wait_for_healthy был
# осмысленным для ЛЮБОГО релизного образа, а не полагался на инструкцию в нём.
# 127.0.0.1 (а не localhost) — чтобы не наступить на IPv6-баг (как у perum_web).
_APP_HEALTH = HealthSpec(
    test=["CMD-SHELL", "curl -fsS http://127.0.0.1:3000/health || exit 1"],
    interval_s=5.0, timeout_s=3.0, retries=12, start_period_s=5.0,
)


def _app_run_kwargs(spec: StackSpec, label_slug: str):
    return dict(
        name=spec.app_container, image=spec.tenant_image, slug=label_slug, role="app",
        environment=spec.app_env, network=spec.network, health=_APP_HEALTH,
        volumes={school_appdata_volume_name(spec.slug): {"bind": _APP_DATA_BIND, "mode": "rw"}},
    )


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
    url = f"http://{spec.app_container}:3000/internal/bootstrap-school-admin"
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

        # Том для файлов приложения (вложения) — переживает OTA-пересоздание app.
        await docker.create_volume(school_appdata_volume_name(spec.slug), slug=label_slug)
        await docker.run_container(**_app_run_kwargs(spec, label_slug))
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
    target_image = await current_release_image(db, settings)
    school.status = "provisioning"
    await db.commit()
    await db.refresh(school)
    await db.refresh(secret)

    spec = build_school_stack_spec(school, secret, settings, image=target_image)
    try:
        outcome = await _bring_up(spec, label_slug, settings, docker, caddy, admin_email=school.admin_email)
    except Exception as exc:
        school.status = "failed"
        await db.commit()
        raise ProvisioningError(str(exc)) from exc

    school.status = "active"
    school.activated_at = datetime.utcnow()
    school.release_tag = target_image
    await _upsert_subdomain(school, outcome.host, db)
    await db.commit()
    await db.refresh(school)
    outcome.school = school
    return outcome


async def _ensure_school_db_up(school: School, db: AsyncSession, settings: Settings, docker: DockerClient) -> bool:
    """Гарантировать живой контейнер БД школы для снятия pg_dump перед purge.

    Контейнер БД может быть: запущен (active), остановлен (suspended) или удалён
    при сохранённом томе (archived). Поднимаем/пересоздаём из тома соответственно.
    Возвращает True, если БД доступна для дампа."""
    label_slug = school_label_slug(school.slug)
    db_container = school_container_name(school.slug, "db")
    secret = await db.get(SchoolSecret, school.id)
    if secret is None:
        return False
    if await docker.container_exists(db_container):
        await docker.start_containers(label_slug)  # на случай suspended (остановлен)
    elif await docker.volume_exists(school_volume_name(school.slug)):
        # archived: контейнера нет, но том с данными жив — пересоздаём БД на нём.
        spec = build_school_stack_spec(school, secret, settings)
        try:
            await docker.ensure_network(spec.network)
            await docker.run_container(
                name=spec.db_container, image=spec.postgres_image, slug=label_slug, role="db",
                environment={"POSTGRES_USER": "perum", "POSTGRES_PASSWORD": spec.db_password, "POSTGRES_DB": "perum"},
                volumes={spec.volume: {"bind": "/var/lib/postgresql/data", "mode": "rw"}},
                health=HealthSpec(test=["CMD-SHELL", "pg_isready -U perum -d perum"]),
                network=spec.network,
            )
        except Exception as exc:  # noqa: BLE001
            logger.error("school %s: backup db recreate failed: %s", school.slug, exc)
            return False
    else:
        return False  # ни контейнера, ни тома — бэкапить нечего
    try:
        await docker.wait_for_healthy(db_container, timeout_s=settings.DB_HEALTH_TIMEOUT_S)
    except Exception as exc:  # noqa: BLE001
        logger.error("school %s: backup db not healthy: %s", school.slug, exc)
        return False
    return True


async def backup_school_db(school: School, settings: Settings | None = None) -> str | None:
    """pg_dump БД школы перед безвозвратным удалением. Контейнер БД должен быть
    поднят заранее (_ensure_school_db_up). Возвращает путь к дампу или None."""
    settings = settings or get_settings()
    docker = get_docker_client()
    db_container = school_container_name(school.slug, "db")
    try:
        code, out = await docker.exec(db_container, ["pg_dump", "-U", "perum", "-d", "perum"])
        if code != 0:
            logger.error("school %s: pg_dump failed (exit %s): %s", school.slug, code, out[-500:])
            return None
        os.makedirs(settings.BACKUP_DIR, exist_ok=True)
        ts = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
        path = os.path.join(settings.BACKUP_DIR, f"school_{school.slug}_{ts}.sql")
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(out)
        logger.info("school %s: backup written to %s (%d bytes)", school.slug, path, len(out))
        return path
    except Exception as exc:  # noqa: BLE001
        logger.error("school %s: backup failed: %s", school.slug, exc)
        return None


async def _archive_only(school: School, db: AsyncSession, docker: DockerClient, caddy: CaddyAdmin) -> None:
    """Снять контейнеры+маршрут, СОХРАНИТЬ тома, пометить школу archived."""
    label_slug = school_label_slug(school.slug)
    try:
        await docker.remove_containers(label_slug)
    except Exception as exc:  # noqa: BLE001
        logger.error("school %s: archive remove_containers failed: %s", label_slug, exc)
    try:
        await caddy.remove_route(label_slug)
    except Exception as exc:  # noqa: BLE001
        logger.error("school %s: archive remove_route failed: %s", label_slug, exc)
    result = await db.execute(select(SchoolDomain).where(SchoolDomain.school_id == school.id))
    for domain in result.scalars().all():
        domain.status = "removed"
    school.status = "archived"
    school.archived_at = datetime.utcnow()
    await db.commit()


async def deprovision_school(school: School, db: AsyncSession, *, purge: bool = False) -> None:
    """Двухфазное снятие школы.

    purge=False (архивация) — сносим КОНТЕЙНЕРЫ, но СОХРАНЯЕМ тома данных: школу
    можно поднять обратно reprovision'ом без потери данных.
    purge=True — снимаем pg_dump (подняв БД из тома при необходимости), затем
    удаляем стек ВМЕСТЕ С ТОМАМИ (необратимо). ВАЖНО: если бэкап снять не удалось,
    тома НЕ удаляются (школа остаётся archived) — иначе была бы молчаливая потеря
    данных при purge замороженной/архивной школы."""
    settings = get_settings()
    docker = get_docker_client()
    caddy = get_caddy_admin()
    label_slug = school_label_slug(school.slug)

    if not purge:
        await _archive_only(school, db, docker, caddy)
        logger.info("school %s: archived (тома сохранены)", school.slug)
        return

    # purge: гарантируем доступную БД и снимаем бэкап ДО сноса томов.
    db_ok = await _ensure_school_db_up(school, db, settings, docker)
    backup_path = await backup_school_db(school) if db_ok else None
    if backup_path is None:
        # Бэкап не удался — НЕ сносим тома. Деградируем до архивации и сообщаем.
        await _archive_only(school, db, docker, caddy)
        raise ProvisioningError(
            "не удалось снять бэкап БД школы перед удалением — тома сохранены, "
            "школа архивирована; поднимите её (reprovision/unsuspend) и повторите удаление"
        )
    await _safe_cleanup(label_slug, docker, caddy)  # сносит контейнеры И тома
    result = await db.execute(select(SchoolDomain).where(SchoolDomain.school_id == school.id))
    for domain in result.scalars().all():
        domain.status = "removed"
    school.status = "archived"
    school.archived_at = datetime.utcnow()
    await db.commit()
    logger.info("school %s: purged (бэкап: %s)", school.slug, backup_path)


async def suspend_school(school: School, db: AsyncSession, settings: Settings | None = None, *, reason: str = "manual") -> None:
    """Заморозить школу: остановить контейнеры (том сохранён), маршрут → 503
    «приостановлено». Идемпотентно. `reason`: 'manual' (org_admin вручную) или
    'org' (каскад при заморозке организации) — влияет на каскадную разморозку."""
    settings = settings or get_settings()
    docker = get_docker_client()
    caddy = get_caddy_admin()
    label_slug = school_label_slug(school.slug)
    host = f"{school.slug}.{settings.PUBLIC_BASE_DOMAIN}"
    try:
        await docker.stop_containers(label_slug)
    except Exception as exc:  # noqa: BLE001
        logger.error("school %s: suspend stop_containers failed: %s", school.slug, exc)
    try:
        await caddy.add_maintenance_route(label_slug, host)
    except Exception as exc:  # noqa: BLE001
        logger.error("school %s: suspend maintenance route failed: %s", school.slug, exc)
    school.status = "suspended"
    school.suspended_at = datetime.utcnow()
    # Не перетираем 'manual' каскадным 'org': вручную замороженная школа при
    # разморозке орг останется замороженной.
    if not (reason == "org" and school.suspended_by == "manual"):
        school.suspended_by = reason
    await db.commit()
    logger.info("school %s: suspended (reason=%s)", school.slug, reason)


async def unsuspend_school(school: School, db: AsyncSession, settings: Settings | None = None) -> None:
    """Разморозить школу: поднять контейнеры, дождаться здоровья app, вернуть
    нормальный маршрут (/api → стек школы, UI → веб)."""
    settings = settings or get_settings()
    docker = get_docker_client()
    caddy = get_caddy_admin()
    label_slug = school_label_slug(school.slug)
    host = f"{school.slug}.{settings.PUBLIC_BASE_DOMAIN}"
    app_container = school_container_name(school.slug, "app")
    await docker.start_containers(label_slug)
    try:
        await docker.wait_for_healthy(app_container, timeout_s=settings.APP_HEALTH_TIMEOUT_S)
    except Exception as exc:  # noqa: BLE001
        logger.warning("school %s: unsuspend health wait failed (%s) — маршрут всё равно ставим", school.slug, exc)
    await caddy.add_route(label_slug, host, f"{app_container}:3000")
    school.status = "active"
    school.suspended_at = None
    school.suspended_by = None
    await db.commit()
    logger.info("school %s: unsuspended", school.slug)


@dataclass
class UpdateOutcome:
    school: School
    from_image: str
    to_image: str
    rolled_back: bool = False


async def _swap_app(spec: StackSpec, label_slug: str, image: str, settings: Settings, docker: DockerClient) -> None:
    """Пересоздать ТОЛЬКО app-контейнер на заданном образе + прогнать миграции.
    БД и её том не трогаются (volume-preserving)."""
    spec.tenant_image = image
    await docker.ensure_image(image)
    await docker.remove_container(spec.app_container)
    await docker.run_container(**_app_run_kwargs(spec, label_slug))
    await docker.wait_for_healthy(spec.app_container, timeout_s=settings.APP_HEALTH_TIMEOUT_S)
    code, out = await docker.exec(spec.app_container, ["alembic", "upgrade", "head"], workdir="/app")
    if code != 0:
        raise ProvisioningError(f"alembic upgrade failed (exit {code}):\n{out[-2000:]}")


async def update_school(school: School, db: AsyncSession, settings: Settings | None = None) -> UpdateOutcome:
    """OTA-обновление школьного стека на текущий релиз: pull нового образа +
    пересоздание app-контейнера (том сохраняется) + миграции. При сбое — откат на
    прежний образ. Это и есть «обновление по кнопке» (опт-ин, без принуждения)."""
    settings = settings or get_settings()
    docker = get_docker_client()
    label_slug = school_label_slug(school.slug)

    from_image = school.release_tag or settings.TENANT_IMAGE
    to_image = await current_release_image(db, settings)
    if to_image == from_image:
        return UpdateOutcome(school=school, from_image=from_image, to_image=to_image)

    secret = await db.get(SchoolSecret, school.id)
    if secret is None:
        raise ProvisioningError("school secret missing — школа не была запровижинена")
    spec = build_school_stack_spec(school, secret, settings, image=to_image)

    school.status = "updating"
    await db.commit()
    try:
        await _swap_app(spec, label_slug, to_image, settings, docker)
    except Exception as exc:
        logger.warning("school %s: update to %s failed (%s) — откат на %s", school.slug, to_image, exc, from_image)
        try:
            await _swap_app(spec, label_slug, from_image, settings, docker)
        except Exception as rb:  # noqa: BLE001
            logger.error("school %s: ROLLBACK to %s also failed: %s", school.slug, from_image, rb)
            school.status = "failed"
            await db.commit()
            raise ProvisioningError(f"update and rollback failed: {exc}; rollback: {rb}") from exc
        school.status = "active"
        await db.commit()
        return UpdateOutcome(school=school, from_image=from_image, to_image=from_image, rolled_back=True)

    school.release_tag = to_image
    school.status = "active"
    await db.commit()
    await db.refresh(school)
    logger.info("school %s: updated %s -> %s", school.slug, from_image, to_image)
    return UpdateOutcome(school=school, from_image=from_image, to_image=to_image)
