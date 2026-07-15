import asyncio
import hashlib
import io
import os
from datetime import timedelta

import pytest
from fastapi import HTTPException, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from starlette.datastructures import Headers

from app.core.config import Settings
from app.core.db import Base
from app.core.time import utc_now
from app.models import Organization, School, User
from app.models.media import MediaAuditEvent, MediaObject, MediaScanResult
from app.models.social import SocialSettings
from app.modules.media import service
from app.modules.media.scanner import FakeScanner, UnavailableScanner
from app.modules.media.schemas import UploadSessionCreate
from app.modules.media.storage import LocalPrivateStorage


PNG = b"\x89PNG\r\n\x1a\n" + b"safe image data"


async def seed(tmp_path):
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    db = async_sessionmaker(engine, expire_on_commit=False)()
    org = Organization(slug="x", name="X")
    db.add(org)
    await db.flush()
    schools = [School(org_id=org.id, name="A"), School(org_id=org.id, name="B")]
    db.add_all(schools)
    await db.flush()
    users = [User(school_id=school.id, role="student", login=f"u{school.id}", password_hash="x") for school in schools]
    db.add_all(users)
    db.add_all([SocialSettings(school_id=school.id, social_enabled=True, message_attachments_enabled=True) for school in schools])
    await db.commit()
    settings = Settings(MEDIA_ENABLED=True, MEDIA_ROOT=str(tmp_path), MEDIA_OWNER_GRACE_S=60, MEDIA_UNBOUND_TTL_S=60)
    return engine, db, users, settings, LocalPrivateStorage(tmp_path)


def payload(client_id="one", data=PNG, **changes):
    values = {
        "client_upload_id": client_id,
        "purpose": "social_attachment",
        "filename": "image.png",
        "mime_type": "image/png",
        "size": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
    }
    values.update(changes)
    return UploadSessionCreate(**values)


def upload(data=PNG, mime="image/png"):
    return UploadFile(file=io.BytesIO(data), filename="image.png", headers=Headers({"content-type": mime}))


def test_validation_storage_and_partial_cleanup(tmp_path):
    async def run():
        store = LocalPrivateStorage(tmp_path)
        assert oct(os.stat(tmp_path).st_mode & 0o777) == "0o700"
        with pytest.raises(ValueError):
            store.path("../escape")
        key, size, material = await store.write(upload(), len(PNG))
        assert size == len(PNG)
        assert material[-32:].hex() == hashlib.sha256(PNG).hexdigest()
        assert oct(os.stat(store.path(key)).st_mode & 0o777) == "0o600"
        with pytest.raises(ValueError):
            await store.write(upload(PNG + b"x"), len(PNG))
        assert len(list((tmp_path / "quarantine").glob("*/*"))) == 1
    asyncio.run(run())


def test_session_idempotency_limits_and_validation(tmp_path):
    async def run():
        engine, db, users, settings, _ = await seed(tmp_path)
        try:
            first = await service.create_session(db, users[0], payload(), settings)
            assert (await service.create_session(db, users[0], payload(), settings)).id == first.id
            with pytest.raises(HTTPException) as conflict:
                await service.create_session(db, users[0], payload(filename="other.png"), settings)
            assert conflict.value.status_code == 409
            await service.create_session(db, users[0], payload("two"), settings)
            await service.create_session(db, users[0], payload("three"), settings)
            with pytest.raises(HTTPException) as limited:
                await service.create_session(db, users[0], payload("four"), settings)
            assert limited.value.status_code == 429
            for invalid in (payload("bad-type", mime_type="text/plain"), payload("bad-ext", filename="image.jpg"), payload("bad-purpose", purpose="support_attachment")):
                with pytest.raises(HTTPException):
                    service.validate_declaration(invalid, settings)
        finally:
            await db.close()
            await engine.dispose()
    asyncio.run(run())


