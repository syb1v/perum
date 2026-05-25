"""Schools CRUD for org_admin (Phase 5 — multi-school).

org_admin создаёт/переименовывает/деактивирует школы своей организации и видит
по каждой сводные метрики. Удаление запрещено, если в школе есть пользователи или
классы (чтобы не снести данные случайно) — сначала деактивация/перенос.
"""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models import Organization, School, User
from app.models.academic import Class

SCHOOL_ADMIN_ROLES = ("school_admin", "director")


async def _org_id(db: AsyncSession) -> int:
    oid = await db.scalar(select(Organization.id).order_by(Organization.id).limit(1))
    if oid is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Организация не инициализирована")
    return int(oid)


async def _school_metrics(db: AsyncSession, s: School) -> dict:
    students = await db.scalar(
        select(func.count(User.id)).where(User.school_id == s.id, User.role == "student")
    ) or 0
    teachers = await db.scalar(
        select(func.count(User.id)).where(User.school_id == s.id, User.role == "teacher")
    ) or 0
    classes = await db.scalar(select(func.count(Class.id)).where(Class.school_id == s.id)) or 0
    return {
        "id": s.id,
        "name": s.name,
        "is_active": s.is_active,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "students_count": int(students),
        "teachers_count": int(teachers),
        "classes_count": int(classes),
    }


async def list_schools(db: AsyncSession) -> dict:
    rows = (await db.execute(select(School).order_by(School.id))).scalars().all()
    return {"schools": [await _school_metrics(db, s) for s in rows]}


async def create_school(db: AsyncSession, name: str) -> dict:
    name = (name or "").strip()
    if not name:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Укажите название школы")
    school = School(org_id=await _org_id(db), name=name, is_active=True)
    db.add(school)
    await db.commit()
    await db.refresh(school)
    return {"success": True, "message": "Школа создана", "school": await _school_metrics(db, school)}


async def update_school(db: AsyncSession, school_id: int, name: str | None, is_active: bool | None) -> dict:
    school = await db.get(School, school_id)
    if not school:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Школа не найдена")
    if name is not None:
        n = name.strip()
        if not n:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Название не может быть пустым")
        school.name = n
    if is_active is not None:
        school.is_active = is_active
    await db.commit()
    await db.refresh(school)
    return {"success": True, "message": "Школа обновлена", "school": await _school_metrics(db, school)}


async def delete_school(db: AsyncSession, school_id: int) -> dict:
    school = await db.get(School, school_id)
    if not school:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Школа не найдена")
    total = await db.scalar(select(func.count(School.id)))
    if total and total <= 1:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Нельзя удалить единственную школу")
    users = await db.scalar(select(func.count(User.id)).where(User.school_id == school_id)) or 0
    classes = await db.scalar(select(func.count(Class.id)).where(Class.school_id == school_id)) or 0
    if users or classes:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Школа не пуста (есть пользователи или классы) — сначала перенесите/удалите их или деактивируйте школу",
        )
    await db.delete(school)
    await db.commit()
    return {"success": True, "message": "Школа удалена"}


# ---- Администраторы школ (org_admin заводит/снимает админа каждой школы) ----

async def _require_school(db: AsyncSession, school_id: int) -> School:
    school = await db.get(School, school_id)
    if not school:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Школа не найдена")
    return school


def _admin_dict(u: User) -> dict:
    return {
        "id": u.id,
        "login": u.login,
        "first_name": u.first_name,
        "last_name": u.last_name,
        "role": u.role,
        "is_active": u.is_active,
        "email": u.email,
    }


async def list_school_admins(db: AsyncSession, school_id: int) -> dict:
    await _require_school(db, school_id)
    rows = (
        await db.execute(
            select(User).where(User.school_id == school_id, User.role.in_(SCHOOL_ADMIN_ROLES))
            .order_by(User.last_name, User.first_name)
        )
    ).scalars().all()
    return {"admins": [_admin_dict(u) for u in rows]}


async def create_school_admin(
    db: AsyncSession, school_id: int, login: str, password: str,
    first_name: str | None, last_name: str | None, role: str,
) -> dict:
    await _require_school(db, school_id)
    role = role if role in SCHOOL_ADMIN_ROLES else "school_admin"
    login = (login or "").strip()
    if not login:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Укажите логин")
    if not password:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Укажите пароль")
    if await db.scalar(select(User.id).where(User.login == login)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Пользователь с таким логином уже существует")
    user = User(
        school_id=school_id, role=role, login=login, password_hash=hash_password(password),
        first_name=(first_name or "").strip() or None, last_name=(last_name or "").strip() or None,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return {"success": True, "message": "Администратор школы создан", "admin": _admin_dict(user)}


async def delete_school_admin(db: AsyncSession, school_id: int, user_id: int) -> dict:
    user = await db.get(User, user_id)
    if not user or user.school_id != school_id or user.role not in SCHOOL_ADMIN_ROLES:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Администратор школы не найден")
    await db.delete(user)
    await db.commit()
    return {"success": True, "message": "Администратор школы снят"}
