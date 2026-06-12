"""On-demand TLS gate для Caddy (Фаза 4). Перед выпуском сертификата для домена
Caddy спрашивает ядро: `GET /internal/validate-domain?domain=<host>`. 2xx — выдать,
иначе — отказать (защита от выпуска сертов на произвольные хосты).

Разрешаем: поддомены базового домена (школьные стеки) и зарегистрированные
кастомные домены школ (SchoolDomain, кроме removed). Путь не публикуется наружу —
Caddy ходит по внутренней сети.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import PlainTextResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_db
from app.models import OrganizationDomain, SchoolDomain

router = APIRouter()


@router.get("/validate-domain", response_class=PlainTextResponse)
async def validate_domain(domain: str = Query(...), db: AsyncSession = Depends(get_db)) -> str:
    host = (domain or "").strip().lower().split(":")[0]
    base = get_settings().PUBLIC_BASE_DOMAIN.lower()
    # Платформенные хосты: апекс (лендинг ядра) и admin (консоль платформы).
    if host == base or host == f"admin.{base}":
        return "ok"
    # ВАЖНО: НЕ выдаём сертификат на любой `*.{base}` (раньше endswith пропускал
    # любой поддомен). С wildcard-DNS это давало сканерам выпускать серты на
    # mail/www/vpn/случайные строки и грозило rate-limit Let's Encrypt. Теперь —
    # только хосты, реально зарегистрированные как домены школы или (легаси) орг.
    known_school = await db.scalar(
        select(SchoolDomain.id).where(SchoolDomain.domain == host, SchoolDomain.status != "removed")
    )
    if known_school:
        return "ok"
    known_org = await db.scalar(
        select(OrganizationDomain.id).where(OrganizationDomain.domain == host, OrganizationDomain.status != "removed")
    )
    if known_org:
        return "ok"
    raise HTTPException(status.HTTP_403_FORBIDDEN, f"домен {host} не разрешён")