def test_upload_scan_auth_bind_and_infected_states(tmp_path):
    async def run():
        engine, db, users, settings, store = await seed(tmp_path)
        try:
            session = await service.create_session(db, users[0], payload(), settings)
            object_ = await service.upload_content(db, users[0], session.id, upload(), store, settings)
            assert object_.state == "pending"
            assert (await service.authorized_object(db, users[0], object_.id, settings=settings)).id == object_.id
            with pytest.raises(HTTPException):
                await service.authorized_object(db, users[0], object_.id, content=True, settings=settings)
            with pytest.raises(HTTPException):
                await service.authorized_object(db, users[1], object_.id, settings=settings)
            attempted = set()
            unavailable = await service.scan_pending(db, UnavailableScanner(), store, attempted=attempted)
            assert unavailable["unavailable"] == 1
            assert object_.state == "pending"
            assert sum((await service.scan_pending(db, UnavailableScanner(), store, attempted=attempted)).values()) == 0
            assert await db.scalar(select(func.count()).select_from(MediaScanResult).where(MediaScanResult.object_id == object_.id)) == 1
            assert await db.scalar(select(func.count()).select_from(MediaAuditEvent).where(MediaAuditEvent.object_id == object_.id, MediaAuditEvent.event_type == "scan_completed")) == 1
            clean = await service.scan_pending(db, FakeScanner("clean"), store)
            assert clean["clean"] == 1
            assert object_.state == "clean"
            assert object_.storage_key.startswith("clean/")
            assert (await service.authorized_object(db, users[0], object_.id, content=True, settings=settings)).id == object_.id
            await service.bind_media(db, object_.id, users[0].school_id, users[0].id, "message", "42")
            with pytest.raises(HTTPException):
                await service.authorized_object(db, users[0], object_.id, content=True, settings=settings)
            async def authorize(db_, user, resource_id):
                return user.id == users[0].id and resource_id == "42"
            service.register_binding_authorizer("message", authorize)
            assert (await service.authorized_object(db, users[0], object_.id, content=True, settings=settings)).id == object_.id
            infected_session = await service.create_session(db, users[0], payload("infected"), settings)
            infected = await service.upload_content(db, users[0], infected_session.id, upload(), store, settings)
            await service.scan_pending(db, FakeScanner("infected"), store)
            assert infected.state == "infected"
            assert not store.exists(infected.storage_key)
            with pytest.raises(HTTPException):
                await service.bind_media(db, infected.id, users[0].school_id, users[0].id, "message", "43")
        finally:
            service.binding_authorizers.clear()
            await db.close()
            await engine.dispose()
    asyncio.run(run())


def test_mismatch_expiry_grace_and_cleanup(tmp_path):
    async def run():
        engine, db, users, settings, store = await seed(tmp_path)
        try:
            bad = await service.create_session(db, users[0], payload(), settings)
            with pytest.raises(HTTPException) as mismatch:
                await service.upload_content(db, users[0], bad.id, upload(PNG + b"changed"), store, settings)
            assert mismatch.value.status_code == 422
            assert bad.state == "failed"
            expiring = await service.create_session(db, users[0], payload("expiring"), settings)
            expiring.expires_at = utc_now() - timedelta(seconds=1)
            clean_session = await service.create_session(db, users[0], payload("clean"), settings)
            object_ = await service.upload_content(db, users[0], clean_session.id, upload(), store, settings)
            await service.scan_pending(db, FakeScanner("clean"), store)
            object_.owner_grace_until = utc_now() - timedelta(seconds=1)
            object_.created_at = utc_now() - timedelta(seconds=120)
            await db.commit()
            with pytest.raises(HTTPException):
                await service.authorized_object(db, users[0], object_.id, content=True, settings=settings)
            counts = await service.cleanup(db, store, settings)
            assert counts == {"expired_sessions": 1, "deleted_objects": 1}
            assert expiring.state == "expired"
            assert object_.state == "deleted"
            assert await service.cleanup(db, store, settings) == {"expired_sessions": 0, "deleted_objects": 0}
        finally:
            await db.close()
            await engine.dispose()
    asyncio.run(run())
