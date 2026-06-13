"""Organization CRUD + lifecycle.

`POST /api/organizations` creates the control-DB record and then provisions the
org's docker stack (see app.services.tenant_provisioner). Provisioning is
synchronous for Phase 1: the request returns once the stack is healthy and
routed (status=active), or 502 if it failed (status=failed, resources cleaned).
"""

from __future__ import annotations

import hashlib
import logging
import secrets as secrets_mod
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_db
from app.core.deps import require_platform_admin
from app.core.locks import keyed_lock, school_key
from app.core.security import hash_password
from app.models import EnrollmentToken, Invoice, OrgAdmin, Organization, OrganizationSecret, School, SchoolMetric
from app.services.billing import (
    PLANS,
    billing_state,
    get_or_create_subscription,
    is_delinquent,
    plan_price,
    record_payment,
    school_limit,
)
from app.schemas.organization import (
    OrganizationCreate,
    OrganizationRead,
    OrgAdminCredentials,
    ProvisionResult,
)
from app.services.school_provisioner import deprovision_school, suspend_school, unsuspend_school
from app.services.stats import rollup, school_stat, schools_with_metrics
from app.services.tenant_provisioner import (
    ProvisioningError,
    ProvisionOutcome,
    deprovision,
    provision,
)

logger = logging.getLogger("perum.organizations")

# Defense-in-depth (#10): весь жизненный цикл орг (создание/удаление/заморозка/
# биллинг/смена плана/enrollment) держится на этом гарде НА САМОМ роутере, а не
# только на dependencies= в main.py. Потеря kwarg при include_router больше не
# раскроет управление организациями.
router = APIRouter(dependencies=[Depends(require_platform_admin)])

# Statuses from which a fresh POST may reuse the existing row and (re)provision.
REPROVISIONABLE = {"failed", "archived"}
# Statuses that block a new POST for the same slug.
BLOCKING = {"active", "provisioning"}


def _to_result(outcome: ProvisionOutcome) -> ProvisionResult:
    admin = None
    if outcome.admin_login and outcome.admin_temp_password:
        admin = OrgAdminCredentials(
            login=outcome.admin_login, temporary_password=outcome.admin_temp_password
        )
    return ProvisionResult(
        organization=OrganizationRead.model_validate(outcome.org), org_admin=admin
    )


async def _get_org(slug: str, db: AsyncSession) -> Organization | None:
    result = await db.execute(select(Organization).where(Organization.slug == slug))
    return result.scalar_one_or_none()


@router.get("", response_model=list[OrganizationRead])
async def list_organizations(db: AsyncSession = Depends(get_db)) -> list[Organization]:
    result = await db.execute(select(Organization).order_by(Organization.created_at.desc()))
    return list(result.scalars().all())


@router.post("", response_model=ProvisionResult, status_code=status.HTTP_201_CREATED)
async def create_organization(
    payload: OrganizationCreate,
    db: AsyncSession = Depends(get_db),
) -> ProvisionResult:
    existing = await _get_org(payload.slug, db)
    if existing is not None and existing.status in BLOCKING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"organization '{payload.slug}' already exists (status={existing.status})",
        )

    if existing is not None:
        # Reuse a failed/archived row: refresh mutable fields, then reprovision.
        org = existing
        org.name = payload.name
        org.admin_email = payload.admin_email
        org.plan = payload.plan
        org.deployment_mode = payload.deployment_mode
        org.notes = payload.notes
    else:
        org = Organization(
            slug=payload.slug,
            name=payload.name,
            admin_email=payload.admin_email,
            plan=payload.plan,
            deployment_mode=payload.deployment_mode,
            notes=payload.notes,
            status="provisioning",
        )
        db.add(org)
    await db.commit()
    await db.refresh(org)

    try:
        outcome = await provision(org, db)
    except ProvisioningError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"provisioning failed for '{org.slug}': {exc}",
        )
    return _to_result(outcome)


@router.get("/{slug}", response_model=OrganizationRead)
async def get_organization(slug: str, db: AsyncSession = Depends(get_db)) -> Organization:
    org = await _get_org(slug, db)
    if org is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="organization not found")
    return org


