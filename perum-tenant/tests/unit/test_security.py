"""Pure tests for tenant password hashing + JWT (no DB)."""

import jwt
import pytest

from app.core.config import get_settings
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


def test_hash_and_verify():
    h = hash_password("pw-123456")
    assert h != "pw-123456"
    assert verify_password("pw-123456", h)
    assert not verify_password("nope", h)


def test_token_carries_org_slug_and_claims():
    settings = get_settings()
    token = create_access_token(subject="1", extra={"role": "org_admin", "school_id": None})
    payload = decode_access_token(token)
    assert payload["org_slug"] == settings.ORG_SLUG
    assert payload["sub"] == "1"
    assert payload["role"] == "org_admin"


def test_tampered_token_rejected():
    with pytest.raises(jwt.PyJWTError):
        decode_access_token(create_access_token(subject="1") + "x")
