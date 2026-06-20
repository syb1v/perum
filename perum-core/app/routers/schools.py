"""Школы организации — эндпоинты org_admin (архитектура v2, см. ARCH_ORG_NODE.md).

org_admin провижинит/останавливает школы СВОЕЙ орг (каждая — отдельный стек) и
получает одноразовую учётку администратора школы. Скоуп — строго `org_id` из токена.
Внутрь школьных данных ядро/org_admin не лезет — только метаданные стека.
"""

from __future__ import annotations

import asyncio
import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field, field_validator

from datetime import datetime

from app.core.config import get_settings
from app.core.db import SessionLocal, get_db
from app.core.deps import require_billing_ok, require_org_admin
from app.core.locks import keyed_lock, org_create_key, school_key
from app.models import Node, NodeAssignment, OrgAdmin, Organization, Release, School, SchoolDomain, SchoolMetric, SchoolSecret, UpdateHistory
from app.schemas.organization import RESERVED_SLUGS, SLUG_PATTERN
from app.services.billing import billing_state, get_or_create_subscription, plan_price, school_limit
from app.services.stats import rollup, school_stat, schools_with_metrics
from app.services.caddy_admin import get_caddy_admin
from app.services.stack_spec import school_container_name
from app.services.school_provisioner import (
    current_release_image,
    deprovision_school,
    provision_school,
    provision_school_orchestrated,
    suspend_school,
    unsuspend_school,
    update_school,
    update_school_orchestrated,
)
from app.services.tenant_provisioner import ProvisioningError

logger = logging.getLogger("perum.schools")

# Defense-in-depth (#10): гард висит на самом роутере, а не только на include_router
# в main.py. Если kwarg при монтировании потеряют, весь жизненный цикл школ всё
# равно останется за require_org_admin. FastAPI кеширует под-зависимость в рамках
# запроса, поэтому повтор гарда не делает лишних обращений к БД.
router = APIRouter(dependencies=[Depends(require_org_admin)])

BLOCKING = {"active", "provisioning", "suspended"}


class SchoolCreate(BaseModel):
    slug: str = Field(min_length=3, max_length=40)
    name: str = Field(min_length=2, max_length=255)
    admin_email: str | None = None

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, v: str) -> str:
        # Slug школы напрямую формирует хост `<slug>.<base>` и Caddy-маршрут
        # (terminal, index 0). Без этой проверки org_admin мог завести школу со
        # slug='admin'/'api' и перехватить хост платформы. Тот же контракт, что
        # и у организаций (см. app/schemas/organization.py).
        v = v.strip().lower()
        if v in RESERVED_SLUGS:
            raise ValueError(f"slug '{v}' зарезервирован")
        if not SLUG_PATTERN.match(v):
            raise ValueError(
                "slug: строчные латинские буквы/цифры/дефис, начинается с буквы, "
                "заканчивается буквой или цифрой, длина 3-40"
            )
        return v


class DomainCreate(BaseModel):
    domain: str


def _school_dict(s: School) -> dict:
    return {
        "id": s.id,
        "org_id": s.org_id,
        "slug": s.slug,
        "name": s.name,
        "status": s.status,
        "release_tag": s.release_tag,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "activated_at": s.activated_at.isoformat() if s.activated_at else None,
        "suspended_at": s.suspended_at.isoformat() if s.suspended_at else None,
    }


class SchoolPatch(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=255)
    admin_email: str | None = None


async def _get_school(school_id: int, admin: OrgAdmin, db: AsyncSession) -> School:
    s = await db.get(School, school_id)
    if s is None or s.org_id != admin.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "школа не найдена")
    return s


# ---------------------------------------------------------------------------
# Async-провижининг (#1): create/reprovision/update возвращают 202 сразу, а
# долгая docker-цепочка (pull → health → миграции → seed) идёт ФОНОВОЙ задачей со
# своей сессией БД под per-school локом. Раньше запрос висел десятки секунд–минуты
# под риском таймаута прокси (AUDIT, lifecycle #1). Статус школы (provisioning →
# active/failed) фронт отслеживает поллингом; одноразовый пароль администратора
# больше не возвращается в ответе create — его выдаёт раздел «Админы» (reset-
# password) после активации школы.
# ---------------------------------------------------------------------------
_bg_tasks: set[asyncio.Task] = set()


