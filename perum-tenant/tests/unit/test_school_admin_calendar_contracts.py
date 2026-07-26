from datetime import datetime

import pytest
from pydantic import ValidationError

from app.modules.school_admin.schemas import AdminAcademicYearsOut, AdminSchoolPeriodsOut
from app.modules.school_admin.service_academic import _target_grades


def test_admin_calendar_contracts_accept_closed_read_models() -> None:
    now = datetime(2026, 7, 25)
    years = AdminAcademicYearsOut.model_validate({"academic_years": [{"id": 1, "name": "2025-2026", "start_date": now, "end_date": now, "is_current": True}]}, strict=True)
    periods = AdminSchoolPeriodsOut.model_validate({"periods": [{"id": 2, "name": "I четверть", "period_type": "quarter", "start_date": now, "end_date": now, "is_active": True, "academic_year_id": 1, "target_grades": [1, 2, 3]}]}, strict=True)
    assert years.academic_years[0].is_current is True
    assert periods.periods[0].target_grades == [1, 2, 3]
    assert AdminAcademicYearsOut.model_validate({"academic_years": []}, strict=True).academic_years == []


@pytest.mark.parametrize("value", [
    {"academic_years": [{"id": 1, "name": "Год", "start_date": datetime.now(), "end_date": datetime.now(), "is_current": True, "extra": 1}]},
    {"academic_years": [{"id": "1", "name": "Год", "start_date": datetime.now(), "end_date": datetime.now(), "is_current": True}]},
])
def test_admin_academic_year_contract_rejects_invalid_shapes(value: dict) -> None:
    with pytest.raises(ValidationError):
        AdminAcademicYearsOut.model_validate(value, strict=True)


def test_admin_period_contract_rejects_unknown_type() -> None:
    with pytest.raises(ValidationError):
        AdminSchoolPeriodsOut.model_validate({"periods": [{"id": 2, "name": "Период", "period_type": "custom", "start_date": datetime.now(), "end_date": datetime.now(), "is_active": True, "academic_year_id": 1, "target_grades": None}]}, strict=True)


def test_target_grades_normalization_fails_closed() -> None:
    assert _target_grades("[1, 5, 11]") == [1, 5, 11]
    assert _target_grades(None) is None
    assert _target_grades("invalid") is None
    assert _target_grades("[0, 12]") is None
    assert _target_grades('[1, "2"]') is None
