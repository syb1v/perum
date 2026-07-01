"""Control-plane → tenant RPC. Authenticated by the shared TELEMETRY_TOKEN that
the control plane generated for this stack and injected into the env.

Архитектура v2 (см. docs/ARCH_ORG_NODE.md): тенант-стек = ОДНА школа. При
провижининге узел орг бутстрапит первого `school_admin` этой школы.
"""

from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_db
from app.core.roles import SCHOOL_ADMIN
from app.core.security import hash_password
from app.models import School, User

settings = get_settings()
router = APIRouter()


class BootstrapAdminRequest(BaseModel):
    email: EmailStr
    full_name: str | None = None


def _ct_eq(a: str | None, b: str | None) -> bool:
    """Constant-time сравнение токенов (защита от timing-side-channel; ядро уже
    использует compare_digest на приёме телеметрии — здесь симметрично)."""
    if not a or not b:
        return False
    return secrets.compare_digest(a, b)


async def _require_internal_token(
    x_internal_token: str | None = Header(default=None),
    x_telemetry_token: str | None = Header(default=None),
) -> None:
    """Авторизация входящего /internal-RPC от ядра.

    Если задан отдельный INTERNAL_RPC_TOKEN — принимаем ТОЛЬКО его (telemetry-токен
    на /internal больше не пускает → настоящая изоляция: утечка telemetry_token не
    даёт управления учётками, AUDIT isolation #6). Если INTERNAL_RPC_TOKEN не задан
    (легаси-стек, ещё не обновлён) — fallback на TELEMETRY_TOKEN."""
    if settings.INTERNAL_RPC_TOKEN:
        if _ct_eq(x_internal_token, settings.INTERNAL_RPC_TOKEN):
            return
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid internal token")
    # Легаси-стек без разведённого токена: ядро шлёт X-Telemetry-Token.
    if settings.TELEMETRY_TOKEN and _ct_eq(x_telemetry_token, settings.TELEMETRY_TOKEN):
        return
    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid internal token")


# Имя-алиас сохранено: на нём висят dependencies всех /internal-эндпоинтов ниже.
_require_telemetry_token = _require_internal_token


async def _do_bootstrap(payload: BootstrapAdminRequest, db: AsyncSession) -> dict:
    # Один стек = одна школа. Берём её (создаётся seed_defaults до bootstrap).
    school_id = await db.scalar(select(School.id).order_by(School.id).limit(1))

    existing = await db.execute(select(User).where(User.role == SCHOOL_ADMIN).limit(1))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "school_admin already exists")

    temp_password = secrets.token_urlsafe(9)
    user = User(
        school_id=school_id,
        role=SCHOOL_ADMIN,
        login=payload.email,
        email=payload.email,
        first_name=payload.full_name or "Администратор",
        last_name="школы",
        password_hash=hash_password(temp_password),
        must_change_password=True,
    )
    db.add(user)
    await db.commit()
    return {"login": user.login, "temporary_password": temp_password, "must_change_password": True}


@router.post("/bootstrap-school-admin", dependencies=[Depends(_require_telemetry_token)])
async def bootstrap_school_admin(
    payload: BootstrapAdminRequest, db: AsyncSession = Depends(get_db)
) -> dict:
    return await _do_bootstrap(payload, db)


# Совместимость со старым путём (легаси-провижинер орг). Тоже создаёт school_admin.
@router.post("/bootstrap-org-admin", dependencies=[Depends(_require_telemetry_token)])
async def bootstrap_org_admin_compat(
    payload: BootstrapAdminRequest, db: AsyncSession = Depends(get_db)
) -> dict:
    return await _do_bootstrap(payload, db)


# ============================================================================
# R5: управление АДМИНАМИ школы из ядра (org_admin → ядро → этот RPC).
# Ядро внутрь данных школы не лезет — только над учётками role=school_admin.
# Все эндпоинты под telemetry-token. См. docs/AUDIT_2026-06-12.md (находка 2.8).
# ============================================================================


class SchoolAdminCreate(BaseModel):
    email: EmailStr
    full_name: str | None = None


class SchoolAdminPatch(BaseModel):
    full_name: str | None = None
    email: EmailStr | None = None
    is_active: bool | None = None