async def _run_lifecycle(school_id: int, action: str) -> None:
    async with keyed_lock(school_key(school_id)):
        async with SessionLocal() as bg_db:
            school = await bg_db.get(School, school_id)
            if school is None:
                logger.error("background %s: school %s исчезла", action, school_id)
                return
            try:
                if action == "update":
                    await update_school_orchestrated(school, bg_db)
                else:
                    await provision_school_orchestrated(school, bg_db)
            except ProvisioningError as exc:
                # provision_school/update_school уже выставили status='failed' и
                # закоммитили — здесь только лог.
                logger.warning("background %s school %s failed: %s", action, school.slug, exc)
            except Exception as exc:  # noqa: BLE001
                logger.error("background %s school %s crashed: %s", action, school.slug, exc)


def _schedule_lifecycle(school_id: int, action: str) -> None:
    """Запустить фоновую docker-операцию, удержав ссылку на задачу (иначе GC)."""
    t = asyncio.create_task(_run_lifecycle(school_id, action))
    _bg_tasks.add(t)
    t.add_done_callback(_bg_tasks.discard)


@router.get("")
async def list_schools(admin: OrgAdmin = Depends(require_org_admin), db: AsyncSession = Depends(get_db)) -> dict:
    rows = (
        await db.execute(select(School).where(School.org_id == admin.org_id).order_by(School.id))
    ).scalars().all()

    # Связка с нодами из ядра: какая школа на каком сервере (одним запросом).
    node_map: dict[int, tuple[str, str]] = {}
    if rows:
        node_rows = (
            await db.execute(
                select(NodeAssignment.school_id, Node.name, Node.hostname)
                .join(Node, Node.id == NodeAssignment.node_id)
                .where(NodeAssignment.school_id.in_([s.id for s in rows]))
            )
        ).all()
        node_map = {sid: (nname, nhost) for sid, nname, nhost in node_rows}

    out = []
    for s in rows:
        d = _school_dict(s)
        nm = node_map.get(s.id)
        d["node_name"] = nm[0] if nm else None
        d["node_hostname"] = nm[1] if nm else None
        out.append(d)
    return {"schools": out}


async def _enforce_school_limit(db: AsyncSession, org_id: int) -> None:
    """402, если число активных (не-archived) школ орг уже на лимите.
    Проверяет оба лимита: из плана (PLAN_SCHOOL_LIMITS) и из org.max_schools.
    Вызывается при ЛЮБОЙ операции, увеличивающей число активных школ: создание
    новой, возрождение archived-школы, reprovision archived. Закрывает обход
    лимита через delete-без-purge → reuse (AUDIT_2026-06-12)."""
    org = await db.get(Organization, org_id)
    plan_limit = school_limit(org.plan if org else "trial")
    org_limit = org.max_schools if org else 5
    limit = min(plan_limit, org_limit)
    used = int(await db.scalar(
        select(func.count(School.id)).where(School.org_id == org_id, School.status != "archived")
    ) or 0)
    if used >= limit:
        raise HTTPException(
            status.HTTP_402_PAYMENT_REQUIRED,
            f"достигнут лимит школ ({used}/{limit}). Повысьте план или обратитесь к администратору.",
        )


@router.post("", status_code=status.HTTP_202_ACCEPTED)
async def create_school(
    payload: SchoolCreate,
    admin: OrgAdmin = Depends(require_billing_ok),
    db: AsyncSession = Depends(get_db),
) -> dict:
    # Лок орг делает «проверку лимита плана + вставку строки» атомарными: иначе два
    # параллельных create могли оба пройти проверку (used<limit) до вставки и
    # превысить оплаченный лимит (AUDIT, lifecycle-low).
    async with keyed_lock(org_create_key(admin.org_id)):
        existing = (await db.execute(select(School).where(School.slug == payload.slug))).scalar_one_or_none()
        if existing is not None and existing.status in BLOCKING:
            raise HTTPException(status.HTTP_409_CONFLICT, f"школа '{payload.slug}' уже существует (status={existing.status})")

        if existing is not None and existing.org_id == admin.org_id:
            # Возрождение archived-школы увеличивает число активных → проверяем лимит.
            if existing.status == "archived":
                await _enforce_school_limit(db, admin.org_id)
            school = existing
            school.name = payload.name
            school.admin_email = payload.admin_email
            school.status = "provisioning"
        elif existing is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, f"slug '{payload.slug}' занят другой организацией")
        else:
            await _enforce_school_limit(db, admin.org_id)
            school = School(
                org_id=admin.org_id, slug=payload.slug, name=payload.name,
                admin_email=payload.admin_email, status="provisioning",
            )
            db.add(school)
        await db.commit()
        await db.refresh(school)

    # Провижининг (десятки секунд–минуты) уходит в фон → отвечаем 202 сразу.
    _schedule_lifecycle(school.id, "provision")
    return {
        "school": _school_dict(school),
        "status": "provisioning",
        "message": "школа создаётся в фоне; следите за статусом. Пароль администратора "
                   "выдайте после активации в разделе «Админы» (сбросить пароль).",
    }


