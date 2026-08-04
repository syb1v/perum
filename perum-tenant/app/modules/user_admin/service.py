"""User management for admins (Phase 5 tail) — порт легаси admin_users.py.

Список/поиск/правка/удаление/баланс/транзакции пользователей, ученики без
класса и массовая регистрация. Всё school-scoped по `school_id` (org_admin
резолвится в школу). Уведомления/websocket из легаси опущены — вместо них
начисление баланса пишет Transaction.
"""

from __future__ import annotations

import random
import string

from fastapi import HTTPException, status
from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.roles import PARENT, STUDENT
from app.core.security import hash_password
from app.models import User
from app.models.academic import Class, ClassStudent
from app.models.journal import Transaction
from app.models.parent import ParentStudent


def _gen_login() -> str:
    return "user_" + "".join(random.choices(string.ascii_lowercase + string.digits, k=8))


def _gen_password() -> str:
    return "".join(random.choices(string.ascii_letters + string.digits, k=10))


def _user_dict(u: User, admin_id: int | None = None) -> dict:
    return {
        "id": u.id,
        "login": u.login,
        "first_name": u.first_name,
        "last_name": u.last_name,
        "patronymic": u.patronymic,
        "email": u.email,
        "phone": u.phone,
        "balance": u.balance,
        "role": u.role,
        "password_changed": not u.must_change_password,
        "created_at": u.created_at.isoformat() if u.created_at else None,
        "last_login": u.last_login_at.isoformat() if u.last_login_at else None,
        "is_self": (u.id == admin_id) if admin_id is not None else False,
    }


async def _get_scoped(db: AsyncSession, school_id: int, user_id: int) -> User:
    u = await db.get(User, user_id)
    # Строго: пользователь должен принадлежать ИМЕННО этой школе. Прежнее условие
    # пропускало записи с school_id IS NULL (org-level) — школьный админ мог бы
    # править/удалять/начислять баланс таким записям «вслепую» по ID. В v2-стеке
    # таких записей нет, но проверку держим жёсткой (страховка от регресса/легаси).
    if not u or u.school_id != school_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Пользователь не найден")
    return u


async def _get_scoped_parent(db: AsyncSession, school_id: int, parent_id: int, *, for_update: bool = False) -> User:
    stmt = select(User).where(
        User.id == parent_id,
        User.school_id == school_id,
        User.role == PARENT,
        User.is_active.is_(True),
    )
    if for_update and db.bind is not None and db.bind.dialect.name == "postgresql":
        stmt = stmt.with_for_update()
    parent = (await db.execute(stmt)).scalar_one_or_none()
    if parent is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Родитель не найден")
    return parent


async def _valid_student_ids(db: AsyncSession, school_id: int, parent_id: int) -> list[int]:
    rows = (
        await db.execute(
            select(ParentStudent.student_id)
            .join(User, User.id == ParentStudent.student_id)
            .where(
                ParentStudent.parent_id == parent_id,
                User.school_id == school_id,
                User.role == STUDENT,
                User.is_active.is_(True),
            )
            .order_by(ParentStudent.student_id)
        )
    ).scalars().all()
    return list(rows)


async def get_parent_students(db: AsyncSession, school_id: int, parent_id: int) -> dict:
    parent = await _get_scoped_parent(db, school_id, parent_id)
    return {"parent_id": parent.id, "student_ids": await _valid_student_ids(db, school_id, parent.id)}


