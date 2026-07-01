"""Tenant auth — legacy-compatible contract consumed by the school frontend.

Mounted at /api:  POST /api/login · GET /api/user/me · POST /api/logout
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_user
from app.core.ratelimit import check_login_rate
from app.models import User
from app.modules.auth import service
from app.modules.auth.schemas import LoginRequest, LoginResponse, UserRead

router = APIRouter()


@router.post("/login", response_model=LoginResponse)
async def login(payload: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)) -> LoginResponse:
    check_login_rate(request, payload.login)
    token = await service.authenticate(db, payload.login, payload.password)
    return LoginResponse(token=token)


@router.get("/user/me", response_model=UserRead)
async def user_me(user: User = Depends(get_current_user)) -> dict:
    return service.user_public(user)


@router.post("/logout")
async def logout() -> dict:
    # Stateless JWT — the client discards the token; return ok for the frontend.
    return {"success": True}
