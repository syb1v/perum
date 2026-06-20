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
from app.models import Release, School, SchoolDomain, SchoolSecret, UpdateHistory
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
        # Бэкфилл отдельного RPC-токена для школ, заведённых до его появления
        # (AUDIT, isolation #6). До бэкфилла RPC ходит по telemetry_token.
        if not getattr(existing, "internal_rpc_token", None):
            existing.internal_rpc_token = secrets_mod.token_urlsafe(24)
            await db.flush()
        return existing
    secret = SchoolSecret(
        school_id=school.id,
        db_password=secrets_mod.token_urlsafe(24),
        secret_key=secrets_mod.token_urlsafe(36),
        telemetry_token=secrets_mod.token_urlsafe(24),
        internal_rpc_token=secrets_mod.token_urlsafe(24),
        redis_db_index=school.id % REDIS_DB_COUNT,
    )
    db.add(secret)
    await db.flush()
    return secret


def _rpc_headers(spec: StackSpec) -> dict[str, str]:
    """Заголовки авторизации для /internal-RPC. Шлём ОБА токена (ядро знает оба):
    telemetry — чтобы работал старый образ тенанта (проверяет только его), internal
    — для нового образа. Тенант с заданным INTERNAL_RPC_TOKEN принимает ТОЛЬКО его
    (telemetry на /internal не пускает → изоляция). См. perum-tenant/internal/router."""
    h = {"X-Telemetry-Token": spec.telemetry_token}
    if spec.internal_rpc_token:
        h["X-Internal-Token"] = spec.internal_rpc_token
    return h


async def _bootstrap_admin(spec: StackSpec, admin_email: str | None) -> tuple[str | None, str | None]:
    if not admin_email:
        return None, None
    url = f"http://{spec.app_container}:3000/internal/bootstrap-school-admin"
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            url, headers=_rpc_headers(spec), json={"email": admin_email}
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


async def provision_school(school: School, db: AsyncSession, settings: Settings | None = None, image: str | None = None) -> SchoolProvisionOutcome:
    settings = settings or get_settings()
    docker = get_docker_client()
    caddy = get_caddy_admin()
    label_slug = school_label_slug(school.slug)

    secret = await _get_or_create_secret(school, db)
    # На ноде нет таблицы релизов — ядро передаёт целевой образ явно (image).
    target_image = image or await current_release_image(db, settings)
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


