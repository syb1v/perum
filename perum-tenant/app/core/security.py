"""Password hashing (bcrypt) + JWT for the tenant app.

JWT carries `org_slug` so a token minted for one organization is rejected by any
other org's stack (validated in app.core.deps.get_current_user). This is the
process-level analogue of the old row-level `school_id` checks.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.core.config import get_settings

settings = get_settings()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def create_access_token(*, subject: str, extra: dict | None = None, session_backed: bool = False) -> str:
    now = datetime.now(timezone.utc)
    payload: dict = {
        "sub": subject,
        "iat": now,
        "exp": now + timedelta(minutes=settings.ACCESS_TOKEN_TTL_MINUTES),
        "org_slug": settings.ORG_SLUG,
    }
    if extra:
        payload.update(extra)
    if session_backed:
        payload.update({"iss": settings.JWT_ISSUER, "aud": settings.JWT_AUDIENCE, "typ": "access"})
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    """Decode + verify a token. Raises jwt.PyJWTError on invalid/expired."""
    payload = jwt.decode(
        token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM],
        options={"verify_aud": False, "verify_iss": False},
    )
    if payload.get("typ") == "access":
        if payload.get("iss") != settings.JWT_ISSUER or payload.get("aud") != settings.JWT_AUDIENCE:
            raise jwt.InvalidTokenError("invalid issuer or audience")
    return payload
