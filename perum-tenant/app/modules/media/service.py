import asyncio
import logging
import re
import uuid
from collections.abc import Awaitable, Callable
from datetime import timedelta
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.db import SessionLocal
from app.core.time import utc_now
from app.models import User
from app.models.media import MediaAuditEvent, MediaBinding, MediaObject, MediaScanResult, UploadSession
from app.models.social import SocialSettings
from app.modules.media.scanner import MediaScanner, scanner_runtime
from app.modules.media.schemas import UploadSessionCreate
from app.modules.media.storage import LocalPrivateStorage

logger = logging.getLogger("perum.tenant.media")

ALLOWED_TYPES = {
    "image/jpeg": ({".jpg", ".jpeg"}, lambda data: data.startswith(b"\xff\xd8\xff")),
    "image/png": ({".png"}, lambda data: data.startswith(b"\x89PNG\r\n\x1a\n")),
    "image/webp": ({".webp"}, lambda data: len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP"),
    "application/pdf": ({".pdf"}, lambda data: data.startswith(b"%PDF-")),
}
ACTIVE_SESSION_STATES = {"created", "uploading"}
BindingAuthorizer = Callable[[AsyncSession, User, str], Awaitable[bool]]
binding_authorizers: dict[str, BindingAuthorizer] = {}


def register_binding_authorizer(binding_type: str, authorizer: BindingAuthorizer) -> None:
    binding_authorizers[binding_type] = authorizer


def storage(settings: Settings | None = None) -> LocalPrivateStorage:
    return LocalPrivateStorage((settings or get_settings()).MEDIA_ROOT)


def _audit(school_id: int, event_type: str, outcome: str, actor_id: int | None = None, session_id: str | None = None, object_id: str | None = None) -> MediaAuditEvent:
    return MediaAuditEvent(id=str(uuid.uuid4()), school_id=school_id, actor_id=actor_id, session_id=session_id, object_id=object_id, event_type=event_type, outcome=outcome)


def validate_declaration(payload: UploadSessionCreate, settings: Settings) -> str:
    if payload.purpose != "social_attachment":
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "unsupported media purpose")
    if payload.size > settings.MEDIA_MAX_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "file too large")
    if payload.mime_type not in ALLOWED_TYPES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "unsupported media type")
    if payload.filename != Path(payload.filename).name or re.search(r"[\x00-\x1f\x7f]", payload.filename):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "invalid filename")
    extension = Path(payload.filename).suffix.lower()
    if extension not in ALLOWED_TYPES[payload.mime_type][0]:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "filename does not match media type")
    return extension


async def _ensure_enabled(db: AsyncSession, user: User, settings: Settings) -> None:
    if not settings.MEDIA_ENABLED or user.school_id is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "media unavailable")
    social = await db.get(SocialSettings, user.school_id)
    if social is None or not social.message_attachments_enabled:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "attachments unavailable")


async def create_session(db: AsyncSession, user: User, payload: UploadSessionCreate, settings: Settings | None = None) -> UploadSession:
    settings = settings or get_settings()
    await _ensure_enabled(db, user, settings)
    validate_declaration(payload, settings)
    await db.scalar(select(User.id).where(User.id == user.id).with_for_update())
    existing = await db.scalar(select(UploadSession).where(UploadSession.school_id == user.school_id, UploadSession.owner_id == user.id, UploadSession.client_upload_id == payload.client_upload_id))
    if existing is not None:
        exact = (existing.purpose, existing.filename, existing.declared_mime, existing.declared_size, existing.declared_sha256) == (payload.purpose, payload.filename, payload.mime_type, payload.size, payload.sha256)
        if not exact:
            raise HTTPException(status.HTTP_409_CONFLICT, "client upload id conflict")
        return existing
    active = await db.scalar(select(func.count()).select_from(UploadSession).where(UploadSession.school_id == user.school_id, UploadSession.owner_id == user.id, UploadSession.state.in_(ACTIVE_SESSION_STATES), UploadSession.expires_at > utc_now()))
    if active >= 3:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "too many active uploads")
    now = utc_now()
    session = UploadSession(id=str(uuid.uuid4()), school_id=user.school_id, owner_id=user.id, client_upload_id=payload.client_upload_id, purpose=payload.purpose, filename=payload.filename, declared_mime=payload.mime_type, declared_size=payload.size, declared_sha256=payload.sha256, expires_at=now + timedelta(seconds=settings.MEDIA_SESSION_TTL_S))
    db.add(session)
    db.add(_audit(user.school_id, "session_created", "accepted", user.id, session.id))
    await db.commit()
    await db.refresh(session)
    return session