async def backup_school_appdata(school: School, settings: Settings | None = None) -> str | None:
    """Бэкап тома вложений школы (appdata: файлы ДЗ и т.п.) в tar.gz перед
    безвозвратным удалением. До этого бэкапился только pg_dump БД, а файлы при
    purge терялись навсегда (AUDIT, lifecycle #3/partial).

    Возвращает путь к архиву; None — если тома нет (вложений не было). Бросает
    исключение, если том ЕСТЬ, но снять архив не удалось (вызывающий не сносит тома)."""
    settings = settings or get_settings()
    docker = get_docker_client()
    appdata_vol = school_appdata_volume_name(school.slug)
    if not await docker.volume_exists(appdata_vol):
        return None  # вложений не было — бэкапить нечего
    # postgres-образ стека уже локально присутствует и содержит tar (alpine).
    tar_image = f"{settings.IMAGE_REGISTRY}/library/postgres:15-alpine"
    data = await docker.backup_volume_tar(appdata_vol, tar_image)
    # Валидируем результат: непустой и валидный gzip (magic 1f 8b). Пустой/битый
    # вывод = сбой бэкапа → бросаем (deprovision деградирует до архивации, тома
    # НЕ сносятся). Даже tar пустого тома даёт валидный gzip-поток (~32 байта).
    if not data or data[:2] != b"\x1f\x8b":
        raise ProvisioningError(
            f"бэкап вложений школы '{school.slug}' пуст или повреждён ({len(data) if data else 0} байт)"
        )
    os.makedirs(settings.BACKUP_DIR, exist_ok=True)
    ts = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    path = os.path.join(settings.BACKUP_DIR, f"school_{school.slug}_appdata_{ts}.tar.gz")
    with open(path, "wb") as fh:
        fh.write(data)
    logger.info("school %s: appdata backup written to %s (%d bytes)", school.slug, path, len(data))
    return path


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
    # Бэкап файлов-вложений (appdata) — тоже ДО сноса. Если том есть, но архив снять
    # не удалось, не уничтожаем данные: деградируем до архивации.
    try:
        await backup_school_appdata(school, settings)
    except Exception as exc:  # noqa: BLE001
        await _archive_only(school, db, docker, caddy)
        raise ProvisioningError(
            f"не удалось снять бэкап вложений школы перед удалением ({exc}) — тома "
            f"сохранены, школа архивирована; повторите удаление"
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


async def update_school(school: School, db: AsyncSession, settings: Settings | None = None, to_image: str | None = None) -> UpdateOutcome:
    """OTA-обновление школьного стека на текущий релиз: pull нового образа +
    пересоздание app-контейнера (том сохраняется) + миграции. При сбое — откат на
    прежний образ. Это и есть «обновление по кнопке» (опт-ин, без принуждения)."""
    settings = settings or get_settings()
    docker = get_docker_client()
    label_slug = school_label_slug(school.slug)

    from_image = school.release_tag or settings.TENANT_IMAGE
    # На ноде нет таблицы релизов — целевой образ передаёт ядро (to_image).
    to_image = to_image or await current_release_image(db, settings)
    if to_image == from_image:
        # Нечего обновлять. Эндпоинт мог уже выставить 'updating' синхронно — вернём
        # школу в 'active', иначе статус «залипнет». Логируем, чтобы был след.
        logger.info("school %s: уже на текущем релизе (%s) — обновление не требуется", school.slug, to_image)
        if school.status != "active":
            school.status = "active"
            await db.commit()
            await db.refresh(school)
        return UpdateOutcome(school=school, from_image=from_image, to_image=to_image)

    history = UpdateHistory(
        school_id=school.id,
        from_version=from_image,
        to_version=to_image,
        status="pending",
    )
    db.add(history)
    await db.flush()

    secret = await db.get(SchoolSecret, school.id)
    if secret is None:
        raise ProvisioningError("school secret missing — школа не была запровижинена")
    if not getattr(secret, "internal_rpc_token", None):
        secret.internal_rpc_token = secrets_mod.token_urlsafe(24)
        await db.commit()
        await db.refresh(secret)
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
            history.status = "failed"
            history.error_message = f"update and rollback failed: {exc}; rollback: {rb}"
            history.completed_at = datetime.utcnow()
            await db.commit()
            raise ProvisioningError(f"update and rollback failed: {exc}; rollback: {rb}") from exc
        school.status = "active"
        history.status = "rolled_back"
        history.error_message = str(exc)
        history.completed_at = datetime.utcnow()
        await db.commit()
        return UpdateOutcome(school=school, from_image=from_image, to_image=from_image, rolled_back=True)

    school.release_tag = to_image
    school.status = "active"
    history.status = "success"
    history.completed_at = datetime.utcnow()
    await db.commit()
    await db.refresh(school)
    logger.info("school %s: updated %s -> %s", school.slug, from_image, to_image)
    return UpdateOutcome(school=school, from_image=from_image, to_image=to_image)


# ============================================================================
# Оркестрация (только на ХОСТЕ ПЛАТФОРМЫ): развернуть/обновить школу ЛОКАЛЬНО или
# УДАЛЁННО на ноде через воркора. Школа едет на ноду, если у неё есть назначение
# (NodeAssignment) или планировщик выбрал активную ноду орг. Иначе — локально.
# ============================================================================


async def _assigned_node(school: School, db: AsyncSession):
    from app.models import Node, NodeAssignment
    a = await db.scalar(select(NodeAssignment).where(NodeAssignment.school_id == school.id))
    return await db.get(Node, a.node_id) if a is not None else None


async def provision_school_orchestrated(school: School, db: AsyncSession, settings: Settings | None = None) -> None:
    settings = settings or get_settings()
    from app.models import NodeAssignment
    from app.services.node_planner import NodePlanner
    from app.services.remote_node_client import RemoteNodeClient, RemoteNodeError

    node = await _assigned_node(school, db)
    if node is None:
        node = await NodePlanner(db).find_best_node(school.org_id)
        if node is not None:
            db.add(NodeAssignment(node_id=node.id, school_id=school.id))
            await db.commit()

    if node is None:
        await provision_school(school, db)  # локально на хосте платформы
        return

    # --- Удалённо на ноде ---
    school.status = "provisioning"
    await db.commit()
    secret = await _get_or_create_secret(school, db)
    await db.commit()
    await db.refresh(secret)
    image = await current_release_image(db, settings)
    req = {
        "school_slug": school.slug, "school_name": school.name, "release_tag": image,
        "db_password": secret.db_password, "secret_key": secret.secret_key,
        "telemetry_token": secret.telemetry_token, "internal_rpc_token": secret.internal_rpc_token,
        "redis_db_index": secret.redis_db_index, "admin_email": school.admin_email,
    }
    try:
        resp = await RemoteNodeClient().provision_school(node, req)
    except RemoteNodeError as exc:
        school.status = "failed"
        await db.commit()
        raise ProvisioningError(f"нода недоступна: {exc}") from exc
    if not resp.get("success"):
        school.status = "failed"
        await db.commit()
        raise ProvisioningError(resp.get("message") or "провижининг на ноде не удался")

    # Маршрут на платформе: <slug>.<base> → /api на воркор ноды (:80), остальное → web.
    # Платформа терминирует TLS (wildcard), нода отдаёт API по plain-HTTP внутри.
    host = f"{school.slug}.{settings.PUBLIC_BASE_DOMAIN}"
    try:
        await get_caddy_admin().add_route(school_label_slug(school.slug), host, f"{node.hostname}:80")
    except Exception as exc:  # noqa: BLE001
        logger.error("school %s: platform route to node failed: %s", school.slug, exc)

    school.status = "active"
    school.activated_at = datetime.utcnow()
    school.release_tag = image
    await _upsert_subdomain(school, host, db)
    await db.commit()
    await db.refresh(school)
    logger.info("school %s: provisioned on node %s (%s)", school.slug, node.name, node.hostname)


async def update_school_orchestrated(school: School, db: AsyncSession, settings: Settings | None = None) -> None:
    settings = settings or get_settings()
    from app.services.remote_node_client import RemoteNodeClient, RemoteNodeError

    node = await _assigned_node(school, db)
    if node is None:
        await update_school(school, db)  # локально
        return

    image = await current_release_image(db, settings)
    from_image = school.release_tag or settings.TENANT_IMAGE
    if image == from_image:
        logger.info("school %s: уже на текущем релизе (%s)", school.slug, image)
        if school.status != "active":
            school.status = "active"
            await db.commit()
        return

    school.status = "updating"
    history = UpdateHistory(school_id=school.id, from_version=from_image, to_version=image, status="pending")
    db.add(history)
    await db.commit()

    try:
        resp = await RemoteNodeClient().update_school(node, {
            "school_slug": school.slug, "image": image,
            "from_version": from_image, "to_version": image,
        })
    except RemoteNodeError as exc:
        school.status = "active"
        history.status = "failed"
        history.error_message = f"нода недоступна: {exc}"
        history.completed_at = datetime.utcnow()
        await db.commit()
        return

    rolled_back = bool(resp.get("rolled_back"))
    if resp.get("success") and not rolled_back:
        school.release_tag = image
        school.status = "active"
        history.status = "success"
    else:
        school.status = "active"
        history.status = "rolled_back" if rolled_back else "failed"
        history.error_message = resp.get("message")
    history.completed_at = datetime.utcnow()
    await db.commit()
    await db.refresh(school)
    logger.info("school %s: node update -> %s (%s)", school.slug, image, history.status)
