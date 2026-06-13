"""Shared FastAPI dependencies for the control plane."""

from __future__ import annotations

from datetime import datetime

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.security import decode_access_token
from app.models import OrgAdmin, Organization, PlatformAdmin

_bearer = HTTPBearer(auto_error=False)
_UNAUTH = {"WWW-Authenticate": "Bearer"}


async def require_platform_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> PlatformAdmin:
    if credentials is None or not credentials.credentials:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token", _UNAUTH)
    try:
        payload = decode_access_token(credentials.credentials)
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid or expired token", _UNAUTH)
    if payload.get("role") != "platform_admin":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "not a platform admin token", _UNAUTH)
    sub = payload.get("sub")
    admin = await db.get(PlatformAdmin, int(sub)) if sub is not None else None
    if admin is None or not admin.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "admin not found or inactive", _UNAUTH)
    return admin


async def _resolve_org_admin(
    credentials: HTTPAuthorizationCredentials | None,
    db: AsyncSession,
) -> OrgAdmin:
    """Разобрать токен org_admin → запись (401 при отсутствии/inactive). Проверку
    заморозки орг НЕ делает — это слой выше."""
    if credentials is None or not credentials.credentials:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token", _UNAUTH)
    try:
        payload = decode_access_token(credentials.credentials)
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid or expired token", _UNAUTH)
    if payload.get("role") != "org_admin":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "not an org admin token", _UNAUTH)
    sub = payload.get("sub")
    org_admin = await db.get(OrgAdmin, int(sub)) if sub is not None else None
    if org_admin is None or not org_admin.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "org admin not found or inactive", _UNAUTH)
    return org_admin


async def require_org_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> OrgAdmin:
    """Оператор узла орг. Токен несёт role=org_admin и org_id (скоуп). Управляет
    только школами своей орг — внутрь школ не заходит. Заморозка орг = полная
    блокировка управления (403), пока platform_admin не разморозит."""
    org_admin = await _resolve_org_admin(credentials, db)
    org = await db.get(Organization, org_admin.org_id)
    if org is not None and org.status == "suspended":
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "организация приостановлена — обратитесь в поддержку платформы"
        )
    return org_admin


async def require_org_admin_billing(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> OrgAdmin:
    """Как require_org_admin, но БЕЗ блокировки при заморозке орг — для read-only
    просмотра биллинга. Приостановленная за неоплату орг должна видеть свой счёт,
    чтобы оплатить (AUDIT, billing #8); управление при этом остаётся заблокировано
    (висит на require_org_admin)."""
    return await _resolve_org_admin(credentials, db)


async def require_billing_ok(
    org_admin: OrgAdmin = Depends(require_org_admin),
    db: AsyncSession = Depends(get_db),
) -> OrgAdmin:
    """Как require_org_admin, плюс блок при просроченной подписке (402). Вешается на
    операции, которые создают/изменяют ресурсы (создание/реправижининг/обновление
    школ). Read-only и просмотр биллинга остаются доступны, чтобы орг видела, что
    надо оплатить."""
    from app.services.billing import get_or_create_subscription, is_delinquent

    org = await db.get(Organization, org_admin.org_id)
    if org is not None:
        sub = await get_or_create_subscription(db, org)
        if is_delinquent(sub, datetime.utcnow()):
            raise HTTPException(
                status.HTTP_402_PAYMENT_REQUIRED,
                "подписка просрочена — оплатите, чтобы создавать и изменять школы",
            )
    return org_admin