@router.post("/{slug}/reprovision", response_model=ProvisionResult)
async def reprovision_organization(
    slug: str, db: AsyncSession = Depends(get_db)
) -> ProvisionResult:
    org = await _get_org(slug, db)
    if org is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="organization not found")
    try:
        outcome = await provision(org, db)
    except ProvisioningError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"reprovisioning failed for '{org.slug}': {exc}",
        )
    return _to_result(outcome)


@router.delete("/{slug}")
async def delete_organization(
    slug: str,
    purge: bool = Query(False, description="Also delete the control-DB row + secrets (IRREVERSIBLE)"),
    confirm: str | None = Query(None, description="For purge: the exact org slug (typo guard)"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    org = await _get_org(slug, db)
    if org is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="organization not found")
    # purge каскадно сносит тома ВСЕХ школ орг (необратимо) — требуем подтверждения
    # slug-ом, чтобы опечатка не уничтожила целую организацию (AUDIT, lifecycle #3).
    if purge and (confirm or "").strip() != org.slug:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"для безвозвратного удаления организации повторите её slug в ?confirm={org.slug}",
        )

    # КАСКАД: сначала снять стеки ВСЕХ школ орг (они помечены лейблом sch-<slug>,
    # которого нет у орг-стека com.perum.org=<slug> — без этого школы остаются
    # работающими «призраками» после удаления орг). purge пробрасываем: при полном
    # удалении орг школы тоже удаляются (с pg_dump-бэкапом), иначе — архивируются.
    schools = (
        await db.execute(select(School).where(School.org_id == org.id))
    ).scalars().all()
    for school in schools:
        if school.status == "archived" and not purge:
            continue
        try:
            async with keyed_lock(school_key(school.id)):
                await deprovision_school(school, db, purge=purge)
        except Exception as exc:  # noqa: BLE001
            logger.error("org %s: deprovision school %s failed: %s", org.slug, school.slug, exc)

    await deprovision(org, db)
    if purge:
        secret = await db.get(OrganizationSecret, org.id)
        if secret is not None:
            await db.delete(secret)
        await db.delete(org)
        await db.commit()
        return {"slug": slug, "purged": True}
    return {"slug": slug, "status": org.status}


# --- v2: редактирование и заморозка организации (platform_admin) ---

class OrgPatch(BaseModel):
    name: str | None = None
    admin_email: str | None = None
    notes: str | None = None
    deployment_mode: str | None = None


@router.patch("/{slug}", response_model=OrganizationRead)
async def patch_organization(slug: str, payload: OrgPatch, db: AsyncSession = Depends(get_db)) -> Organization:
    """Редактирование метаданных организации без репровижининга."""
    org = await _get_org(slug, db)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "organization not found")
    if payload.name is not None:
        org.name = payload.name
    if payload.admin_email is not None:
        org.admin_email = payload.admin_email or None
    if payload.notes is not None:
        org.notes = payload.notes or None
    if payload.deployment_mode is not None:
        if payload.deployment_mode not in ("shared_host", "dedicated_vm"):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "deployment_mode: shared_host | dedicated_vm")
        org.deployment_mode = payload.deployment_mode
    await db.commit()
    await db.refresh(org)
    return org


@router.post("/{slug}/suspend")
async def suspend_organization(slug: str, db: AsyncSession = Depends(get_db)) -> dict:
    """Заморозить организацию: остановить стеки всех её активных школ и заблокировать
    org_admin (статус 'suspended'). Тома сохранены — разморозка вернёт всё."""
    org = await _get_org(slug, db)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "organization not found")
    if org.status not in ("active", "suspended"):
        raise HTTPException(status.HTTP_409_CONFLICT, f"организацию в статусе '{org.status}' нельзя заморозить")
    schools = (await db.execute(select(School).where(School.org_id == org.id))).scalars().all()
    for school in schools:
        if school.status == "active":
            try:
                async with keyed_lock(school_key(school.id)):
                    await suspend_school(school, db, reason="org")
            except Exception as exc:  # noqa: BLE001
                logger.error("org %s: suspend school %s failed: %s", org.slug, school.slug, exc)
    org.status = "suspended"
    org.suspended_at = datetime.utcnow()
    await db.commit()
    return {"slug": org.slug, "status": org.status}