async def owned_session(db: AsyncSession, user: User, session_id: str, settings: Settings | None = None) -> UploadSession:
    if not (settings or get_settings()).MEDIA_ENABLED:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "media unavailable")
    session = await db.scalar(select(UploadSession).where(UploadSession.id == session_id, UploadSession.school_id == user.school_id, UploadSession.owner_id == user.id).with_for_update())
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "upload session not found")
    return session


async def upload_content(db: AsyncSession, user: User, session_id: str, upload: UploadFile, store: LocalPrivateStorage | None = None, settings: Settings | None = None) -> MediaObject:
    settings = settings or get_settings()
    await _ensure_enabled(db, user, settings)
    session = await owned_session(db, user, session_id, settings)
    if session.state == "completed" and session.object_id:
        return await db.get(MediaObject, session.object_id)
    if session.state != "created" or session.expires_at <= utc_now():
        raise HTTPException(status.HTTP_409_CONFLICT, "upload session is not active")
    if upload.content_type != session.declared_mime:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "multipart media type mismatch")
    session.state = "uploading"
    await db.commit()
    store = store or storage(settings)
    key = None
    try:
        key, actual_size, material = await store.write(upload, settings.MEDIA_MAX_BYTES)
        prefix, actual_digest = material[:-32], material[-32:].hex()
        if actual_size != session.declared_size or actual_digest != session.declared_sha256:
            raise ValueError("size or checksum mismatch")
        if not ALLOWED_TYPES[session.declared_mime][1](prefix):
            raise ValueError("file signature mismatch")
        now = utc_now()
        object_ = MediaObject(id=str(uuid.uuid4()), school_id=session.school_id, owner_id=session.owner_id, purpose=session.purpose, filename=session.filename, mime_type=session.declared_mime, extension=Path(session.filename).suffix.lower(), size_bytes=actual_size, sha256=actual_digest, storage_key=key, owner_grace_until=now + timedelta(seconds=settings.MEDIA_OWNER_GRACE_S))
        db.add(object_)
        await db.flush()
        session.state = "completed"
        session.object_id = object_.id
        session.completed_at = now
        db.add(_audit(session.school_id, "upload_completed", "pending_scan", user.id, session.id, object_.id))
        await db.commit()
        await db.refresh(object_)
        return object_
    except ValueError as exc:
        if key:
            store.delete(key)
        session.state = "failed"
        db.add(_audit(session.school_id, "upload_failed", "validation", user.id, session.id))
        await db.commit()
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc))
    except BaseException:
        if key:
            store.delete(key)
        await db.rollback()
        raise


async def delete_session(db: AsyncSession, user: User, session_id: str, settings: Settings | None = None) -> None:
    session = await owned_session(db, user, session_id, settings)
    if session.state == "completed":
        raise HTTPException(status.HTTP_409_CONFLICT, "completed upload cannot be cancelled")
    if session.state in ACTIVE_SESSION_STATES:
        session.state = "cancelled"
        db.add(_audit(session.school_id, "session_cancelled", "accepted", user.id, session.id))
        await db.commit()


async def bind_media(db: AsyncSession, object_id: str, school_id: int, actor_id: int, binding_type: str, resource_id: str) -> MediaBinding:
    object_ = await db.scalar(select(MediaObject).where(MediaObject.id == object_id, MediaObject.school_id == school_id))
    if object_ is None or object_.state != "clean":
        raise HTTPException(status.HTTP_409_CONFLICT, "media is not clean")
    existing = await db.scalar(select(MediaBinding).where(MediaBinding.school_id == school_id, MediaBinding.object_id == object_id, MediaBinding.binding_type == binding_type, MediaBinding.resource_id == resource_id))
    if existing is not None:
        return existing
    binding = MediaBinding(id=str(uuid.uuid4()), school_id=school_id, object_id=object_id, binding_type=binding_type, resource_id=resource_id, bound_by_id=actor_id)
    db.add(binding)
    db.add(_audit(school_id, "object_bound", "accepted", actor_id, object_id=object_id))
    await db.commit()
    await db.refresh(binding)
    return binding


