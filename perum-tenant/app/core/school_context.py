"""Per-request «selected school» for org-level admins (Phase 5 — multi-school).

`org_admin` имеет `school_id = NULL` и охватывает все школы орг. Чтобы он мог
управлять конкретной школой, фронт шлёт заголовок `X-School-Id`. Его значение
кладётся в ContextVar на время запроса (чистый ASGI-middleware — без проблем
с распространением контекста, в отличие от BaseHTTPMiddleware) и читается в
`resolve_school_id`. Роли с фиксированной `school_id` (завуч/учитель/…) заголовок
игнорируют — они привязаны к своей школе.
"""

from __future__ import annotations

from contextvars import ContextVar

_current_school_id: ContextVar[int | None] = ContextVar("current_school_id", default=None)


def get_requested_school_id() -> int | None:
    return _current_school_id.get()


class SchoolContextMiddleware:
    """Reads X-School-Id into a ContextVar for the duration of the request."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        value: int | None = None
        for key, val in scope.get("headers", []):
            if key == b"x-school-id":
                try:
                    value = int(val.decode())
                except (ValueError, UnicodeDecodeError):
                    value = None
                break
        token = _current_school_id.set(value)
        try:
            await self.app(scope, receive, send)
        finally:
            _current_school_id.reset(token)