@router.get("/billing")
async def org_billing(admin: OrgAdmin = Depends(require_org_admin), db: AsyncSession = Depends(get_db)) -> dict:
    """Биллинг своей организации для org_admin (read-only): план, лимит/использование,
    подписка (триал/оплачено-до/просрочка). Сменить план/оплатить — через platform_admin."""
    org = await db.get(Organization, admin.org_id)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "организация не найдена")
    sub = await get_or_create_subscription(db, org)
    used = int(await db.scalar(
        select(func.count(School.id)).where(School.org_id == org.id, School.status != "archived")
    ) or 0)
    limit = school_limit(org.plan)
    return {
        "plan": org.plan,
        "price_rub_month": plan_price(org.plan),
        "school_limit": limit,
        "schools_used": used,
        "schools_remaining": max(limit - used, 0),
        "subscription": billing_state(sub, datetime.utcnow()),
    }


@router.get("/stats/overview")
async def org_schools_stats(admin: OrgAdmin = Depends(require_org_admin), db: AsyncSession = Depends(get_db)) -> dict:
    """Статистика org_admin: сводка по своим школам + разбивка по каждой (R5).
    Данные — из снимков телеметрии; org_admin внутрь школ при этом не заходит."""
    rows = await schools_with_metrics(db, org_id=admin.org_id)
    agg, schools = rollup(rows, datetime.utcnow())
    return {**agg, "schools": schools}


@router.get("/{school_id}")
async def get_school(school_id: int, admin: OrgAdmin = Depends(require_org_admin), db: AsyncSession = Depends(get_db)) -> dict:
    return _school_dict(await _get_school(school_id, admin, db))


@router.get("/{school_id}/stats")
async def school_stats_endpoint(school_id: int, admin: OrgAdmin = Depends(require_org_admin), db: AsyncSession = Depends(get_db)) -> dict:
    """Статистика одной школы (метаданные + снимок телеметрии)."""
    school = await _get_school(school_id, admin, db)
    metric = await db.get(SchoolMetric, school.id)
    return school_stat(school, metric, datetime.utcnow())


@router.post("/{school_id}/reprovision", status_code=status.HTTP_202_ACCEPTED)
async def reprovision_school(school_id: int, admin: OrgAdmin = Depends(require_billing_ok), db: AsyncSession = Depends(get_db)) -> dict:
    school = await _get_school(school_id, admin, db)
    if school.status == "suspended":
        raise HTTPException(status.HTTP_409_CONFLICT, "школа заморожена — сначала разморозьте её")
    # Проверку лимита (для возрождения archived) и пометку статуса делаем синхронно
    # под локом орг — чтобы клиент сразу получил 402 при превышении, а не «в фоне».
    async with keyed_lock(org_create_key(admin.org_id)):
        if school.status == "archived":
            await _enforce_school_limit(db, admin.org_id)
        school.status = "provisioning"
        await db.commit()
        await db.refresh(school)
    _schedule_lifecycle(school.id, "provision")
    return {"school": _school_dict(school), "status": "provisioning", "message": "переустановка запущена в фоне"}