async def authorized_object(db: AsyncSession, user: User, object_id: str, content: bool = False, settings: Settings | None = None) -> MediaObject:
    if not (settings or get_settings()).MEDIA_ENABLED:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "media unavailable")
    object_ = await db.scalar(select(MediaObject).where(MediaObject.id == object_id, MediaObject.school_id == user.school_id))
    if object_ is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "media object not found")
    bindings = (await db.scalars(select(MediaBinding).where(MediaBinding.school_id == user.school_id, MediaBinding.object_id == object_id))).all()
    owner_unbound = object_.owner_id == user.id and not bindings
    if content and (object_.state != "clean" or (owner_unbound and object_.owner_grace_until <= utc_now())):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "media object not found")
    if owner_unbound:
        return object_
    for binding in bindings:
        authorizer = binding_authorizers.get(binding.binding_type)
        if authorizer is not None and await authorizer(db, user, binding.resource_id):
            return object_
    raise HTTPException(status.HTTP_404_NOT_FOUND, "media object not found")


async def claim_pending(db: AsyncSession, limit: int, lease_s: int) -> tuple[str, list[MediaObject]]:
    now = utc_now()
    token = str(uuid.uuid4())
    candidates = list(await db.scalars(
        select(MediaObject.id)
        .where(
            MediaObject.state == "pending",
            or_(MediaObject.next_scan_at.is_(None), MediaObject.next_scan_at <= now),
            or_(MediaObject.scan_lease_expires_at.is_(None), MediaObject.scan_lease_expires_at <= now),
        )
        .order_by(MediaObject.created_at)
        .limit(min(limit, 1))
        .with_for_update(skip_locked=True)
    ))
    if not candidates:
        return token, []
    await db.execute(
        update(MediaObject)
        .where(
            MediaObject.id.in_(candidates),
            MediaObject.state == "pending",
            or_(MediaObject.scan_lease_expires_at.is_(None), MediaObject.scan_lease_expires_at <= now),
        )
        .values(scan_lease_token=token, scan_lease_expires_at=now + timedelta(seconds=lease_s))
    )
    await db.commit()
    objects = list(await db.scalars(select(MediaObject).where(MediaObject.scan_lease_token == token).order_by(MediaObject.created_at)))
    return token, objects


