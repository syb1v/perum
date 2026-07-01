"""Роутеры «хвостов» школы (Фаза 8): настройки/уведомления/обращения/поддержка.

- admin_router → /api/admin (require_admin)
- user_router  → /api/user (любой авторизованный — свои уведомления)
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_user, require_admin
from app.models import User
from app.modules.misc import service
from app.modules.school_admin.service import resolve_school_id

admin_router = APIRouter()
user_router = APIRouter()


async def _school(user: User, db: AsyncSession) -> int:
    return await resolve_school_id(user, db)


class NotifySend(BaseModel):
    message: str
    target: str = "all"
    role: str | None = None
    user_id: int | None = None


class ReplyEmail(BaseModel):
    to_email: str | None = None
    subject: str | None = None
    content: str | None = None
    in_reply_to: int | None = None


# ---- Настройки школы ----

@admin_router.get("/school-settings")
async def get_school_settings(user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    return await service.get_settings(db, await _school(user, db))


@admin_router.put("/school-settings")
async def put_school_settings(payload: dict, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    return await service.update_settings(db, await _school(user, db), payload)


# ---- Рассылка уведомлений ----

@admin_router.post("/notifications/send")
async def notifications_send(payload: NotifySend, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    return await service.send_notifications(
        db, await _school(user, db), payload.message, payload.target, payload.role, payload.user_id
    )


# ---- Обращения ----

@admin_router.get("/inquiries")
async def inquiries(is_read: int | None = None, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    flag = None if is_read is None else bool(is_read)
    return await service.list_inquiries(db, await _school(user, db), flag)


@admin_router.put("/inquiries/{inquiry_id}/read")
async def inquiry_read(inquiry_id: int, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    return await service.mark_inquiry_read(db, await _school(user, db), inquiry_id)


@admin_router.delete("/inquiries/{inquiry_id}")
async def inquiry_delete(inquiry_id: int, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    return await service.delete_inquiry(db, await _school(user, db), inquiry_id)


# ---- Поддержка-почта (внешний ящик в школьном стеке не настроен — честная заглушка) ----

@admin_router.get("/support/emails")
async def support_emails(limit: int = 100, user: User = Depends(require_admin)) -> dict:
    return {"success": True, "emails": []}


@admin_router.post("/support/emails/reply")
async def support_reply(payload: ReplyEmail, user: User = Depends(require_admin)) -> dict:
    return {"success": False, "message": "Почтовый ящик школы не настроен (SMTP не подключён)"}


@admin_router.get("/online-users")
async def online_users(user: User = Depends(require_admin)) -> dict:
    # Presence по WebSocket в v2 не ведётся; возвращаем пустой список.
    return {"online_users": []}


# ---- Пользовательские уведомления ----

@user_router.get("/notifications")
async def my_notifications(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict:
    return await service.list_user_notifications(db, user)


@user_router.post("/notifications/{notification_id}/read")
async def my_notification_read(notification_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict:
    return await service.mark_notification_read(db, user, notification_id)


@user_router.delete("/notifications/{notification_id}")
async def my_notification_delete(notification_id: int, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict:
    return await service.delete_notification(db, user, notification_id)


@user_router.delete("/notifications")
async def my_notifications_clear(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> dict:
    return await service.clear_notifications(db, user)
