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

import base64
import logging
import re

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.models import PlatformSetting, Release

# Семвер x.y.z (с опциональным суффиксом-меткой, напр. 1.2.3-rc1).
_SEMVER_RE = re.compile(r"^\d+\.\d+\.\d+([-+][0-9A-Za-z.\-]+)?$")

logger = logging.getLogger("perum.ota_config")

router = APIRouter()

# Ключи настроек источника OTA.
K_REGISTRY = "ota_image_registry"
K_REPOSITORY = "ota_image_repository"
K_USERNAME = "ota_registry_username"
K_TOKEN = "ota_registry_token"
K_PRIVATE = "ota_registry_private"
K_SOURCE_REPO = "ota_source_repo"   # GitHub <owner>/<repo> (монорепо), откуда тянем версию
K_TENANT_PATH = "ota_tenant_path"   # папка тенанта в репо (для детекта изменений и ссылки)


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
    source_repo: str | None = None
    tenant_path: str | None = None
    # Явный сброс токена (отвязать приватный доступ).
    clear_token: bool = False


async def _config_response(db: AsyncSession) -> dict:
    token = await get_setting(db, K_TOKEN)
    return {
        "image_registry": await get_setting(db, K_REGISTRY) or "ghcr.io",
        "image_repository": await get_setting(db, K_REPOSITORY),
        "registry_username": await get_setting(db, K_USERNAME),
        "private": (await get_setting(db, K_PRIVATE)) == "1",
        "source_repo": await get_setting(db, K_SOURCE_REPO),
        "tenant_path": await get_setting(db, K_TENANT_PATH) or "perum-tenant",
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
    if payload.source_repo is not None:
        await set_setting(db, K_SOURCE_REPO, payload.source_repo.strip() or None)
    if payload.tenant_path is not None:
        await set_setting(db, K_TENANT_PATH, payload.tenant_path.strip() or None)
    if payload.clear_token:
        await set_setting(db, K_TOKEN, None)
    elif payload.registry_token:
        await set_setting(db, K_TOKEN, payload.registry_token.strip())
    await db.commit()
    return await _config_response(db)


async def _github_get(client: httpx.AsyncClient, url: str, headers: dict, **kwargs) -> httpx.Response:
    try:
        resp = await client.get(url, headers=headers, **kwargs)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"GitHub недоступен: {exc}")
    if resp.status_code == 401:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "GitHub отклонил токен (нужен read доступ к репо)")
    return resp


async def _read_version_file(client: httpx.AsyncClient, source_repo: str, tenant_path: str, ref: str, headers: dict) -> str | None:
    """Прочитать perum-tenant/VERSION в репо на коммите ref. Это источник семвера
    (x.y.z). Возвращает None, если файла нет (старые коммиты / нет дисциплины версий)."""
    url = f"https://api.github.com/repos/{source_repo}/contents/{tenant_path}/VERSION"
    resp = await _github_get(client, url, headers, params={"ref": ref})
    if resp.status_code == 404:
        return None
    if resp.status_code >= 300:
        return None
    data = resp.json()
    content = data.get("content") or ""
    try:
        text = base64.b64decode(content).decode("utf-8").strip()
    except Exception:  # noqa: BLE001
        return None
    return text or None


@router.post("/fetch-latest")
async def fetch_latest_version(db: AsyncSession = Depends(get_db)) -> dict:
    """Автоподтягивание релиза тенанта. Версия (x.y.z) берётся из файла
    `perum-tenant/VERSION` в репозитории, а ОБРАЗ остаётся на `git-<sha>` последнего
    коммита, затронувшего папку тенанта (этот образ реально пушит CI и его можно
    запуллить). git-sha — «код версии», version_tag — человеческая версия.

    Если версия из VERSION совпадает с текущим релизом ядра — возвращаем
    `up_to_date: true`, чтобы UI не предлагал опубликовать дубликат."""
    source_repo = await get_setting(db, K_SOURCE_REPO)
    if not source_repo:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "не задан GitHub-репозиторий источника (source_repo)")
    tenant_path = await get_setting(db, K_TENANT_PATH) or "perum-tenant"
    registry = await get_setting(db, K_REGISTRY) or "ghcr.io"
    repository = await get_setting(db, K_REPOSITORY) or f"{source_repo.split('/')[0]}/perum-tenant"
    token = await get_setting(db, K_TOKEN)

    headers = {"Accept": "application/vnd.github+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await _github_get(
            client,
            f"https://api.github.com/repos/{source_repo}/commits",
            headers,
            params={"path": tenant_path, "per_page": "5"},
        )
        if resp.status_code == 404:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"репозиторий или папка не найдены ({source_repo}/{tenant_path})")
        if resp.status_code >= 300:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"GitHub вернул {resp.status_code}: {resp.text[:200]}")
        commits = resp.json()
        if not commits:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"нет коммитов, затрагивающих {tenant_path}")

        sha = commits[0].get("sha", "")
        short = sha[:12]
        image_tag = f"git-{short}"
        version = await _read_version_file(client, source_repo, tenant_path, sha, headers)

    # Версия — из VERSION (семвер). Если файла нет — деградируем на git-тег, но
    # подсказываем добавить VERSION (иначе версии будут «как код», а не x.y.z).
    version_warning = None
    if version and _SEMVER_RE.match(version):
        version_tag = version
    else:
        version_tag = image_tag
        version_warning = f"в репозитории нет {tenant_path}/VERSION с версией x.y.z — версия показана как код коммита"

    image = f"{registry}/{repository}:{image_tag}"
    changelog = "\n".join(
        f"- {ci.get('commit', {}).get('message', '').splitlines()[0]}" for ci in commits if ci.get("commit")
    )

    # Дедуп: уже актуально, если такая версия — текущий релиз (или уже опубликована).
    current = (
        await db.execute(select(Release).where(Release.channel == "stable", Release.is_current.is_(True)).limit(1))
    ).scalar_one_or_none()
    existing = (
        await db.execute(select(Release).where(Release.channel == "stable", Release.version_tag == version_tag).limit(1))
    ).scalar_one_or_none()
    up_to_date = existing is not None or (
        current is not None and (current.version_tag == version_tag or current.source_commit == sha)
    )

    return {
        "version_tag": version_tag,
        "image": image,
        "source_commit": sha,
        "changelog": changelog,
        "commit_url": f"https://github.com/{source_repo}/commit/{sha}",
        "tree_url": f"https://github.com/{source_repo}/tree/{sha}/{tenant_path}",
        "tenant_path": tenant_path,
        "source_repo": source_repo,
        "up_to_date": up_to_date,
        "current_version": current.version_tag if current else None,
        "version_warning": version_warning,
    }
