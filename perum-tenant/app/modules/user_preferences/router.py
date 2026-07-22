import hashlib
import json

from fastapi import APIRouter, Depends, Header, Response
from fastapi.responses import JSONResponse
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_user
from app.core.time import utc_now
from app.models import IdempotencyReceipt, User, UserPreferences
from app.modules.user_preferences.schemas import PreferencesPatch, PreferencesResponse

router = APIRouter(prefix="/user/preferences")
_SCOPE = "PATCH /api/user/preferences"


def _etag(version: int) -> str:
    return f'"{version}"'


def _snapshot(preferences: UserPreferences) -> dict:
    return PreferencesResponse.model_validate(preferences, from_attributes=True).model_dump(mode="json")


def _error(
    status_code: int,
    code: str,
    message: str,
    headers: dict[str, str] | None = None,
    **details: object,
) -> JSONResponse:
    body: dict[str, object] = {"error": {"code": code, "message": message}}
    if details:
        body["error"]["details"] = details
    return JSONResponse(status_code=status_code, content=body, headers=headers)


async def _get_preferences(db: AsyncSession, user_id: int) -> UserPreferences:
    preferences = await db.get(UserPreferences, user_id)
    if preferences is None:
        preferences = UserPreferences(user_id=user_id)
        db.add(preferences)
        await db.flush()
        await db.refresh(preferences)
    return preferences


@router.get("", response_model=PreferencesResponse)
async def get_preferences(
    response: Response,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserPreferences:
    preferences = await _get_preferences(db, user.id)
    await db.commit()
    response.headers["ETag"] = _etag(preferences.version)
    return preferences


@router.patch("", response_model=PreferencesResponse)
async def patch_preferences(
    body: PreferencesPatch,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    if_match: str | None = Header(None, alias="If-Match"),
) -> Response:
    if not idempotency_key:
        return _error(400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key header is required")
    if if_match is None:
        return _error(428, "IF_MATCH_REQUIRED", "If-Match header is required")
    fingerprint = hashlib.sha256(
        json.dumps(body.model_dump(mode="json"), sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    receipt = await db.scalar(
        select(IdempotencyReceipt).where(
            IdempotencyReceipt.user_id == user.id,
            IdempotencyReceipt.scope == _SCOPE,
            IdempotencyReceipt.idempotency_key == idempotency_key,
        )
    )
    if receipt is not None:
        if receipt.request_fingerprint != fingerprint:
            return _error(409, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was used for another request")
        return Response(
            content=receipt.response_body,
            status_code=receipt.response_status,
            media_type="application/json",
            headers={"ETag": receipt.response_etag} if receipt.response_etag else None,
        )
    preferences = await _get_preferences(db, user.id)
    current = _snapshot(preferences)
    current_etag = _etag(preferences.version)
    if if_match != current_etag:
        return _error(
            412,
            "VERSION_CONFLICT",
            "Preferences were changed by another request",
            headers={"ETag": current_etag},
            current=current,
            etag=current_etag,
        )
    if preferences.push_preview_enabled != body.push_preview_enabled:
        now = utc_now()
        result = await db.execute(
            update(UserPreferences)
            .where(
                UserPreferences.user_id == user.id,
                UserPreferences.version == preferences.version,
            )
            .values(
                push_preview_enabled=body.push_preview_enabled,
                version=preferences.version + 1,
                updated_at=now,
            )
        )
        if result.rowcount != 1:
            await db.rollback()
            current_preferences = await _get_preferences(db, user.id)
            return _error(
                412,
                "VERSION_CONFLICT",
                "Preferences were changed by another request",
                headers={"ETag": _etag(current_preferences.version)},
                current=_snapshot(current_preferences),
                etag=_etag(current_preferences.version),
            )
        await db.refresh(preferences)
    response_body = json.dumps(_snapshot(preferences), separators=(",", ":"))
    response_etag = _etag(preferences.version)
    db.add(
        IdempotencyReceipt(
            user_id=user.id,
            scope=_SCOPE,
            idempotency_key=idempotency_key,
            request_fingerprint=fingerprint,
            response_status=200,
            response_body=response_body,
            response_etag=response_etag,
        )
    )
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        receipt = await db.scalar(
            select(IdempotencyReceipt).where(
                IdempotencyReceipt.user_id == user.id,
                IdempotencyReceipt.scope == _SCOPE,
                IdempotencyReceipt.idempotency_key == idempotency_key,
            )
        )
        if receipt is None:
            raise
        if receipt.request_fingerprint != fingerprint:
            return _error(409, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was used for another request")
        return Response(
            content=receipt.response_body,
            status_code=receipt.response_status,
            media_type="application/json",
            headers={"ETag": receipt.response_etag} if receipt.response_etag else None,
        )
    return Response(
        content=response_body,
        status_code=200,
        media_type="application/json",
        headers={"ETag": response_etag},
    )
