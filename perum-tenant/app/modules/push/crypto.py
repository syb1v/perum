import base64
import hashlib
import hmac
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


class PushCryptoUnavailable(ValueError):
    pass


def encryption_key(value: str) -> bytes:
    try:
        key = base64.b64decode(value, validate=True)
    except Exception as exc:
        raise PushCryptoUnavailable("push token encryption is unavailable") from exc
    if len(key) != 32:
        raise PushCryptoUnavailable("push token encryption is unavailable")
    return key


def key_id(key: bytes) -> str:
    return hashlib.sha256(key).hexdigest()[:16]


def encrypt_token(token: str, key: bytes, aad: bytes) -> bytes:
    nonce = os.urandom(12)
    return nonce + AESGCM(key).encrypt(nonce, token.encode(), aad)


def decrypt_token(ciphertext: bytes, key: bytes, aad: bytes) -> str:
    return AESGCM(key).decrypt(ciphertext[:12], ciphertext[12:], aad).decode()


def hash_token(token: str, hash_key: str) -> str:
    if not hash_key:
        raise PushCryptoUnavailable("push token hashing is unavailable")
    return hmac.new(hash_key.encode(), token.encode(), hashlib.sha256).hexdigest()