async def _resume_org(org: Organization, db: AsyncSession) -> None:
    """Вернуть организацию в 'active' и поднять её школы, замороженные КАСКАДОМ
    (suspended_by='org'). Школы, замороженные org_admin вручную ('manual'),
    остаются замороженными. Используется и ручной разморозкой, и оплатой."""
    org.status = "active"
    org.suspended_at = None
    await db.commit()
    schools = (await db.execute(select(School).where(School.org_id == org.id))).scalars().all()
    for school in schools:
        if school.status == "suspended" and school.suspended_by == "org":
            try:
                async with keyed_lock(school_key(school.id)):
                    await unsuspend_school(school, db)
            except Exception as exc:  # noqa: BLE001
                logger.error("org %s: unsuspend school %s failed: %s", org.slug, school.slug, exc)


@router.post("/{slug}/unsuspend")
async def unsuspend_organization(slug: str, db: AsyncSession = Depends(get_db)) -> dict:
    """Разморозить организацию: вернуть статус 'active' и поднять её школы,
    которые были заморожены каскадом."""
    org = await _get_org(slug, db)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "organization not found")
    if org.status not in ("suspended", "active"):
        raise HTTPException(status.HTTP_409_CONFLICT, f"организацию в статусе '{org.status}' нельзя разморозить")
    await _resume_org(org, db)
    return {"slug": org.slug, "status": org.status}


@router.get("/{slug}/schools")
async def organization_schools(slug: str, db: AsyncSession = Depends(get_db)) -> dict:
    """Сквозной список ВСЕХ школ организации для platform_admin (включая archived).
    Не ломает org-скоуп: живёт под /api/organizations (require_platform_admin),
    роутер /api/schools (org_admin) не трогается."""
    from app.routers.schools import _school_dict

    org = await _get_org(slug, db)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "organization not found")
    rows = (await db.execute(select(School).where(School.org_id == org.id).order_by(School.id))).scalars().all()
    return {"org_slug": org.slug, "schools": [_school_dict(s) for s in rows]}


@router.get("/{slug}/schools/{school_id}")
async def organization_school(slug: str, school_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    """Карточка одной школы любой орг для platform_admin: метаданные + телеметрия."""
    from app.routers.schools import _school_dict

    org = await _get_org(slug, db)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "organization not found")
    school = await db.get(School, school_id)
    if school is None or school.org_id != org.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "school not found")
    metric = await db.get(SchoolMetric, school.id)
    return {**_school_dict(school), "stat": school_stat(school, metric, datetime.utcnow())}


@router.get("/{slug}/stats")
async def organization_stats(slug: str, db: AsyncSession = Depends(get_db)) -> dict:
    """Статистика организации: сводка по её школам + разбивка по каждой школе."""
    org = await _get_org(slug, db)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "organization not found")
    rows = await schools_with_metrics(db, org_id=org.id)
    agg, schools = rollup(rows, datetime.utcnow())
    return {"org_slug": org.slug, "name": org.name, "plan": org.plan, "status": org.status, **agg, "schools": schools}


# --- v2: платформа заводит администратора организации (оператора узла орг) ---

class OrgAdminCreate(BaseModel):
    login: str
    password: str
    full_name: str | None = None
    email: str | None = None


@router.post("/{slug}/org-admins", status_code=status.HTTP_201_CREATED)
async def create_org_admin(slug: str, payload: OrgAdminCreate, db: AsyncSession = Depends(get_db)) -> dict:
    org = await _get_org(slug, db)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "organization not found")
    clash = await db.execute(select(OrgAdmin).where(OrgAdmin.login == payload.login))
    if clash.scalar_one_or_none() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "org_admin with this login already exists")
    admin = OrgAdmin(
        org_id=org.id, login=payload.login, password_hash=hash_password(payload.password),
        full_name=payload.full_name, email=payload.email,
    )
    db.add(admin)
    await db.commit()
    await db.refresh(admin)
    return {"id": admin.id, "login": admin.login, "org_id": admin.org_id}


