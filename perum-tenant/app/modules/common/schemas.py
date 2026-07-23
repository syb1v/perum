from datetime import date

from pydantic import BaseModel, ConfigDict


class ActivePeriodOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    name: str
    period_type: str
    start_date: date
    end_date: date


class ActivePeriodsOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    current_period: ActivePeriodOut | None
    periods: list[ActivePeriodOut]
