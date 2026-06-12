"""Лиды лендинга. Публичная форма «Связаться» на апекс-домене ядра постит сюда
(POST /api/contact); platform_admin просматривает заявки. До этого форма била в
несуществующий /api/contact и все лиды терялись (docs/AUDIT_2026-06-12.md, R4)."""

from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import require_platform_admin
from app.core.ratelimit import _client_ip
from app.models import ContactLead

router = APIRouter()

# Простой анти-спам: не более N заявок с одного IP за окно. In-memory (одного
# инстанса достаточно; при мульти-реплике — вынести в Redis, как и login-лимит).
_CONTACT_LIMIT = 5
_CONTACT_WINDOW_S = 300
_hits: dict[str, deque[float]] = defaultdict(deque)


def _throttle(request: Request) -> None:
    ip = _client_ip(request)
    now = time.monotonic()
    dq = _hits[ip]
    while dq and now - dq[0] > _CONTACT_WINDOW_S:
        dq.popleft()
    if len(dq) >= _CONTACT_LIMIT:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "слишком много заявок, попробуйте позже",
        )
    dq.append(now)


class ContactCreate(BaseModel):
    org_name: str | None = Field(default=None, max_length=255)
    email: EmailStr
    message: str | None = Field(default=None, max_length=5000)
    # Honeypot: реальные пользователи не заполняют скрытое поле; боты — заполняют.
    website: str | None = Field(default=None, max_length=255)


class ContactLeadOut(BaseModel):
    id: int
    org_name: str | None
    email: str
    message: str | None
    source_host: str | None
    status: str
    created_at: str


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_lead(
    payload: ContactCreate, request: Request, db: AsyncSession = Depends(get_db)
) -> dict:
    _throttle(request)
    # Honeypot заполнен → молча «успех», запись не создаём (не подсказываем боту).
    if payload.website:
        return {"ok": True}
    lead = ContactLead(
        org_name=(payload.org_name or None),
        email=str(payload.email),
        message=(payload.message or None),
        source_host=request.headers.get("host"),
    )
    db.add(lead)
    await db.commit()
    return {"ok": True}


@router.get("", dependencies=[Depends(require_platform_admin)])
async def list_leads(
    status_filter: str | None = None, db: AsyncSession = Depends(get_db)
) -> dict:
    q = select(ContactLead).order_by(ContactLead.created_at.desc())
    if status_filter:
        q = q.where(ContactLead.status == status_filter)
    rows = (await db.execute(q)).scalars().all()
    return {
        "leads": [
            ContactLeadOut(
                id=r.id, org_name=r.org_name, email=r.email, message=r.message,
                source_host=r.source_host, status=r.status,
                created_at=r.created_at.isoformat() if r.created_at else "",
            ).model_dump()
            for r in rows
        ]
    }


@router.patch("/{lead_id}/status", dependencies=[Depends(require_platform_admin)])
async def set_lead_status(lead_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    lead = await db.get(ContactLead, lead_id)
    if lead is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "заявка не найдена")
    lead.status = "handled" if lead.status == "new" else "new"
    await db.commit()
    return {"id": lead.id, "status": lead.status}
