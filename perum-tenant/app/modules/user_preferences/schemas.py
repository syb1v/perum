from datetime import datetime

from pydantic import BaseModel, ConfigDict


class PreferencesPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    push_preview_enabled: bool


class PreferencesResponse(BaseModel):
    push_preview_enabled: bool
    version: int
    created_at: datetime
    updated_at: datetime