class OrgAdminPatch(BaseModel):
    full_name: str | None = None
    email: str | None = None
    is_active: bool | None = None


async def _get_org_admin(slug: str, admin_id: int, db: AsyncSession) -> OrgAdmin:
    org = await _get_org(slug, db)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "organization not found")
    oa = await db.get(OrgAdmin, admin_id)
    if oa is None or oa.org_id != org.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "org_admin not found")
    return oa


@router.get("/{slug}/org-admins")
async def list_org_admins(slug: str, db: AsyncSession = Depends(get_db)) -> dict:
    org = await _get_org(slug, db)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "organization not found")
    rows = (await db.execute(select(OrgAdmin).where(OrgAdmin.org_id == org.id).order_by(OrgAdmin.id))).scalars().all()
    return {"org_admins": [
        {"id": a.id, "login": a.login, "full_name": a.full_name, "email": a.email, "is_active": a.is_active}
        for a in rows
    ]}


@router.patch("/{slug}/org-admins/{admin_id}")
async def patch_org_admin(slug: str, admin_id: int, payload: OrgAdminPatch, db: AsyncSession = Depends(get_db)) -> dict:
    oa = await _get_org_admin(slug, admin_id, db)
    if payload.full_name is not None:
        oa.full_name = payload.full_name or None
    if payload.email is not None:
        oa.email = payload.email or None
    if payload.is_active is not None:
        oa.is_active = payload.is_active
    await db.commit()
    await db.refresh(oa)
    return {"id": oa.id, "login": oa.login, "is_active": oa.is_active}


@router.delete("/{slug}/org-admins/{admin_id}")
async def delete_org_admin(slug: str, admin_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    oa = await _get_org_admin(slug, admin_id, db)
    await db.delete(oa)
    await db.commit()
    return {"id": admin_id, "deleted": True}


@router.post("/{slug}/org-admins/{admin_id}/reset-password")
async def reset_org_admin_password(slug: str, admin_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    oa = await _get_org_admin(slug, admin_id, db)
    new_password = secrets_mod.token_urlsafe(9)
    oa.password_hash = hash_password(new_password)
    await db.commit()
    return {"id": oa.id, "login": oa.login, "temporary_password": new_password}


# --- v2: enrollment-токен для подключения узла организации ---

class EnrollmentTokenOut(BaseModel):
    token: str
    org_slug: str
    core_url: str
    expires_at: str


@router.post("/{slug}/enrollment-token", response_model=EnrollmentTokenOut)
async def issue_enrollment_token(slug: str, db: AsyncSession = Depends(get_db)) -> EnrollmentTokenOut:
    """Выдать одноразовый токен подключения узла орг. Плейнтекст — только в ответе;
    в БД хранится sha256-хеш. Узел орг предъявит токен на POST /api/enroll."""
    org = await _get_org(slug, db)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "organization not found")
    raw = secrets_mod.token_urlsafe(32)
    expires = datetime.utcnow() + timedelta(days=7)
    db.add(EnrollmentToken(
        org_id=org.id, token_hash=hashlib.sha256(raw.encode()).hexdigest(), expires_at=expires,
    ))
    await db.commit()
    return EnrollmentTokenOut(
        token=raw, org_slug=org.slug,
        core_url=get_settings().CONTROL_PLANE_URL, expires_at=expires.isoformat(),
    )


# --- v2: биллинг (план + лимит школ + подписка + оплата) ---

class PlanUpdate(BaseModel):
    plan: str


class ChargeRequest(BaseModel):
    months: int = Field(default=1, ge=1, le=120)


async def _active_school_count(db: AsyncSession, org_id: int) -> int:
    return int(await db.scalar(
        select(func.count(School.id)).where(School.org_id == org_id, School.status != "archived")
    ) or 0)


async def _billing_payload(db: AsyncSession, org: Organization) -> dict:
    sub = await get_or_create_subscription(db, org)
    used = await _active_school_count(db, org.id)
    limit = school_limit(org.plan)
    return {
        "org_slug": org.slug,
        "plan": org.plan,
        "price_rub_month": plan_price(org.plan),
        "school_limit": limit,
        "schools_used": used,
        "schools_remaining": max(limit - used, 0),
        "org_status": org.status,
        "subscription": billing_state(sub, datetime.utcnow()),
        "created_at": org.created_at.isoformat() if org.created_at else None,
    }


@router.get("/{slug}/billing")
async def get_billing(slug: str, db: AsyncSession = Depends(get_db)) -> dict:
    org = await _get_org(slug, db)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "organization not found")
    return await _billing_payload(db, org)