async def replace_parent_students(db: AsyncSession, school_id: int, parent_id: int, student_ids: list[int]) -> dict:
    parent = await _get_scoped_parent(db, school_id, parent_id, for_update=True)
    requested = set(student_ids)
    if requested:
        valid_rows = (
            await db.execute(
                select(User.id).where(
                    User.id.in_(requested),
                    User.school_id == school_id,
                    User.role == STUDENT,
                    User.is_active.is_(True),
                )
            )
        ).scalars().all()
        if set(valid_rows) != requested:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Один или несколько учеников не найдены")
    existing_ids = {
        row.student_id
        for row in (
            await db.execute(select(ParentStudent).where(ParentStudent.parent_id == parent.id))
        ).scalars().all()
    }
    to_insert = requested - existing_ids
    to_delete = existing_ids - requested
    if to_delete:
        await db.execute(delete(ParentStudent).where(ParentStudent.parent_id == parent.id, ParentStudent.student_id.in_(to_delete)))
    for student_id in sorted(to_insert):
        db.add(ParentStudent(parent_id=parent.id, student_id=student_id))
    await db.commit()
    return {"parent_id": parent.id, "student_ids": sorted(requested)}


async def list_users(db: AsyncSession, admin: User, school_id: int, role: str | None) -> dict:
    stmt = select(User).where(User.school_id == school_id)
    if role and role != "all":
        stmt = stmt.where(User.role == role)
    stmt = stmt.order_by(User.last_name, User.first_name)
    rows = (await db.execute(stmt)).scalars().all()
    return {"users": [_user_dict(u, admin.id) for u in rows]}


async def search_users(db: AsyncSession, admin: User, school_id: int, query: str, role: str, skip: int, limit: int) -> dict:
    stmt = select(User).where(User.school_id == school_id)
    if role and role != "all":
        stmt = stmt.where(User.role == role)
    q = (query or "").strip()
    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            or_(
                User.login.ilike(like),
                User.first_name.ilike(like),
                User.last_name.ilike(like),
                User.patronymic.ilike(like),
                User.email.ilike(like),
            )
        )
    stmt = stmt.order_by(User.last_name, User.first_name).offset(skip).limit(limit + 1)
    rows = (await db.execute(stmt)).scalars().all()
    has_more = len(rows) > limit
    return {"has_more": has_more, "users": [_user_dict(u, admin.id) for u in rows[:limit]]}


async def update_user(db: AsyncSession, admin: User, school_id: int, user_id: int, payload: dict) -> dict:
    user = await _get_scoped(db, school_id, user_id)

    new_login = payload.get("login")
    if new_login is not None and new_login != user.login:
        clash = await db.scalar(select(User.id).where(User.login == new_login, User.id != user.id))
        if clash:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Пользователь с таким логином уже существует")
        user.login = new_login

    for field in ("first_name", "last_name", "patronymic", "email", "phone"):
        if payload.get(field) is not None:
            setattr(user, field, payload[field])
    if payload.get("password"):
        user.password_hash = hash_password(payload["password"])
        from app.modules.auth.service import revoke_all
        await revoke_all(db, user.id)

    await db.commit()
    return {"success": True, "message": "Данные пользователя обновлены"}


async def delete_user(db: AsyncSession, admin: User, school_id: int, user_id: int) -> dict:
    if user_id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Нельзя удалить самого себя")
    user = await _get_scoped(db, school_id, user_id)
    await db.delete(user)  # FK ondelete=CASCADE убирает связанные записи
    await db.commit()
    return {"success": True, "message": "Пользователь удалён"}


async def adjust_balance(db: AsyncSession, admin: User, school_id: int, user_id: int, amount: int, comment: str | None) -> dict:
    if amount == 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Укажите сумму")
    user = await _get_scoped(db, school_id, user_id)
    user.balance = max((user.balance or 0) + amount, 0)
    db.add(Transaction(
        school_id=school_id, user_id=user.id, amount=amount, balance_after=user.balance,
        type="admin_adjust", reason=comment or ("Начисление администратором" if amount > 0 else "Списание администратором"),
        created_by=admin.id,
    ))
    await db.commit()
    verb = "Начислено" if amount > 0 else "Списано"
    return {"success": True, "message": f"{verb} {abs(amount)} ливок", "new_balance": user.balance}