def _admin_dict(u: User) -> dict:
    return {
        "id": u.id,
        "login": u.login,
        "email": u.email,
        "full_name": " ".join(p for p in [u.first_name, u.last_name] if p) or None,
        "is_active": u.is_active,
        "must_change_password": u.must_change_password,
    }


async def _get_admin(uid: int, db: AsyncSession) -> User:
    u = await db.get(User, uid)
    if u is None or u.role != SCHOOL_ADMIN:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "school_admin not found")
    return u


async def _active_admin_count(db: AsyncSession) -> int:
    return int(await db.scalar(
        select(func.count(User.id)).where(User.role == SCHOOL_ADMIN, User.is_active.is_(True))
    ) or 0)


@router.get("/school-admins", dependencies=[Depends(_require_telemetry_token)])
async def list_school_admins(db: AsyncSession = Depends(get_db)) -> dict:
    rows = (await db.execute(select(User).where(User.role == SCHOOL_ADMIN).order_by(User.id))).scalars().all()
    return {"admins": [_admin_dict(u) for u in rows]}


@router.post("/school-admins", dependencies=[Depends(_require_telemetry_token)], status_code=status.HTTP_201_CREATED)
async def create_school_admin(payload: SchoolAdminCreate, db: AsyncSession = Depends(get_db)) -> dict:
    dup = await db.scalar(select(User.id).where(User.login == payload.email))
    if dup is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "пользователь с таким логином уже существует")
    school_id = await db.scalar(select(School.id).order_by(School.id).limit(1))
    if school_id is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "школа не инициализирована")
    temp_password = secrets.token_urlsafe(9)
    name = (payload.full_name or "Администратор").strip()
    first, _, last = name.partition(" ")
    user = User(
        school_id=school_id, role=SCHOOL_ADMIN, login=payload.email, email=payload.email,
        first_name=first or "Администратор", last_name=last or "школы",
        password_hash=hash_password(temp_password), must_change_password=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return {**_admin_dict(user), "temporary_password": temp_password}


@router.patch("/school-admins/{uid}", dependencies=[Depends(_require_telemetry_token)])
async def update_school_admin(uid: int, payload: SchoolAdminPatch, db: AsyncSession = Depends(get_db)) -> dict:
    u = await _get_admin(uid, db)
    if payload.is_active is False and u.is_active and await _active_admin_count(db) <= 1:
        raise HTTPException(status.HTTP_409_CONFLICT, "нельзя деактивировать последнего администратора школы")
    if payload.full_name is not None:
        name = payload.full_name.strip()
        first, _, last = name.partition(" ")
        u.first_name, u.last_name = (first or None), (last or None)
    if payload.email is not None and payload.email != u.login:
        # login = email; коллизия с другим пользователем → чистый 409, не 500.
        dup = await db.scalar(select(User.id).where(User.login == payload.email, User.id != u.id))
        if dup is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, "пользователь с таким логином уже существует")
        u.email = payload.email
        u.login = payload.email
    if payload.is_active is not None:
        u.is_active = payload.is_active
    await db.commit()
    await db.refresh(u)
    return _admin_dict(u)


@router.delete("/school-admins/{uid}", dependencies=[Depends(_require_telemetry_token)])
async def delete_school_admin(uid: int, db: AsyncSession = Depends(get_db)) -> dict:
    u = await _get_admin(uid, db)
    if u.is_active and await _active_admin_count(db) <= 1:
        raise HTTPException(status.HTTP_409_CONFLICT, "нельзя удалить последнего администратора школы")
    await db.delete(u)
    await db.commit()
    return {"id": uid, "deleted": True}


@router.post("/school-admins/{uid}/reset-password", dependencies=[Depends(_require_telemetry_token)])
async def reset_school_admin_password(uid: int, db: AsyncSession = Depends(get_db)) -> dict:
    u = await _get_admin(uid, db)
    temp_password = secrets.token_urlsafe(9)
    u.password_hash = hash_password(temp_password)
    u.must_change_password = True
    await db.commit()
    return {"id": u.id, "login": u.login, "temporary_password": temp_password}
