"""Настройка источника OTA-обновлений (platform_admin).

Платформенный админ задаёт, ОТКУДА берутся образы тенанта для обновления школ:
реестр, репозиторий/образ и — для приватного реестра — логин и токен (GH PAT с
`read:packages`). Токен хранится зашифрованным (EncryptedString) и НИКОГДА не
отдаётся обратно — в ответе только флаг `token_set`.

Как применяется: на хостах, где тянутся образы тенанта, нужен `docker login` в
реестр этим логином/токеном (для приватных образов). Значения отсюда — источник
истины для инструкции и будущей авто-настройки pull-доступа.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models import PlatformSetting

router = APIRouter()

# Ключи настроек источника OTA.
K_REGISTRY = "ota_image_registry"
K_REPOSITORY = "ota_image_repository"
K_USERNAME = "ota_registry_username"
K_TOKEN = "ota_registry_token"
K_PRIVATE = "ota_registry_private"


async def get_setting(db: AsyncSession, key: str) -> str | None:
    row = (await db.execute(select(PlatformSetting).where(PlatformSetting.key == key))).scalar_one_or_none()
    return row.value if row else None


async def set_setting(db: AsyncSession, key: str, value: str | None) -> None:
    row = (await db.execute(select(PlatformSetting).where(PlatformSetting.key == key))).scalar_one_or_none()
    if row is None:
        db.add(PlatformSetting(key=key, value=value))
    else:
        row.value = value


class OtaConfigUpdate(BaseModel):
    image_registry: str | None = None
    image_repository: str | None = None
    registry_username: str | None = None
    # Токен пишется только если передан непустым; пустая строка/None — не трогаем.
    registry_token: str | None = None
    private: bool | None = None
    # Явный сброс токена (отвязать приватный доступ).
    clear_token: bool = False


async def _config_response(db: AsyncSession) -> dict:
    token = await get_setting(db, K_TOKEN)
    return {
        "image_registry": await get_setting(db, K_REGISTRY) or "ghcr.io",
        "image_repository": await get_setting(db, K_REPOSITORY),
        "registry_username": await get_setting(db, K_USERNAME),
        "private": (await get_setting(db, K_PRIVATE)) == "1",
        "token_set": bool(token),  # сам токен наружу не отдаём
    }


@router.get("")
async def get_ota_config(db: AsyncSession = Depends(get_db)) -> dict:
    return await _config_response(db)


@router.put("")
async def update_ota_config(payload: OtaConfigUpdate, db: AsyncSession = Depends(get_db)) -> dict:
    if payload.image_registry is not None:
        await set_setting(db, K_REGISTRY, payload.image_registry.strip() or None)
    if payload.image_repository is not None:
        await set_setting(db, K_REPOSITORY, payload.image_repository.strip() or None)
    if payload.registry_username is not None:
        await set_setting(db, K_USERNAME, payload.registry_username.strip() or None)
    if payload.private is not None:
        await set_setting(db, K_PRIVATE, "1" if payload.private else "0")
    if payload.clear_token:
        await set_setting(db, K_TOKEN, None)
    elif payload.registry_token:
        await set_setting(db, K_TOKEN, payload.registry_token.strip())
    await db.commit()
    return await _config_response(db)