@router.get("/{school_id}/update-status")
async def update_status(school_id: int, admin: OrgAdmin = Depends(require_org_admin), db: AsyncSession = Depends(get_db)) -> dict:
    school = await _get_school(school_id, admin, db)
    settings = get_settings()
    latest = await current_release_image(db, settings)
    rel = (
        await db.execute(select(Release).where(Release.channel == "stable", Release.is_current.is_(True)).limit(1))
    ).scalar_one_or_none()
    # Семвер текущей версии школы: ищем релиз по образу, на котором она крутится
    # (release_tag хранит образ git-<sha>; version_tag — человеческая версия x.y.z).
    cur_rel = None
    if school.release_tag:
        cur_rel = (
            await db.execute(select(Release).where(Release.image == school.release_tag).limit(1))
        ).scalar_one_or_none()
    # Итог последней попытки обновления — чтобы org_admin видел, ПОЧЕМУ не обновилось
    # (раньше при откате не было видно ничего: «вернулось в исходное, ни логов»).
    last = (
        await db.execute(
            select(UpdateHistory).where(UpdateHistory.school_id == school.id).order_by(UpdateHistory.started_at.desc()).limit(1)
        )
    ).scalar_one_or_none()
    return {
        "school_id": school.id,
        "current_tag": school.release_tag,
        "current_version": cur_rel.version_tag if cur_rel else None,
        "latest_image": latest,
        "latest_version": rel.version_tag if rel else None,
        "changelog": rel.changelog if rel else None,
        "update_available": bool(school.release_tag and school.release_tag != latest),
        "last_update": {
            "status": last.status,
            "to_version": last.to_version,
            "error": last.error_message,
            "completed_at": last.completed_at.isoformat() if last.completed_at else None,
        } if last else None,
    }


@router.post("/{school_id}/update", status_code=status.HTTP_202_ACCEPTED)
async def update_school_endpoint(school_id: int, admin: OrgAdmin = Depends(require_org_admin), db: AsyncSession = Depends(get_db)) -> dict:
    """Обновление школьного стека «по кнопке» на текущий релиз (volume-preserving).
    Идёт в фоне (#1): статус 'updating' → 'active'/'failed', фронт отслеживает поллингом."""
    school = await _get_school(school_id, admin, db)
    if school.status == "suspended":
        raise HTTPException(status.HTTP_409_CONFLICT, "школа заморожена — сначала разморозьте её")
    if school.status != "active":
        raise HTTPException(status.HTTP_409_CONFLICT, f"школу в статусе '{school.status}' нельзя обновлять")
    # Помечаем 'updating' СИНХРОННО и коммитим — иначе фронт-поллинг не видит
    # переходного статуса и кажется, что «ничего не произошло» (школа осталась active).
    school.status = "updating"
    await db.commit()
    await db.refresh(school)
    _schedule_lifecycle(school.id, "update")
    return {"school": _school_dict(school), "status": "updating", "message": "обновление запущено в фоне"}


@router.patch("/{school_id}")
async def patch_school(
    school_id: int, payload: SchoolPatch,
    admin: OrgAdmin = Depends(require_org_admin), db: AsyncSession = Depends(get_db),
) -> dict:
    """Редактирование метаданных школы (имя/admin_email) без пересоздания стека."""
    school = await _get_school(school_id, admin, db)
    if payload.name is not None:
        school.name = payload.name
    if payload.admin_email is not None:
        school.admin_email = payload.admin_email or None
    await db.commit()
    await db.refresh(school)
    return _school_dict(school)


@router.post("/{school_id}/suspend")
async def suspend_school_endpoint(
    school_id: int, admin: OrgAdmin = Depends(require_org_admin), db: AsyncSession = Depends(get_db),
) -> dict:
    """Заморозить школу (том сохранён, маршрут → «приостановлено»)."""
    school = await _get_school(school_id, admin, db)
    if school.status not in ("active", "suspended"):
        raise HTTPException(status.HTTP_409_CONFLICT, f"школу в статусе '{school.status}' нельзя заморозить")
    async with keyed_lock(school_key(school.id)):
        try:
            await suspend_school(school, db)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"не удалось заморозить школу: {exc}")
    return _school_dict(school)


@router.post("/{school_id}/unsuspend")
async def unsuspend_school_endpoint(
    school_id: int, admin: OrgAdmin = Depends(require_org_admin), db: AsyncSession = Depends(get_db),
) -> dict:
    """Разморозить школу (поднять стек, вернуть нормальный маршрут)."""
    school = await _get_school(school_id, admin, db)
    if school.status not in ("suspended", "active"):
        raise HTTPException(status.HTTP_409_CONFLICT, f"школу в статусе '{school.status}' нельзя разморозить")
    async with keyed_lock(school_key(school.id)):
        try:
            await unsuspend_school(school, db)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"не удалось разморозить школу: {exc}")
    return _school_dict(school)


