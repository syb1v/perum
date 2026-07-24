from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class ParentChildOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    first_name: str | None
    last_name: str | None
    patronymic: str | None
    balance: int
    class_name: str | None
    class_id: int | None
    average: float
    total_grades: int
    enrollment_status: Literal["active"]


class ParentChildrenOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    children: list[ParentChildOut]


class ParentTransactionOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    amount: int
    balance_after: int
    type: str
    reason: str | None
    created_at: datetime | None


class ParentTransactionsOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    transactions: list[ParentTransactionOut]
