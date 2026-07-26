import pytest
from pydantic import ValidationError

from app.modules.school_admin.schemas import AdminBellSchedulesOut


def payload() -> dict:
    return {
        "success": True,
        "data": [{
            "id": 1,
            "name": "Первая смена",
            "classes_count": 4,
            "items": [{"lesson_number": 1, "start_time": "08:00", "end_time": "08:40", "is_saturday": False}],
        }],
    }


def test_bell_schedules_contract_accepts_authoritative_snapshot() -> None:
    result = AdminBellSchedulesOut.model_validate(payload(), strict=True)
    assert result.success is True
    assert result.data[0].items[0].start_time == "08:00"


@pytest.mark.parametrize(
    "value",
    [
        {**payload(), "extra": True},
        {**payload(), "success": False},
        {"success": True, "data": [{**payload()["data"][0], "contact": "hidden"}]},
        {"success": True, "data": [{**payload()["data"][0], "items": [{"lesson_number": 1, "start_time": None, "end_time": None, "is_saturday": False, "room": "1"}]}]},
    ],
)
def test_bell_schedules_contract_rejects_unknown_or_invalid_fields(value: dict) -> None:
    with pytest.raises(ValidationError):
        AdminBellSchedulesOut.model_validate(value, strict=True)