async def scan_pending(db: AsyncSession, scanner: MediaScanner, store: LocalPrivateStorage, limit: int = 100, settings: Settings | None = None) -> dict[str, int]:
    settings = settings or get_settings()
    counts = {"clean": 0, "infected": 0, "unavailable": 0, "error": 0, "missing": 0}
    for _ in range(limit):
        token, objects = await claim_pending(db, 1, settings.SCANNER_LEASE_S)
        if not objects:
            break
        object_ = objects[0]
        await db.refresh(object_)
        if object_.scan_lease_token != token or object_.state != "pending":
            continue
        clean_key = f"clean/{object_.id[:2]}/{object_.id[2:]}"
        scan_key = object_.storage_key if store.exists(object_.storage_key) else clean_key if store.exists(clean_key) else None
        if scan_key is None:
            object_.state = "missing"
            object_.scanned_at = utc_now()
            object_.scan_lease_token = None
            object_.scan_lease_expires_at = None
            counts["missing"] += 1
            db.add(_audit(object_.school_id, "scan_completed", "missing", object_id=object_.id))
            await db.commit()
            continue
        verdict = await scanner.scan(store.path(scan_key))
        object_ = await db.scalar(select(MediaObject).where(MediaObject.id == object_.id).with_for_update())
        if object_ is None or object_.state != "pending" or object_.scan_lease_token != token or object_.scan_lease_expires_at is None or object_.scan_lease_expires_at <= utc_now():
            await db.rollback()
            continue
        signature_at = verdict.signature_at.replace(tzinfo=None) if verdict.signature_at else None
        db.add(MediaScanResult(id=str(uuid.uuid4()), school_id=object_.school_id, object_id=object_.id, scanner=verdict.scanner[:80], verdict=verdict.verdict, engine_version=verdict.engine_version[:40] if verdict.engine_version else None, signature_version=verdict.signature_version[:40] if verdict.signature_version else None, signature_at=signature_at, detail_code=verdict.detail_code[:40] if verdict.detail_code else None, duration_ms=verdict.duration_ms))
        counts[verdict.verdict] += 1
        object_.scan_attempts += 1
        if verdict.verdict == "clean":
            object_.storage_key = store.promote(object_.storage_key, clean_key)
            object_.state = "clean"
            object_.scanned_at = utc_now()
            object_.next_scan_at = None
        elif verdict.verdict == "infected":
            object_.state = "infected"
            object_.scanned_at = utc_now()
            object_.next_scan_at = None
        else:
            delay = min(settings.SCANNER_RETRY_MAX_S, settings.SCANNER_RETRY_BASE_S * (2 ** min(object_.scan_attempts - 1, 10)))
            object_.next_scan_at = utc_now() + timedelta(seconds=delay)
        object_.scan_lease_token = None
        object_.scan_lease_expires_at = None
        db.add(_audit(object_.school_id, "scan_completed", verdict.verdict, object_id=object_.id))
        await db.commit()
        if verdict.verdict == "infected":
            store.delete(scan_key)
    return counts


async def cleanup(db: AsyncSession, store: LocalPrivateStorage, settings: Settings, limit: int | None = None) -> dict[str, int]:
    now = utc_now()
    limit = limit or settings.MEDIA_CLEANUP_BATCH_SIZE
    expired = (await db.scalars(select(UploadSession).where(UploadSession.state.in_(ACTIVE_SESSION_STATES), UploadSession.expires_at <= now).limit(limit))).all()
    for session in expired:
        session.state = "expired"
        db.add(_audit(session.school_id, "session_expired", "expired", session_id=session.id))
    cutoff = now - timedelta(seconds=settings.MEDIA_UNBOUND_TTL_S)
    candidates = (await db.scalars(select(MediaObject).where(MediaObject.state.in_(("infected", "rejected", "missing")) | (MediaObject.state == "clean") & (MediaObject.created_at <= cutoff) | (MediaObject.state == "pending") & (MediaObject.created_at <= cutoff) & (or_(MediaObject.scan_lease_expires_at.is_(None), MediaObject.scan_lease_expires_at <= now))).order_by(MediaObject.created_at).limit(limit).with_for_update(skip_locked=True))).all()
    deleted = 0
    for object_ in candidates:
        bound = await db.scalar(select(MediaBinding.id).where(MediaBinding.object_id == object_.id, MediaBinding.school_id == object_.school_id))
        if bound is not None:
            continue
        store.delete(object_.storage_key)
        object_.state = "deleted"
        object_.deleted_at = now
        db.add(_audit(object_.school_id, "object_deleted", "cleanup", object_id=object_.id))
        deleted += 1
    await db.commit()
    return {"expired_sessions": len(expired), "deleted_objects": deleted}


async def media_loop(interval: int, settings: Settings | None = None, scanner: MediaScanner | None = None) -> None:
    settings = settings or get_settings()
    scanner = scanner or scanner_runtime()
    store = storage(settings)
    while True:
        try:
            async with SessionLocal() as db:
                scans = await scan_pending(db, scanner, store, settings.MEDIA_CLEANUP_BATCH_SIZE, settings)
                cleanup_counts = await cleanup(db, store, settings)
            logger.info("media maintenance scans=%s expired_sessions=%s deleted_objects=%s", sum(scans.values()), cleanup_counts["expired_sessions"], cleanup_counts["deleted_objects"])
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("media maintenance failed")
        await asyncio.sleep(interval)
