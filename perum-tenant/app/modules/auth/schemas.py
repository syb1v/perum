from pydantic import BaseModel


class LoginRequest(BaseModel):
    login: str
    password: str
    remember_me: bool = True


class LoginResponse(BaseModel):
    # Legacy frontend reads `data.token`.
    token: str


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
