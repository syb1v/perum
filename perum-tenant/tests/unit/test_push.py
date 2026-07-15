import asyncio
import base64
from datetime import timedelta
from uuid import uuid4

import pytest
from cryptography.exceptions import InvalidTag
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.core.db import Base
from app.core.deps import get_current_refresh_session
from app.core.security import create_access_token, hash_password
from app.core.time import utc_now
from app.models import Organization, PushEndpoint, PushInstallation, PushOutbox, PushRegistration, RefreshSession, School, User
from app.modules.auth.service import revoke_all, revoke_session
from app.modules.push.crypto import PushCryptoUnavailable, decrypt_token, encrypt_token, encryption_key
from app.modules.push.schemas import RegistrationPut
from app.modules.push.service import capability, enqueue, register, revoke


async def _db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    db = async_sessionmaker(engine, expire_on_commit=False)()
    org = Organization(slug="push", name="Push")
    db.add(org)
    await db.flush()
    school = School(org_id=org.id, name="Push")
    db.add(school)
    await db.flush()
    users = [User(school_id=school.id, role="student", login=f"user-{index}", password_hash=hash_password("secret")) for index in range(2)]
    db.add_all(users)
    await db.flush()
    sessions = [RefreshSession(user_id=user.id, session_token=f"session-{index}", refresh_token_hash=f"hash-{index}", expires_at=utc_now() + timedelta(days=1)) for index, user in enumerate(users)]
    db.add_all(sessions)
    await db.commit()
    return engine, db, school, users, sessions


def _configure(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "PUSH_TOKEN_ENCRYPTION_KEY", base64.b64encode(b"k" * 32).decode())
    monkeypatch.setattr(settings, "PUSH_TOKEN_HASH_KEY", "hash-secret")


def _payload(token="provider-token-value"):
    return RegistrationPut(provider="expo", platform="android", environment="production", token=token, app_id="school.perum", app_version="1.0")


def test_push_crypto_fail_closed_round_trip_and_tamper():
    with pytest.raises(PushCryptoUnavailable):
        encryption_key("")
    key = b"k" * 32
    aad = b"expo\0production\0school.perum"
    ciphertext = encrypt_token("provider-token-value", key, aad)
    assert b"provider-token-value" not in ciphertext
    assert decrypt_token(ciphertext, key, aad) == "provider-token-value"
    tampered = ciphertext[:-1] + bytes([ciphertext[-1] ^ 1])
    with pytest.raises(InvalidTag):
        decrypt_token(tampered, key, aad)


def test_registration_requires_session_backed_access_token():
    async def scenario():
        engine, db, _, users, _ = await _db()
        token = create_access_token(subject=str(users[0].id))
        with pytest.raises(HTTPException) as error:
            await get_current_refresh_session(users[0], HTTPAuthorizationCredentials(scheme="Bearer", credentials=token), db)
        assert error.value.status_code == 401
        await db.close()
        await engine.dispose()
    asyncio.run(scenario())


def test_registration_fail_closed_idempotent_isolated_and_revoked(monkeypatch):
    async def scenario():
        engine, db, _, users, sessions = await _db()
        installation_id = str(uuid4())
        settings = get_settings()
        monkeypatch.setattr(settings, "PUSH_TOKEN_ENCRYPTION_KEY", "")
        monkeypatch.setattr(settings, "PUSH_TOKEN_HASH_KEY", "")
        assert capability() == {"registration_supported": True, "registration_available": False, "delivery_enabled": False, "configured_providers": []}
        with pytest.raises(HTTPException) as error:
            await register(db, users[0], sessions[0], installation_id, _payload())
        assert error.value.status_code == 503
        assert await db.scalar(select(func.count(PushInstallation.id))) == 0
        _configure(monkeypatch)
        await register(db, users[0], sessions[0], installation_id, _payload())
        await register(db, users[0], sessions[0], installation_id, _payload())
        assert await db.scalar(select(func.count(PushEndpoint.id))) == 1
        assert await db.scalar(select(func.count(PushRegistration.id))) == 1
        endpoint = await db.scalar(select(PushEndpoint))
        assert b"provider-token-value" not in endpoint.token_ciphertext
        assert endpoint.token_hash != "provider-token-value"
        assert not await revoke(db, users[1], sessions[1], installation_id)
        assert await revoke(db, users[0], sessions[0], installation_id)
        await db.close()
        await engine.dispose()
    asyncio.run(scenario())


def test_duplicate_token_replacement_logout_and_suppressed_dedupe(monkeypatch):
    async def scenario():
        _configure(monkeypatch)
        engine, db, school, users, sessions = await _db()
        first, second = str(uuid4()), str(uuid4())
        await register(db, users[0], sessions[0], first, _payload())
        await register(db, users[0], sessions[0], second, _payload())
        registrations = list((await db.scalars(select(PushRegistration).order_by(PushRegistration.created_at))).all())
        assert len(registrations) == 2
        assert {row.state for row in registrations} == {"active", "revoked"}
        await enqueue(db, school.id, users[0].id, "chat:1", "chat_message", "conversation:1")
        await enqueue(db, school.id, users[0].id, "chat:1", "chat_message", "conversation:1")
        await db.commit()
        outbox = list((await db.scalars(select(PushOutbox))).all())
        assert len(outbox) == 1
        assert outbox[0].state == "suppressed"
        assert set(PushOutbox.__table__.columns.keys()) == {"id", "school_id", "installation_id", "user_id", "event_key", "category", "target", "state", "attempts", "created_at"}
        assert await revoke_session(db, users[0].id, sessions[0].session_token)
        await db.commit()
        assert await db.scalar(select(func.count(PushRegistration.id)).where(PushRegistration.state == "active")) == 0
        await register(db, users[0], sessions[0], second, _payload("another-provider-token"))
        await revoke_all(db, users[0].id)
        await db.commit()
        assert await db.scalar(select(func.count(PushRegistration.id)).where(PushRegistration.state == "active")) == 0
        await db.close()
        await engine.dispose()
    asyncio.run(scenario())