# ============================================================================
# R5: управление АДМИНАМИ школы (org_admin). Ядро проксирует во внутренний RPC
# стека школы (telemetry-token), сам внутрь данных школы не заходит. Закрывает
# пробел «нельзя завести/сбросить/удалить админа школы» (AUDIT_2026-06-12 2.8).
# ============================================================================


class SchoolAdminCreate(BaseModel):
    email: str
    full_name: str | None = None


class SchoolAdminPatch(BaseModel):
    full_name: str | None = None
    email: str | None = None
    is_active: bool | None = None


async def _school_admin_rpc(method: str, school: School, db: AsyncSession, path: str, json: dict | None = None) -> dict:
    if school.status != "active":
        raise HTTPException(status.HTTP_409_CONFLICT, f"школа недоступна (статус '{school.status}')")
    secret = await db.get(SchoolSecret, school.id)
    if secret is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "школа не запровижинена (нет секретов)")
    url = f"http://{school_container_name(school.slug, 'app')}:3000/internal{path}"
    # Шлём ОБА токена: telemetry — для старого образа тенанта, internal — для нового.
    # Тенант с заданным INTERNAL_RPC_TOKEN примет только его (изоляция, AUDIT #6).
    headers = {"X-Telemetry-Token": secret.telemetry_token}
    rpc_token = getattr(secret, "internal_rpc_token", None)
    if rpc_token:
        headers["X-Internal-Token"] = rpc_token
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.request(method, url, headers=headers, json=json)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"школа недоступна: {exc}")
    if resp.status_code == status.HTTP_401_UNAUTHORIZED:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "ошибка авторизации RPC к школе")
    if resp.status_code >= 300:
        try:
            detail = resp.json().get("detail", resp.text)
        except Exception:  # noqa: BLE001
            detail = resp.text
        raise HTTPException(resp.status_code, detail)
    return resp.json() if resp.content else {}


@router.get("/{school_id}/admins")
async def list_school_admins(school_id: int, admin: OrgAdmin = Depends(require_org_admin), db: AsyncSession = Depends(get_db)) -> dict:
    school = await _get_school(school_id, admin, db)
    return await _school_admin_rpc("GET", school, db, "/school-admins")


@router.post("/{school_id}/admins", status_code=status.HTTP_201_CREATED)
async def add_school_admin(
    school_id: int, payload: SchoolAdminCreate,
    admin: OrgAdmin = Depends(require_org_admin), db: AsyncSession = Depends(get_db),
) -> dict:
    school = await _get_school(school_id, admin, db)
    return await _school_admin_rpc("POST", school, db, "/school-admins", json=payload.model_dump())


@router.patch("/{school_id}/admins/{uid}")
async def patch_school_admin(
    school_id: int, uid: int, payload: SchoolAdminPatch,
    admin: OrgAdmin = Depends(require_org_admin), db: AsyncSession = Depends(get_db),
) -> dict:
    school = await _get_school(school_id, admin, db)
    return await _school_admin_rpc("PATCH", school, db, f"/school-admins/{uid}", json=payload.model_dump(exclude_none=True))


@router.delete("/{school_id}/admins/{uid}")
async def remove_school_admin(
    school_id: int, uid: int,
    admin: OrgAdmin = Depends(require_org_admin), db: AsyncSession = Depends(get_db),
) -> dict:
    school = await _get_school(school_id, admin, db)
    return await _school_admin_rpc("DELETE", school, db, f"/school-admins/{uid}")


@router.post("/{school_id}/admins/{uid}/reset-password")
async def reset_school_admin_password(
    school_id: int, uid: int,
    admin: OrgAdmin = Depends(require_org_admin), db: AsyncSession = Depends(get_db),
) -> dict:
    school = await _get_school(school_id, admin, db)
    return await _school_admin_rpc("POST", school, db, f"/school-admins/{uid}/reset-password")


def _domain_dict(d: SchoolDomain) -> dict:
    return {"id": d.id, "domain": d.domain, "type": d.domain_type, "status": d.status}


@router.get("/{school_id}/domains")
async def list_domains(school_id: int, admin: OrgAdmin = Depends(require_org_admin), db: AsyncSession = Depends(get_db)) -> dict:
    school = await _get_school(school_id, admin, db)
    rows = (
        await db.execute(select(SchoolDomain).where(SchoolDomain.school_id == school.id).order_by(SchoolDomain.id))
    ).scalars().all()
    return {"domains": [_domain_dict(d) for d in rows]}


