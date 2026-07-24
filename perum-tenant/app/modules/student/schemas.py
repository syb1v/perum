from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class GradeSummarySubjectOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    subject_id: int
    subject_name: str
    average: float
    count: int
    points: int


class GradesSummaryOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    subjects: list[GradeSummarySubjectOut]
    total_points: int
    total_grades: int


class GradeAnalyticsPeriodOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    name: str
    start_date: datetime
    end_date: datetime


class GradeAnalyticsSubjectOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    subject_id: int
    subject_name: str
    periods: dict[str, float | None]
    year_average: float


class GradesAnalyticsOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    period_type: Literal["quarter", "half_year"]
    current_period: int | None
    periods: list[GradeAnalyticsPeriodOut]
    subjects: list[GradeAnalyticsSubjectOut]
