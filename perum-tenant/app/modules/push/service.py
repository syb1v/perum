from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.time import utc_now
from app.models import PushEndpoint, PushInstallation, PushOutbox, PushRegistration, RefreshSession, User
from app.modules.push.crypto import PushCryptoUnavailable, encrypt_token, encryption_key, hash_token, key_id
from app.modules.push.schemas import RegistrationPut


def capability() -> dict:
    settings = get_settings()
    try:
        encryption_key(settings.PUSH_TOKEN_ENCRYPTION_KEY)
        hash_token("capability", settings.PUSH_TOKEN_HASH_KEY)
        available = True
    except PushCryptoUnavailable:
        available = False
    return {"registration_supported": True, "registration_available": available, "delivery_enabled": False, "configured_providers": []}


def _keys() -> tuple[bytes, str]:
    settings = get_settings()
    try:
        key = encryption_key(settings.PUSH_TOKEN_ENCRYPTION_KEY)
        hash_token("check", settings.PUSH_TOKEN_HASH_KEY)
        return key, settings.PUSH_TOKEN_HASH_KEY
    except PushCryptoUnavailable:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "push registration unavailable")


def _aad(provider: str, environment: str, app_id: str) -> bytes:
    return f"{provider}\0{environment}\0{app_id}".encode()


async def registration(db: AsyncSession, user: User, session: RefreshSession) -> dict:
    result = capability()
    row = await db.scalar(select(PushRegistration).where(PushRegistration.user_id == user.id, PushRegistration.refresh_session_id == session.id, PushRegistration.state == "active"))
    result["registration"] = None if row is None else {"installation_id": row.installation_id, "state": row.state}
    return result


async def register(db: AsyncSession, user: User, session: RefreshSession, installation_id: str, data: RegistrationPut) -> dict:
    if user.school_id is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "school membership required")
    key, hash_key = _keys()
    now = utc_now()
    installation = await db.get(PushInstallation, installation_id)
    if installation is not None and installation.school_id != user.school_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "installation not found")
    if installation is None:
        installation = PushInstallation(id=installation_id, school_id=user.school_id, platform=data.platform, device_name=data.device_name)
        db.add(installation)
        await db.flush()
    else:
        installation.platform = data.platform
        installation.device_name = data.device_name
        installation.state = "active"
        installation.updated_at = now
    digest = hash_token(data.token, hash_key)
    endpoint = await db.scalar(select(PushEndpoint).where(PushEndpoint.installation_id == installation_id, PushEndpoint.provider == data.provider, PushEndpoint.environment == data.environment, PushEndpoint.app_id == data.app_id))
    duplicate = await db.scalar(select(PushEndpoint).where(PushEndpoint.school_id == user.school_id, PushEndpoint.provider == data.provider, PushEndpoint.environment == data.environment, PushEndpoint.app_id == data.app_id, PushEndpoint.token_hash == digest, PushEndpoint.installation_id != installation_id, PushEndpoint.state == "active").with_for_update())
    if duplicate is not None:
        duplicate.state = "replaced"
        duplicate.updated_at = now
        await db.execute(update(PushRegistration).where(PushRegistration.endpoint_id == duplicate.id, PushRegistration.state == "active").values(state="revoked", revoked_at=now, updated_at=now))
    ciphertext = encrypt_token(data.token, key, _aad(data.provider, data.environment, data.app_id))
    if endpoint is None:
        endpoint = PushEndpoint(id=str(uuid4()), school_id=user.school_id, installation_id=installation_id, provider=data.provider, environment=data.environment, app_id=data.app_id, app_version=data.app_version, token_ciphertext=ciphertext, token_key_id=key_id(key), token_hash=digest)
        db.add(endpoint)
        await db.flush()
    else:
        endpoint.app_version = data.app_version
        endpoint.token_ciphertext = ciphertext
        endpoint.token_key_id = key_id(key)
        endpoint.token_hash = digest
        endpoint.state = "active"
        endpoint.updated_at = now
    row = await db.scalar(select(PushRegistration).where(PushRegistration.installation_id == installation_id, PushRegistration.user_id == user.id))
    if row is None:
        db.add(PushRegistration(id=str(uuid4()), school_id=user.school_id, installation_id=installation_id, endpoint_id=endpoint.id, user_id=user.id, refresh_session_id=session.id))
    else:
        row.endpoint_id = endpoint.id
        row.refresh_session_id = session.id
        row.state = "active"
        row.revoked_at = None
        row.updated_at = now
    session.device_id = installation_id
    session.device_name = data.device_name
    session.device_platform = data.platform
    session.app_version = data.app_version
    await db.commit()
    return {"installation_id": installation_id, "state": "active"}


async def revoke(db: AsyncSession, user: User, session: RefreshSession, installation_id: str) -> bool:
    row = await db.scalar(select(PushRegistration).where(PushRegistration.installation_id == installation_id, PushRegistration.user_id == user.id, PushRegistration.refresh_session_id == session.id, PushRegistration.state == "active"))
    if row is None:
        return False
    row.state = "revoked"
    row.revoked_at = utc_now()
    row.updated_at = row.revoked_at
    await db.commit()
    return True


async def revoke_for_session(db: AsyncSession, user_id: int, session_id: int) -> None:
    now = utc_now()
    await db.execute(update(PushRegistration).where(PushRegistration.user_id == user_id, PushRegistration.refresh_session_id == session_id, PushRegistration.state == "active").values(state="revoked", revoked_at=now, updated_at=now))


async def revoke_for_user(db: AsyncSession, user_id: int) -> None:
    now = utc_now()
    await db.execute(update(PushRegistration).where(PushRegistration.user_id == user_id, PushRegistration.state == "active").values(state="revoked", revoked_at=now, updated_at=now))


async def enqueue(db: AsyncSession, school_id: int, user_id: int, event_key: str, category: str, target: str) -> None:
    registrations = (await db.scalars(select(PushRegistration).where(PushRegistration.school_id == school_id, PushRegistration.user_id == user_id, PushRegistration.state == "active"))).all()
    for registration in registrations:
        exists = await db.scalar(select(PushOutbox.id).where(PushOutbox.installation_id == registration.installation_id, PushOutbox.user_id == user_id, PushOutbox.event_key == event_key))
        if exists is None:
            db.add(PushOutbox(id=str(uuid4()), school_id=school_id, installation_id=registration.installation_id, user_id=user_id, event_key=event_key, category=category, target=target, state="suppressed"))