def _looks_like_ipv4(value: str | None) -> bool:
    if not value:
        return False
    parts = value.split(".")
    return len(parts) == 4 and all(p.isdigit() and 0 <= int(p) <= 255 for p in parts)


@router.get("/{school_id}/dns")
async def school_dns_info(
    school_id: int, admin: OrgAdmin = Depends(require_org_admin), db: AsyncSession = Depends(get_db)
) -> dict:
    """DNS-инфо школы для подключения доменов: реальный адрес ноды (для A/CNAME-записи),
    дефолтный поддомен платформы и список кастомных доменов. Используется модалкой
    «Домены» в орг-консоли, чтобы показать оператору точные DNS-инструкции."""
    school = await _get_school(school_id, admin, db)
    settings = get_settings()
    base = settings.PUBLIC_BASE_DOMAIN

    # На какой ноде крутится школа — её hostname и есть цель DNS-записи. Если школа на
    # сервере платформы (нет назначения ноды) — цель = сам control-plane домен.
    node = (
        await db.execute(
            select(Node)
            .join(NodeAssignment, NodeAssignment.node_id == Node.id)
            .where(NodeAssignment.school_id == school.id)
            .limit(1)
        )
    ).scalar_one_or_none()
    target = node.hostname if node else base
    record_type = "A" if _looks_like_ipv4(target) else "CNAME"

    domains = (
        await db.execute(
            select(SchoolDomain)
            .where(SchoolDomain.school_id == school.id, SchoolDomain.status != "removed")
            .order_by(SchoolDomain.id)
        )
    ).scalars().all()

    return {
        "slug": school.slug,
        "base_domain": base,
        "default_subdomain": f"{school.slug}.{base}",
        "node_name": node.name if node else None,
        "dns_target": target,           # IP или FQDN ноды — куда указывать домен
        "record_type": record_type,     # "A" если target — IP, иначе "CNAME"
        "domains": [_domain_dict(d) for d in domains],
    }


@router.post("/{school_id}/domains", status_code=status.HTTP_201_CREATED)
async def add_domain(
    school_id: int, payload: DomainCreate,
    admin: OrgAdmin = Depends(require_org_admin), db: AsyncSession = Depends(get_db),
) -> dict:
    """Привязать кастомный домен к школе: запись + Caddy-маршрут на стек школы.
    On-demand TLS затем выпустит сертификат (через /internal/validate-domain)."""
    school = await _get_school(school_id, admin, db)
    host = (payload.domain or "").strip().lower().split("/")[0]
    if not host or "." not in host or " " in host:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "некорректный домен")

    org = await db.get(Organization, admin.org_id)
    custom_domains_count = int(await db.scalar(
        select(func.count(SchoolDomain.id))
        .join(School, SchoolDomain.school_id == School.id)
        .where(School.org_id == admin.org_id, SchoolDomain.domain_type == "custom", SchoolDomain.status != "removed")
    ) or 0)
    if org and custom_domains_count >= org.max_custom_domains:
        raise HTTPException(
            status.HTTP_402_PAYMENT_REQUIRED,
            f"достигнут лимит кастомных доменов ({custom_domains_count}/{org.max_custom_domains}). Повысьте план.",
        )

    taken = (await db.execute(select(SchoolDomain).where(SchoolDomain.domain == host))).scalar_one_or_none()
    if taken is not None and taken.status != "removed":
        raise HTTPException(status.HTTP_409_CONFLICT, "домен уже занят")

    dom = SchoolDomain(school_id=school.id, domain=host, domain_type="custom", status="active", activated_at=datetime.utcnow())
    db.add(dom)
    await db.flush()
    upstream = f"{school_container_name(school.slug, 'app')}:3000"
    try:
        await get_caddy_admin().add_route(f"dom-{dom.id}", host, upstream)
    except Exception as exc:  # noqa: BLE001
        await db.rollback()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"не удалось добавить маршрут для {host}: {exc}")
    await db.commit()
    return {"domain": _domain_dict(dom), "host": host, "message": "домен привязан; DNS → этот сервер, TLS выпустится автоматически"}


