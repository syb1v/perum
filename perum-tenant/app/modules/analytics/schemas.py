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


class TeacherAnalyticsPeriodOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    start: str
    end: str


class TeacherAnalyticsKpiOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    avg_grade: float
    total_grades: int
    bad_grades: int
    bad_ratio: str
    problem_topics_count: int


class TeacherAnalyticsDynamicsOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    date: str
    avg: float


class TeacherAnalyticsAttentionStudentOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    name: str
    avg: float
    twos: int


class TeacherAnalyticsDashboardOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    class_id: int
    class_name: str
    period: TeacherAnalyticsPeriodOut
    kpi: TeacherAnalyticsKpiOut
    dynamics: list[TeacherAnalyticsDynamicsOut]
    problem_topics: list[TeacherAnalyticsTopicOut]
    attention_students: list[TeacherAnalyticsAttentionStudentOut]