@router.put("/{slug}/billing")
async def set_plan(
    slug: str,
    payload: PlanUpdate,
    force: bool = Query(False, description="Разрешить понижение плана ниже текущего использования"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    if payload.plan not in PLANS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"неизвестный план; допустимо: {', '.join(PLANS)}")
    org = await _get_org(slug, db)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "organization not found")
    used = await _active_school_count(db, org.id)
    new_limit = school_limit(payload.plan)
    # Понижение ниже текущего использования по умолчанию ЗАПРЕЩЕНО: иначе орг могла
    # бы уйти на дешёвый план, сохранив все сверхлимитные школы работающими бесплатно
    # (AUDIT, billing #9). Оператор платформы может продавить через ?force=true,
    # но тогда обязан сам решить судьбу лишних школ (заморозить/архивировать).
    if used > new_limit and not force:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"нельзя понизить план: используется {used} школ при лимите {new_limit}. "
            f"Сначала заморозьте/архивируйте лишние школы или повторите с force=true.",
        )
    org.plan = payload.plan
    await db.commit()
    out = await _billing_payload(db, org)
    if used > new_limit:
        out["warning"] = (
            f"план понижен принудительно: используется {used} школ при лимите {new_limit}; "
            f"сверхлимитные школы продолжают работать, новые создать нельзя"
        )
    return out


@router.post("/{slug}/billing/charge")
async def charge_billing(slug: str, payload: ChargeRequest, db: AsyncSession = Depends(get_db)) -> dict:
    """Ручная отметка оплаты: продлевает подписку на N месяцев (создаёт счёт).
    Реальная интеграция с провайдером (ЮKassa) заменит это на счёт+webhook."""
    org = await _get_org(slug, db)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "organization not found")
    if plan_price(org.plan) <= 0:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "у плана нет стоимости — оплата не нужна; сначала смените план на платный",
        )
    sub = await get_or_create_subscription(db, org)
    invoice = await record_payment(db, org, sub, payload.months)
    # Цикл биллинга самозамыкается: если орг была приостановлена за неоплату и
    # теперь оплачена — автоматически размораживаем (поднимаем стеки школ).
    resumed = False
    if org.status == "suspended" and not is_delinquent(sub, datetime.utcnow()):
        await _resume_org(org, db)
        resumed = True
    return {
        "invoice_id": invoice.id,
        "amount_rub": invoice.amount_rub,
        "period_end": invoice.period_end.isoformat() if invoice.period_end else None,
        "subscription": billing_state(sub, datetime.utcnow()),
        "resumed": resumed,
    }


@router.get("/{slug}/billing/invoices")
async def list_invoices(slug: str, db: AsyncSession = Depends(get_db)) -> dict:
    org = await _get_org(slug, db)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "organization not found")
    rows = (await db.execute(
        select(Invoice).where(Invoice.org_id == org.id).order_by(Invoice.id.desc())
    )).scalars().all()
    return {"invoices": [
        {
            "id": iv.id, "plan": iv.plan, "amount_rub": iv.amount_rub, "status": iv.status,
            "provider": iv.provider,
            "period_start": iv.period_start.isoformat() if iv.period_start else None,
            "period_end": iv.period_end.isoformat() if iv.period_end else None,
            "paid_at": iv.paid_at.isoformat() if iv.paid_at else None,
            "created_at": iv.created_at.isoformat() if iv.created_at else None,
        }
        for iv in rows
    ]}
