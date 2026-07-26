import pytest
from pydantic import ValidationError

from app.modules.school_admin.schemas import AdminTeacherDirectoryOut


def teacher_payload() -> dict:
    return {"id": 1, "name": "Иванов Иван", "assignments": [{"subject": {"id": 2, "name": "Математика"}, "class": {"id": 3, "name": "7 А"}}]}


def test_teacher_directory_contract_accepts_metadata_only_shape() -> None:
    result = AdminTeacherDirectoryOut.model_validate({"teachers": [teacher_payload(), {"id": 4, "name": "Без назначений", "assignments": []}]}, strict=True)
    assert result.teachers[0].assignments[0].class_.name == "7 А"


@pytest.mark.parametrize("mutate", [
    lambda value: value["teachers"][0].__setitem__("email", "secret@example.com"),
    lambda value: value["teachers"][0]["assignments"][0].__setitem__("id", 9),
    lambda value: value["teachers"][0]["assignments"][0].__setitem__("class_val", value["teachers"][0]["assignments"][0].pop("class")),
])
def test_teacher_directory_contract_rejects_legacy_or_sensitive_fields(mutate) -> None:
    value = {"teachers": [teacher_payload()]}
    mutate(value)
    with pytest.raises(ValidationError):
        AdminTeacherDirectoryOut.model_validate(value, strict=True)