async def user_transactions(db: AsyncSession, school_id: int, user_id: int, limit: int, offset: int) -> dict:
    user = await _get_scoped(db, school_id, user_id)
    rows = (
        await db.execute(
            select(Transaction).where(Transaction.user_id == user_id)
            .order_by(Transaction.created_at.desc()).offset(offset).limit(limit)
        )
    ).scalars().all()
    income = await db.scalar(select(func.coalesce(func.sum(Transaction.amount), 0)).where(Transaction.user_id == user_id, Transaction.amount > 0)) or 0
    expense = await db.scalar(select(func.coalesce(func.sum(Transaction.amount), 0)).where(Transaction.user_id == user_id, Transaction.amount < 0)) or 0
    total = await db.scalar(select(func.count(Transaction.id)).where(Transaction.user_id == user_id)) or 0
    return {
        "user": {
            "id": user.id, "login": user.login, "first_name": user.first_name,
            "last_name": user.last_name, "balance": user.balance,
        },
        "transactions": [
            {
                "id": t.id, "amount": t.amount, "type": t.type, "reason": t.reason,
                "balance_after": t.balance_after,
                "created_at": t.created_at.isoformat() if t.created_at else None,
            }
            for t in rows
        ],
        "stats": {"total_income": int(income), "total_expense": int(abs(expense)), "total_count": int(total)},
        "total": int(total),
    }


async def students_no_class(db: AsyncSession, school_id: int) -> dict:
    assigned = select(ClassStudent.student_id)
    rows = (
        await db.execute(
            select(User).where(User.school_id == school_id, User.role == "student", User.id.notin_(assigned))
            .order_by(User.last_name, User.first_name)
        )
    ).scalars().all()
    return {"students": [_user_dict(u) for u in rows]}


async def register_users(db: AsyncSession, admin: User, school_id: int, users: list[dict]) -> dict:
    if not users:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Список пользователей пуст")
    if len(users) > 100:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Максимум 100 пользователей за раз")

    existing_logins = set((await db.execute(select(User.login))).scalars().all())
    results: list[dict] = []

    for ud in users:
        role = ud.get("role") or "student"
        first = (ud.get("first_name") or "").strip()
        last = (ud.get("last_name") or "").strip()
        patr = (ud.get("patronymic") or "").strip() or None
        class_id = ud.get("class_id")

        # Дедуп учеников по ФИО — обновляем класс, не плодя записи.
        if role == "student" and (first or last):
            existing = await db.scalar(
                select(User).where(
                    and_(
                        func.lower(func.trim(func.coalesce(User.first_name, ""))) == first.lower(),
                        func.lower(func.trim(func.coalesce(User.last_name, ""))) == last.lower(),
                        func.lower(func.trim(func.coalesce(User.patronymic, ""))) == (patr or "").lower(),
                        User.role == "student",
                        User.school_id == school_id,
                    )
                )
            )
            if existing:
                if class_id:
                    await db.execute(delete(ClassStudent).where(ClassStudent.student_id == existing.id))
                    db.add(ClassStudent(class_id=class_id, student_id=existing.id))
                results.append({
                    "login": existing.login, "first_name": first, "last_name": last, "patronymic": patr,
                    "created": False, "updated": True, "message": "Класс обновлён (ученик уже существует)",
                })
                continue

        login = ud.get("login") or _gen_login()
        if login in existing_logins:
            base, n = login, 1
            while login in existing_logins and n < 100:
                login, n = f"{base}_{n}", n + 1
        password = ud.get("password") or _gen_password()

        new_user = User(
            login=login, password_hash=hash_password(password),
            first_name=first or None, last_name=last or None, patronymic=patr,
            email=ud.get("email"), phone=ud.get("phone"), role=role, school_id=school_id,
        )
        db.add(new_user)
        await db.flush()
        if role == "student" and class_id:
            db.add(ClassStudent(class_id=class_id, student_id=new_user.id))
        existing_logins.add(login)
        results.append({
            "login": login, "password": password, "first_name": first,
            "last_name": last, "patronymic": patr, "created": True,
        })

    await db.commit()
    success = sum(1 for r in results if r.get("created") or r.get("updated"))
    return {"success": True, "message": f"Обработано {success} из {len(users)} пользователей", "users": results}
