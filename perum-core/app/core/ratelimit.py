"""Простой in-memory rate-limit (Фаза 10 hardening).

Скользящее окно по ключу (ip+login) для защиты логина от перебора. In-memory ⇒
действует в пределах процесса (для одного инстанса ядра достаточно; для нескольких
реплик — выносить в Redis). Документированное ограничение.
"""

from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

from app.core.config import get_settings

_hits: dict[str, deque[float]] = defaultdict(deque)


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def check_login_rate(request: Request, login: str) -> None:
    """Поднимает 429, если превышен лимит попыток входа для ip+login."""
    s = get_settings()
    limit, window = s.LOGIN_RATE_LIMIT, s.LOGIN_RATE_WINDOW_S
    if limit <= 0:
        return
    key = f"{_client_ip(request)}::{(login or '').lower()}"
    now = time.monotonic()
    dq = _hits[key]
    while dq and now - dq[0] > window:
        dq.popleft()
    if len(dq) >= limit:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"слишком много попыток входа, повторите через {window} с",
            headers={"Retry-After": str(window)},
        )
    dq.append(now)
