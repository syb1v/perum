from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class UploadSessionCreate(BaseModel):
    client_upload_id: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9._:-]+$")
    purpose: str
    filename: str = Field(min_length=1, max_length=255)
    mime_type: str
    size: int = Field(gt=0)
    sha256: str = Field(pattern=r"^[0-9a-fA-F]{64}$")

    @field_validator("sha256")
    @classmethod
    def lower_checksum(cls, value: str) -> str:
        return value.lower()


class UploadSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    client_upload_id: str
    purpose: str
    filename: str
    declared_mime: str
    declared_size: int
    declared_sha256: str
    state: str
    object_id: str | None
    created_at: datetime
    expires_at: datetime


class MediaObjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    purpose: str
    filename: str
    mime_type: str
    size_bytes: int
    sha256: str
    state: str
    created_at: datetime
