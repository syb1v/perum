from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.modules.teacher.schemas import TeacherClassesOut, TeacherHomeworkListOut


def test_teacher_classes_contract_accepts_nullable_created_at() -> None:
    response = TeacherClassesOut.model_validate(
        {
            "classes": [
                {
                    "id": 1,
                    "name": "7A",
                    "student_count": 0,
                    "created_at": None,
                },
                {
                    "id": 2,
                    "name": "8B",
                    "student_count": 24,
                    "created_at": datetime(2026, 7, 22, 12, 0, tzinfo=UTC).isoformat(),
                },
            ]
        }
    )

    assert response.classes[0].created_at is None
    assert response.classes[1].created_at == datetime(2026, 7, 22, 12, 0, tzinfo=UTC)


def test_teacher_classes_contract_rejects_extra_fields() -> None:
    with pytest.raises(ValidationError):
        TeacherClassesOut.model_validate({"classes": [], "school_id": 1})


def test_teacher_homework_contract_accepts_required_nullable_fields() -> None:
    response = TeacherHomeworkListOut.model_validate(
        {
            "homework": [
                {
                    "id": 1,
                    "title": "Paragraph 5",
                    "description": "",
                    "created_at": None,
                    "class_name": None,
                    "subject_name": None,
                },
                {
                    "id": 2,
                    "title": "Exercises 1-4",
                    "description": "Complete in writing",
                    "created_at": datetime(2026, 7, 22, 12, 0, tzinfo=UTC).isoformat(),
                    "class_name": "7A",
                    "subject_name": "Mathematics",
                },
            ]
        }
    )

    assert response.homework[0].description == ""
    assert response.homework[0].created_at is None
    assert response.homework[0].class_name is None
    assert response.homework[0].subject_name is None
    assert response.homework[1].created_at == datetime(2026, 7, 22, 12, 0, tzinfo=UTC)


@pytest.mark.parametrize(
    "payload",
    [
        {"homework": [], "school_id": 1},
        {
            "homework": [
                {
                    "id": 1,
                    "title": "Paragraph 5",
                    "description": "",
                    "created_at": None,
                    "class_name": None,
                    "subject_name": None,
                    "school_id": 1,
                }
            ]
        },
    ],
)
def test_teacher_homework_contract_rejects_extra_fields(payload: dict) -> None:
    with pytest.raises(ValidationError):
        TeacherHomeworkListOut.model_validate(payload)
