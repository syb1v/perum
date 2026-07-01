"""Логика «хвостов» школы: настройки, уведомления, обращения, поддержка.

Всё school-scoped. Уведомления рассылаются администрацией (all/role/user) и
читаются пользователем. Поддержка-почта — честная заглушка (внешний почтовый ящик
в школьном стеке не настроен).
"""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.models.misc import ContactInquiry, Notification, SchoolSetting

# Ключи настроек школы (контракт фронта SystemSettings).
SETTING_KEYS = [
    "dot_to_two_days", "min_grade_weight", "max_grade_weight",
    "min_grades_for_attestation", "grade_5_min", "grade_4_min",
    "grade_3_min", "binary_pass_min",
]


# ---- Настройки школы ----

async def get_settings(db: AsyncSession, school_id: int) -> dict:
    rows = (
        await db.execute(select(SchoolSetting).where(SchoolSetting.school_id == school_id))
    ).scalars().all()
    stored = {r.key: r.value for r in rows}
    data: dict = {}
    for k in SETTING_KEYS:
        v = stored.get(k)
        if v is None or v == "":
            data[k] = None
        else:
            try:
                data[k] = float(v) if "." in v else int(v)
            except ValueError:
                data[k] = v
    return {"success": True, "data": data}


async def update_settings(db: AsyncSession, school_id: int, payload: dict) -> dict:
    existing = {
        r.key: r for r in (
            await db.execute(select(SchoolSetting).where(SchoolSetting.school_id == school_id))
        ).scalars().all()
    }
    for k in SETTING_KEYS:
        if k not in payload:
            continue
        v = payload[k]
        sval = "" if v is None else str(v)
        if k in existing:
            existing[k].value = sval
        else:
            db.add(SchoolSetting(school_id=school_id, key=k, value=sval))
    await db.commit()
    return {"success": True, "message": "Настройки сохранены"}


# ---- Уведомления (рассылка администрацией) ----

async def send_notifications(db: AsyncSession, school_id: int, message: str, target: str, role: str | None, user_id: int | None) -> dict:
    message = (message or "").strip()
    if not message:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Введите текст уведомления")

    if target == "all":
        rows = (await db.execute(select(User.id).where(User.school_id == school_id))).all()
        ids = [r[0] for r in rows]
    elif target == "role":
        if not role:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Укажите роль")
        rows = (await db.execute(select(User.id).where(User.school_id == school_id, User.role == role))).all()
        ids = [r[0] for r in rows]
    elif target == "user":
        if not user_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Укажите пользователя")
        ids = [user_id]
    else:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Неизвестная цель рассылки")

    for uid in ids:
        db.add(Notification(school_id=school_id, user_id=uid, title="Уведомление", text=message, type="info"))
    await db.commit()
    return {"success": True, "message": f"Отправлено {len(ids)} уведомлений", "count": len(ids)}


async def list_user_notifications(db: AsyncSession, user: User) -> dict:
    rows = (
        await db.execute(
            select(Notification).where(Notification.user_id == user.id)
            .order_by(Notification.created_at.desc()).limit(100)
        )
    ).scalars().all()
    return {
        "success": True,
        "notifications": [
            {"id": n.id, "title": n.title, "text": n.text, "type": n.type,
             "is_read": n.is_read, "created_at": n.created_at.isoformat() if n.created_at else None}
            for n in rows
        ],
        "unread_count": sum(1 for n in rows if not n.is_read),
    }


async def mark_notification_read(db: AsyncSession, user: User, nid: int) -> dict:
    n = await db.get(Notification, nid)
    if n is None or n.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Уведомление не найдено")
    n.is_read = True
    await db.commit()
    return {"success": True}


async def delete_notification(db: AsyncSession, user: User, nid: int) -> dict:
    n = await db.get(Notification, nid)
    if n is None or n.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Уведомление не найдено")
    await db.delete(n)
    await db.commit()
    return {"success": True}


async def clear_notifications(db: AsyncSession, user: User) -> dict:
    await db.execute(delete(Notification).where(Notification.user_id == user.id))
    await db.commit()
    return {"success": True}


# ---- Обращения ----

async def list_inquiries(db: AsyncSession, school_id: int, is_read: bool | None) -> dict:
    stmt = select(ContactInquiry).where(ContactInquiry.school_id == school_id)
    if is_read is not None:
        stmt = stmt.where(ContactInquiry.is_read == is_read)
    rows = (await db.execute(stmt.order_by(ContactInquiry.created_at.desc()))).scalars().all()
    return {
        "success": True,
        "inquiries": [
            {"id": i.id, "name": i.name, "email": i.email, "message": i.message,
             "is_read": i.is_read, "created_at": i.created_at.isoformat() if i.created_at else None}
            for i in rows
        ],
    }


async def mark_inquiry_read(db: AsyncSession, school_id: int, iid: int) -> dict:
    i = await db.get(ContactInquiry, iid)
    if i is None or i.school_id != school_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Обращение не найдено")
    i.is_read = True
    await db.commit()
    return {"success": True}


async def delete_inquiry(db: AsyncSession, school_id: int, iid: int) -> dict:
    i = await db.get(ContactInquiry, iid)
    if i is None or i.school_id != school_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Обращение не найдено")
    await db.delete(i)
    await db.commit()
    return {"success": True}
