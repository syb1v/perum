from datetime import datetime

from pydantic import BaseModel


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
