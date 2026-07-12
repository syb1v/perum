from datetime import datetime

from pydantic import BaseModel


class LoginRequest(BaseModel):
    login: str
    password: str
    remember_me: bool = True
    device_id: str | None = None
    device_name: str | None = None
    device_platform: str | None = None
    app_version: str | None = None


class LoginResponse(BaseModel):
    # Legacy frontend reads `data.token`.
    token: str
    access_token: str | None = None
    refresh_token: str | None = None
    token_type: str | None = None
    expires_in: int | None = None


class RefreshRequest(BaseModel):
    refresh_token: str


class SessionRead(BaseModel):
    session_token: str
    device_id: str | None
    device_name: str | None
    device_platform: str | None
    app_version: str | None
    created_at: datetime
    last_used_at: datetime
    current: bool = False


class UserRead(BaseModel):
    # Legacy-compatible user shape consumed by the school frontend.
    id: int
    login: str
    first_name: str | None
    last_name: str | None
    role: str
    balance: int
    avatar_url: str | None
    password_changed: bool
    school_id: int | None
    email: str | None
