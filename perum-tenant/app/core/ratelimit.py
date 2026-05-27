"""In-memory rate-limit логина (Фаза 10 hardening). Скользящее окно по ip+login.
Действует в пределах процесса школьного стека (для мульти-реплики — Redis)."""

from __future__ import annotations

import os
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

_LIMIT = int(os.environ.get("LOGIN_RATE_LIMIT", "10"))
_WINDOW = int(os.environ.get("LOGIN_RATE_WINDOW_S", "60"))
_hits: dict[str, deque[float]] = defaultdict(deque)


def check_login_rate(request: Request, login: str) -> None:
    if _LIMIT <= 0:
        return
    ip = (request.headers.get("x-forwarded-for", "").split(",")[0].strip()
          or (request.client.host if request.client else "unknown"))
    key = f"{ip}::{(login or '').lower()}"
    now = time.monotonic()
    dq = _hits[key]
    while dq and now - dq[0] > _WINDOW:
        dq.popleft()
    if len(dq) >= _LIMIT:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"слишком много попыток входа, повторите через {_WINDOW} с",
            headers={"Retry-After": str(_WINDOW)},
        )
    dq.append(now)
