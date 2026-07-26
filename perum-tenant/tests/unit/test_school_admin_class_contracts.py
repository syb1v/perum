import pytest
from pydantic import ValidationError

from app.modules.school_admin.schemas import AdminClassesOut


def class_payload() -> dict:
    return {"id": 1, "name": "7 А", "teacher": {"id": 2, "name": "Учитель"}, "student_count": 20, "bell_schedule_id": None, "grade_level": 7, "is_profile": 0, "parent_id": None, "created_at": None}


def test_admin_classes_contract_accepts_populated_and_empty_lists() -> None:
    assert AdminClassesOut.model_validate({"classes": [class_payload()]}, strict=True).classes[0].student_count == 20
    assert AdminClassesOut.model_validate({"classes": [{**class_payload(), "teacher": None}]}, strict=True).classes[0].teacher is None
    assert AdminClassesOut.model_validate({"classes": []}, strict=True).classes == []


@pytest.mark.parametrize("mutate", [
    lambda value: value.__setitem__("unknown", True),
    lambda value: value.__setitem__("student_count", "20"),
    lambda value: value["teacher"].__setitem__("extra", True),
])
def test_admin_classes_contract_rejects_invalid_shapes(mutate) -> None:
    value = class_payload()
    mutate(value)
    with pytest.raises(ValidationError):
        AdminClassesOut.model_validate({"classes": [value]}, strict=True)
