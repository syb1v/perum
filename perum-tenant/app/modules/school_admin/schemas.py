from pydantic import BaseModel


class SubjectCreate(BaseModel):
    name: str
    short_name: str | None = None
    category: str = "normal"  # profile | normal | minor
    in_exchange: bool = False
    exchange_coefficient: float = 1.0
    profile_weight: float = 1.0
    is_profile_track: bool = False


class SubjectUpdate(SubjectCreate):
    pass


class WorkTypeCreate(BaseModel):
    name: str
    weight: float = 1.0
    is_active: bool = True


class WorkTypeUpdate(WorkTypeCreate):
    pass
