"""Pure tests for password hashing + JWT (no DB)."""

import jwt
import pytest

from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


def test_hash_is_not_plaintext_and_verifies():
    h = hash_password("s3cret-pw")
    assert h != "s3cret-pw"
    assert verify_password("s3cret-pw", h)
    assert not verify_password("wrong", h)


def test_verify_handles_garbage_hash():
    assert verify_password("x", "not-a-bcrypt-hash") is False


def test_jwt_roundtrip_carries_claims():
    token = create_access_token(subject="7", extra={"login": "admin", "role": "platform_admin"})
    payload = decode_access_token(token)
    assert payload["sub"] == "7"
    assert payload["login"] == "admin"
    assert payload["role"] == "platform_admin"
    assert "exp" in payload


def test_jwt_rejects_tampered_token():
    token = create_access_token(subject="1")
    with pytest.raises(jwt.PyJWTError):
        decode_access_token(token + "tamper")
