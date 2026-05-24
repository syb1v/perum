"""Tenant auth endpoints: login / me / change-password / logout."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_user
from app.models import User
from app.modules.auth import service
from app.modules.auth.schemas import (
    ChangePasswordRequest,
    LoginRequest,
    TokenResponse,
    UserRead,
)

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    token = await service.authenticate(db, payload.login, payload.password)
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserRead)
async def me(user: User = Depends(get_current_user)) -> User:
    return user


@router.post("/change-password")
async def change_password(
    payload: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await service.change_password(db, user, payload.old_password, payload.new_password)
    return {"ok": True}


@router.post("/logout")
async def logout(user: User = Depends(get_current_user)) -> dict:
    # Stateless JWT: the client discards the token. Server-side session
    # revocation (a token version / denylist) is a later hardening item.
    return {"ok": True}
