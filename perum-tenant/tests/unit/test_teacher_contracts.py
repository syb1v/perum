from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.modules.teacher.schemas import TeacherClassesOut, TeacherHomeworkListOut, TeacherWorksOut


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


def test_teacher_works_contract_accepts_nullable_fields_and_empty_page() -> None:
    response = TeacherWorksOut.model_validate(
        {
            "works": [
                {
                    "id": "hw_1",
                    "type": "homework",
                    "class_id": 1,
                    "class_name": "7A",
                    "subject_id": 2,
                    "subject_name": "Mathematics",
                    "title": "Exercises",
                    "description": "Complete in writing",
                    "due_date": "2026-07-25T12:00:00",
                    "created_at": "2026-07-24T12:00:00",
                },
                {
                    "id": "cw_2",
                    "type": "control",
                    "class_id": 3,
                    "class_name": None,
                    "subject_id": 4,
                    "subject_name": None,
                    "title": "Test",
                    "description": None,
                    "due_date": "2026-07-26",
                    "created_at": None,
                },
            ],
            "has_more": False,
        }
    )
    empty = TeacherWorksOut.model_validate({"works": [], "has_more": False})

    assert response.works[1].class_name is None
    assert response.works[1].description is None
    assert empty.works == []


@pytest.mark.parametrize(
    "payload",
    [
        {"has_more": False},
        {"works": [], "has_more": None},
        {"works": None, "has_more": False},
        {"works": [], "has_more": False, "school_id": 1},
        {
            "works": [
                {
                    "id": "hw_1",
                    "type": "independent",
                    "class_id": 1,
                    "class_name": None,
                    "subject_id": 2,
                    "subject_name": None,
                    "title": "Work",
                    "description": None,
                    "due_date": None,
                    "created_at": None,
                }
            ],
            "has_more": False,
        },
        {
            "works": [
                {
                    "id": "hw_1",
                    "type": "homework",
                    "class_id": 1,
                    "class_name": None,
                    "subject_id": 2,
                    "subject_name": None,
                    "title": "Work",
                    "description": None,
                    "due_date": None,
                }
            ],
            "has_more": False,
        },
    ],
)
def test_teacher_works_contract_rejects_invalid_shapes(payload: dict) -> None:
    with pytest.raises(ValidationError):
        TeacherWorksOut.model_validate(payload)
