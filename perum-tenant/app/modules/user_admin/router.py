"""Admin user-management router, mounted at /api/admin (legacy contract)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import require_admin
from app.models import User
from app.modules.school_admin.service import resolve_school_id
from app.modules.user_admin import service

router = APIRouter()


class UpdateUserRequest(BaseModel):
    login: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    patronymic: str | None = None
    email: str | None = None
    phone: str | None = None
    extra_data: str | None = None
    password: str | None = None


class UpdateBalanceRequest(BaseModel):
    amount: int
    comment: str | None = None


class RegisterUserItem(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    patronymic: str | None = None
    email: str | None = None
    phone: str | None = None
    role: str | None = "student"
    login: str | None = None
    password: str | None = None
    class_id: int | None = None


class RegisterUsersRequest(BaseModel):
    users: list[RegisterUserItem]


@router.get("/users")
async def get_users(
    role: str | None = None,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await service.list_users(db, admin, await resolve_school_id(admin, db), role)


@router.get("/users/search")
async def search_users(
    query: str = "",
    role: str = "all",
    skip: int = 0,
    limit: int = Query(50, ge=1, le=100),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await service.search_users(db, admin, await resolve_school_id(admin, db), query, role, skip, limit)


@router.get("/students/no-class")
async def students_no_class(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await service.students_no_class(db, await resolve_school_id(admin, db))


@router.put("/users/{user_id}")
async def update_user(
    user_id: int,
    payload: UpdateUserRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await service.update_user(db, admin, await resolve_school_id(admin, db), user_id, payload.model_dump())


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await service.delete_user(db, admin, await resolve_school_id(admin, db), user_id)


@router.post("/users/{user_id}/balance")
async def adjust_balance(
    user_id: int,
    payload: UpdateBalanceRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await service.adjust_balance(db, admin, await resolve_school_id(admin, db), user_id, payload.amount, payload.comment)


@router.get("/users/{user_id}/transactions")
async def user_transactions(
    user_id: int,
    limit: int = 100,
    offset: int = 0,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await service.user_transactions(db, await resolve_school_id(admin, db), user_id, limit, offset)


@router.post("/register-users")
async def register_users(
    payload: RegisterUsersRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    school_id = await resolve_school_id(admin, db)
    return await service.register_users(db, admin, school_id, [u.model_dump() for u in payload.users])
