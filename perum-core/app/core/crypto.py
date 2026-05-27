"""Шифрование секретов at-rest (Фаза 10 hardening).

`EncryptedString` — SQLAlchemy TypeDecorator: прозрачно шифрует значение при записи
(Fernet) и расшифровывает при чтении. Весь код работает с открытым текстом —
меняется только хранение. Ключ — `SECRETS_ENCRYPTION_KEY` (urlsafe-base64, 32 байта;
`Fernet.generate_key()`).

Совместимость:
- Если ключ не задан (dev) — значения хранятся как есть (плейнтекст), с предупреждением.
- Зашифрованные значения помечаются префиксом `enc:`; при чтении значения без
  префикса (легаси/плейнтекст) возвращаются как есть → переход бесшовный.
"""

from __future__ import annotations

import logging

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import String, TypeDecorator

logger = logging.getLogger("perum.crypto")

_PREFIX = "enc:"
_fernet: Fernet | None = None
_warned = False


def _get_fernet() -> Fernet | None:
    global _fernet, _warned
    if _fernet is not None:
        return _fernet
    from app.core.config import get_settings

    key = (get_settings().SECRETS_ENCRYPTION_KEY or "").strip()
    if not key:
        if not _warned:
            logger.warning(
                "SECRETS_ENCRYPTION_KEY не задан — секреты хранятся в открытом виде. "
                "Для прода задайте ключ (Fernet.generate_key())."
            )
            _warned = True
        return None
    try:
        _fernet = Fernet(key.encode())
    except Exception as exc:  # noqa: BLE001
        logger.error("Некорректный SECRETS_ENCRYPTION_KEY (%s) — шифрование отключено", exc)
        return None
    return _fernet


def encrypt(value: str) -> str:
    f = _get_fernet()
    if f is None:
        return value
    return _PREFIX + f.encrypt(value.encode()).decode()


def decrypt(stored: str) -> str:
    if not stored or not stored.startswith(_PREFIX):
        return stored  # легаси-плейнтекст или пусто
    f = _get_fernet()
    if f is None:
        logger.error("Найдено зашифрованное значение, но ключ недоступен — вернул как есть")
        return stored
    try:
        return f.decrypt(stored[len(_PREFIX):].encode()).decode()
    except InvalidToken:
        logger.error("Не удалось расшифровать значение (неверный ключ?)")
        return stored


class EncryptedString(TypeDecorator):
    """String-колонка, прозрачно шифруемая at-rest."""

    impl = String
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return encrypt(str(value))

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return decrypt(value)
