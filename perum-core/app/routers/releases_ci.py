"""CI-публикация релизов: GitHub Actions при РЕАЛЬНОМ изменении кода тенанта
вызывает этот эндпоинт и регистрирует релиз в ядре автоматически. Аутентификация —
по bearer-токену RELEASE_PUBLISH_TOKEN (отдельный секрет, не platform_admin).
Если токен не задан в ядре — эндпоинт выключен (503). См. docs/RELEASING.md."""

from __future__ import annotations

import secrets as secrets_mod

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_db
from app.routers.releases import ReleaseCreate, _release_dict, publish_release_record

router = APIRouter()


async def _require_release_token(authorization: str | None = Header(default=None)) -> None:
    settings = get_settings()
    if not settings.RELEASE_PUBLISH_TOKEN:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "CI-публикация релизов выключена (нет RELEASE_PUBLISH_TOKEN)")
    token = ""
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:]
    if not secrets_mod.compare_digest(token, settings.RELEASE_PUBLISH_TOKEN):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid release token")


@router.post("/release", status_code=status.HTTP_201_CREATED, dependencies=[Depends(_require_release_token)])
async def ci_publish_release(payload: ReleaseCreate, db: AsyncSession = Depends(get_db)) -> dict:
    rel = await publish_release_record(payload, db)
    return _release_dict(rel)
