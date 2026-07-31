from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, RootModel, field_validator


class AdminDashboardKpiOut(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    average_grade: float
    total_grades: int
    total_students: int
    failing_count: int
    absences: int
    homework_count: int
    control_work_count: int


class AdminDashboardClassPerformanceOut(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    class_id: int
    class_name: str
    grade_level: int | None
    avg_grade: float
    grades_count: int


class AdminDashboardGradeDistributionOut(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    grade_value: int
    count: int


class AdminDashboardAttendanceOut(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    mark: str
    count: int


class AdminDashboardFailingStudentOut(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    id: int
    name: str
    avg: float
    grades_count: int
    class_name: str | None


class AdminDashboardTeacherActivityOut(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    id: int
    name: str
    grades_given: int


class AdminDashboardDailyAverageOut(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    date: str
    avg_grade: float


class AdminDashboardOverviewOut(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    success: bool
    kpi: AdminDashboardKpiOut
    class_performance: list[AdminDashboardClassPerformanceOut]
    grade_distribution: list[AdminDashboardGradeDistributionOut]
    attendance: list[AdminDashboardAttendanceOut]
    failing_students: list[AdminDashboardFailingStudentOut]
    teacher_activity: list[AdminDashboardTeacherActivityOut]
    daily_avg: list[AdminDashboardDailyAverageOut]


class AdminAcademicYearOut(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    id: int
    name: str
    start_date: datetime
    end_date: datetime
    is_current: bool


class AdminAcademicYearsOut(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    academic_years: list[AdminAcademicYearOut]


class AdminSchoolPeriodOut(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    id: int
    name: str
    period_type: Literal["quarter", "half_year", "holiday", "vacation"]
    start_date: datetime
    end_date: datetime
    is_active: bool
    academic_year_id: int
    target_grades: list[int] | None


class AdminSchoolPeriodsOut(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    periods: list[AdminSchoolPeriodOut]


class AdminClassTeacherOut(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    id: int
    name: str | None


class AdminClassOut(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    id: int
    name: str
    teacher: AdminClassTeacherOut | None
    student_count: int
    bell_schedule_id: int | None
    grade_level: int | None
    is_profile: int
    parent_id: None
    created_at: str | None


class AdminClassesOut(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    classes: list[AdminClassOut]


class AdminTeacherDirectorySubjectOut(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    id: int
    name: str


class AdminTeacherDirectoryClassOut(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    id: int
    name: str


class AdminTeacherDirectoryAssignmentOut(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    subject: AdminTeacherDirectorySubjectOut
    class_: AdminTeacherDirectoryClassOut = Field(alias="class")

    model_config = ConfigDict(extra="forbid", strict=True, populate_by_name=True)


class AdminTeacherDirectoryTeacherOut(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    id: int
    name: str
    assignments: list[AdminTeacherDirectoryAssignmentOut]


class AdminTeacherDirectoryOut(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    teachers: list[AdminTeacherDirectoryTeacherOut]


class AdminTeacherScheduleLessonOut(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    id: int
    lesson_number: int
    subject_id: int
    subject_name: str | None
    class_id: int
    class_name: str | None
    room: str | None


class AdminTeacherScheduleDayOut(RootModel[list[AdminTeacherScheduleLessonOut]]):
    pass


class AdminTeacherScheduleOut(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    teacher_id: int
    teacher_name: str
    schedule: dict[Literal[0, 1, 2, 3, 4, 5], AdminTeacherScheduleDayOut]

    @field_validator("schedule")
    @classmethod
    def validate_schedule(cls, value):
        if set(value) != set(range(6)):
            raise ValueError("schedule must contain all six weekdays")
        for lessons in value.values():
            numbers = [lesson.lesson_number for lesson in lessons.root]
            if numbers != sorted(numbers):
                raise ValueError("lessons must be ordered by lesson number")
        return value


class AdminClassScheduleReadLessonOut(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    lesson_number: int = Field(ge=1, le=8)
    subject_display: str | None
    teacher_display: str | None
    room: str | None


class AdminClassScheduleReadDayOut(RootModel[list[AdminClassScheduleReadLessonOut]]):
    pass


class AdminClassScheduleReadOut(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    class_name: str
    schedule: dict[Literal[0, 1, 2, 3, 4, 5], AdminClassScheduleReadDayOut]

    @field_validator("schedule")
    @classmethod
    def validate_schedule(cls, value):
        if set(value) != set(range(6)):
            raise ValueError("schedule must contain all six weekdays")
        for lessons in value.values():
            numbers = [lesson.lesson_number for lesson in lessons.root]
            if any(current >= following for current, following in zip(numbers, numbers[1:])):
                raise ValueError("lesson numbers must be strictly increasing")
        return value


class AdminBellScheduleItemOut(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    lesson_number: int
    start_time: str | None
    end_time: str | None
    is_saturday: bool


class AdminBellScheduleOut(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    id: int
    name: str
    classes_count: int
    items: list[AdminBellScheduleItemOut]


class AdminBellSchedulesOut(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    success: Literal[True]
    data: list[AdminBellScheduleOut]


# ---- Subjects ----
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


# ---- Work types ----
class WorkTypeCreate(BaseModel):
    name: str
    weight: float = 1.0
    is_active: bool = True


class WorkTypeUpdate(WorkTypeCreate):
    pass


# ---- Classes ----
class ClassCreate(BaseModel):
    name: str
    grade_level: int | None = None
    is_profile: int = 0
    teacher_id: int | None = None
    bell_schedule_id: int | None = None


class ClassUpdate(ClassCreate):
    pass


class AddStudentRequest(BaseModel):
    student_id: int


# ---- Academic years ----
class AcademicYearCreate(BaseModel):
    name: str
    start_date: datetime
    end_date: datetime
    is_current: bool = False


class AcademicYearUpdate(AcademicYearCreate):
    pass


# ---- School periods ----
class SchoolPeriodCreate(BaseModel):
    name: str
    period_type: str  # quarter | half_year | holiday | vacation
    start_date: datetime
    end_date: datetime
    is_active: bool = True
    academic_year_id: int | None = None
    target_grades: str | None = None  # JSON string, e.g. "[1,2,...,9]"


class SchoolPeriodUpdate(SchoolPeriodCreate):
    pass


# ---- Bell schedules ----
class BellItem(BaseModel):
    lesson_number: int
    start_time: str | None = None
    end_time: str | None = None
    is_saturday: bool = False


class BellScheduleCreate(BaseModel):
    name: str
    items: list[BellItem] = []


class BellScheduleUpdate(BellScheduleCreate):
    pass


# ---- Teacher assignments ----
class TeacherSubjectAssign(BaseModel):
    teacher_id: int
    subject_id: int
    class_id: int
