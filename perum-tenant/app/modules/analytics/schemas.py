from pydantic import BaseModel, ConfigDict


class TeacherAnalyticsTopicOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    name: str
    avg: float
    bad_count: int
    total_count: int
    bad_ratio: str


class TeacherAnalyticsTopicsOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    class_avg: float
    topics: list[TeacherAnalyticsTopicOut]
