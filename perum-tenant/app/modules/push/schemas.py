from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, StrictBool, model_validator


class RegistrationPut(BaseModel):
    installation_secret: str = Field(min_length=43, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")
    provider: Literal["expo", "fcm", "apns", "rustore", "huawei"]
    platform: Literal["ios", "android"]
    environment: Literal["development", "production"]
    token: str = Field(min_length=16, max_length=4096)
    app_id: str = Field(min_length=1, max_length=200, pattern=r"^[A-Za-z0-9._-]+$")
    app_version: str | None = Field(default=None, min_length=1, max_length=50)
    device_name: str | None = Field(default=None, min_length=1, max_length=255)

    @model_validator(mode="after")
    def valid_registration(self):
        if self.token != self.token.strip() or any(character.isspace() for character in self.token):
            raise ValueError("invalid push token")
        if self.provider == "apns" and self.platform != "ios" or self.provider in {"fcm", "rustore", "huawei"} and self.platform != "android":
            raise ValueError("provider is unavailable for platform")
        return self


class PushRegistrationOut(BaseModel):
    installation_id: UUID
    state: Literal["active"]


class PushRegistrationStatusOut(BaseModel):
    registration_supported: StrictBool
    registration_available: StrictBool
    delivery_enabled: StrictBool
    configured_providers: list[Literal["expo", "fcm", "apns", "rustore", "huawei"]]
    registration: PushRegistrationOut | None


class PushRegistrationRevokeOut(BaseModel):
    success: Literal[True]