@router.delete("/{school_id}/domains/{domain_id}")
async def remove_domain(
    school_id: int, domain_id: int,
    admin: OrgAdmin = Depends(require_org_admin), db: AsyncSession = Depends(get_db),
) -> dict:
    school = await _get_school(school_id, admin, db)
    dom = await db.get(SchoolDomain, domain_id)
    if dom is None or dom.school_id != school.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "домен не найден")
    if dom.domain_type == "custom":
        try:
            await get_caddy_admin().remove_route(f"dom-{dom.id}")
        except Exception:  # noqa: BLE001
            pass
    await db.delete(dom)
    await db.commit()
    return {"id": domain_id, "removed": True}


@router.delete("/{school_id}")
async def delete_school(
    school_id: int,
    purge: bool = Query(False, description="Также удалить запись школы + секреты (НЕОБРАТИМО)"),
    confirm: str | None = Query(None, description="Для purge: точный slug школы (защита от опечатки)"),
    admin: OrgAdmin = Depends(require_org_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    school = await _get_school(school_id, admin, db)
    # purge — необратимое уничтожение томов: требуем явного подтверждения slug-ом,
    # чтобы случайный DELETE?purge=true не стёр данные школы (AUDIT, lifecycle #3).
    if purge and (confirm or "").strip() != school.slug:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"для безвозвратного удаления повторите slug школы в ?confirm={school.slug}",
        )
    async with keyed_lock(school_key(school.id)):
        # purge=True: pg_dump + бэкап вложений → снос стека вместе с томами → удаление записи.
        # purge=False: архивация (контейнеры долой, тома данных сохранены — обратимо).
        try:
            await deprovision_school(school, db, purge=purge)
        except ProvisioningError as exc:
            # Бэкап не удался → тома сохранены, запись НЕ удаляем (защита от потери данных).
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc))
        if purge:
            secret = await db.get(SchoolSecret, school.id)
            if secret is not None:
                await db.delete(secret)
            await db.delete(school)
            await db.commit()
            return {"id": school_id, "purged": True}
        return {"id": school_id, "status": school.status}


# ---------------------------------------------------------------------------
# OTA Update History
# ---------------------------------------------------------------------------


@router.get("/{school_id}/update-history")
async def get_update_history(
    school_id: int,
    limit: int = Query(20, ge=1, le=100),
    admin: OrgAdmin = Depends(require_org_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """История OTA-обновлений школы: когда, откуда, куда, статус."""
    from app.models import UpdateHistory

    school = await _get_school(school_id, admin, db)
    rows = (
        await db.execute(
            select(UpdateHistory)
            .where(UpdateHistory.school_id == school.id)
            .order_by(UpdateHistory.started_at.desc())
            .limit(limit)
        )
    ).scalars().all()

    history = [
        {
            "id": h.id,
            "from_version": h.from_version,
            "to_version": h.to_version,
            "status": h.status,
            "started_at": h.started_at.isoformat() if h.started_at else None,
            "completed_at": h.completed_at.isoformat() if h.completed_at else None,
            "error_message": h.error_message,
        }
        for h in rows
    ]
    return {"school_id": school.id, "school_slug": school.slug, "history": history, "total": len(history)}


@router.get("/releases/current")
async def get_current_release(
    admin: OrgAdmin = Depends(require_org_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Текущая версия tenant-образа (активный релиз)."""
    release = await db.scalar(
        select(Release).where(Release.is_current == True).order_by(Release.id.desc())
    )
    if not release:
        return {"current": None, "message": "No releases published yet"}
    return {
        "current": {
            "version_tag": release.version_tag,
            "image": release.image,
            "changelog": release.changelog,
            "source_commit": release.source_commit,
            "published_at": release.published_at.isoformat() if release.published_at else None,
        }
    }


@router.get("/releases/available")
async def get_available_updates(
    admin: OrgAdmin = Depends(require_org_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Проверка доступности обновлений для школ организации."""
    current = await db.scalar(
        select(Release).where(Release.is_current == True).order_by(Release.id.desc())
    )
    if not current:
        return {"available": False, "current_version": None, "latest_version": None}

    schools = (
        await db.execute(select(School).where(School.org_id == admin.org_id, School.status == "active"))
    ).scalars().all()

    updatable = []
    for school in schools:
        if school.release_tag != current.version_tag:
            updatable.append({
                "school_id": school.id,
                "school_slug": school.slug,
                "current_version": school.release_tag,
                "available_version": current.version_tag,
            })

    return {
        "available": len(updatable) > 0,
        "current_version": current.version_tag,
        "updatable_schools": updatable,
        "total_updatable": len(updatable),
    }
