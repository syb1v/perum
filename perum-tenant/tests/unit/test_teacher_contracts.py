from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.modules.teacher.schemas import TeacherClassesOut, TeacherDiaryOut, TeacherHomeroomOut, TeacherHomeworkListOut, TeacherWorksOut


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


def _teacher_diary_payload() -> dict:
    return {
        "teacher_id": 1,
        "teacher_name": "Teacher Name",
        "week_start": "2026-07-20",
        "week_end": "2026-07-25",
        "week_offset": 0,
        "diary": {
            "0": {
                "date": "2026-07-20",
                "day_name": "Monday",
                "is_today": False,
                "lessons": [
                    {
                        "lesson_number": 1,
                        "subject_id": 2,
                        "subject_name": None,
                        "class_id": 3,
                        "class_name": None,
                        "room": None,
                        "start_time": None,
                        "end_time": None,
                        "homework": [
                            {
                                "id": 4,
                                "title": "Homework",
                                "description": None,
                                "due_date": None,
                                "attachments": [{"id": 5, "filename": None, "url_link": None}],
                            }
                        ],
                        "control_work": None,
                        "occurrence_id": None,
                        "status": "scheduled",
                        "version": None,
                    }
                ],
            }
        },
    }


def test_teacher_diary_contract_accepts_nested_nullable_schedule() -> None:
    response = TeacherDiaryOut.model_validate(_teacher_diary_payload())

    lesson = response.diary["0"].lessons[0]
    assert lesson.subject_name is None
    assert lesson.homework[0].attachments[0].filename is None


@pytest.mark.parametrize(
    "payload",
    [
        {key: value for key, value in _teacher_diary_payload().items() if key != "diary"},
        {**_teacher_diary_payload(), "school_id": 1},
        {
            **_teacher_diary_payload(),
            "diary": {"0": {**_teacher_diary_payload()["diary"]["0"], "school_id": 1}},
        },
        {
            **_teacher_diary_payload(),
            "diary": {
                "0": {
                    **_teacher_diary_payload()["diary"]["0"],
                    "lessons": [{**_teacher_diary_payload()["diary"]["0"]["lessons"][0], "status": "moved"}],
                }
            },
        },
        {
            **_teacher_diary_payload(),
            "diary": {
                "0": {
                    **_teacher_diary_payload()["diary"]["0"],
                    "lessons": [{**_teacher_diary_payload()["diary"]["0"]["lessons"][0], "group_name": "A"}],
                }
            },
        },
    ],
)
def test_teacher_diary_contract_rejects_invalid_shapes(payload: dict) -> None:
    with pytest.raises(ValidationError):
        TeacherDiaryOut.model_validate(payload)


def test_teacher_homeroom_contract_accepts_assigned_and_unassigned_states() -> None:
    unassigned = TeacherHomeroomOut.model_validate(
        {
            "has_class": False,
            "class": None,
            "students": [],
            "stats": {"student_count": 0, "avg_balance": 0, "total_grades": 0, "avg_grade": 0},
        }
    )
    assigned = TeacherHomeroomOut.model_validate(
        {
            "has_class": True,
            "class": {"id": 1, "name": "7A", "grade_level": None, "is_profile": 0},
            "students": [
                {
                    "id": 2,
                    "login": "student",
                    "first_name": None,
                    "last_name": None,
                    "patronymic": None,
                    "balance": 10,
                    "is_online": False,
                    "enrollment_status": "active",
                }
            ],
            "stats": {"student_count": 1, "avg_balance": 10.0, "total_grades": 2, "avg_grade": 4.5},
        }
    )

    assert unassigned.class_ is None
    assert assigned.class_.grade_level is None
    assert assigned.students[0].first_name is None


@pytest.mark.parametrize(
    "payload",
    [
        {"has_class": False, "class": None, "students": []},
        {
            "has_class": False,
            "class": None,
            "students": [],
            "stats": {"student_count": 0, "avg_balance": 0, "total_grades": 0, "avg_grade": 0},
            "school_id": 1,
        },
        {
            "has_class": True,
            "class": {"id": 1, "name": "7A", "grade_level": None, "is_profile": 0, "school_id": 1},
            "students": [],
            "stats": {"student_count": 0, "avg_balance": 0, "total_grades": 0, "avg_grade": 0},
        },
        {
            "has_class": True,
            "class": {"id": 1, "name": "7A", "grade_level": 7, "is_profile": 0},
            "students": [
                {
                    "id": 2,
                    "login": "student",
                    "first_name": None,
                    "last_name": None,
                    "patronymic": None,
                    "balance": 0,
                    "is_online": False,
                    "enrollment_status": "inactive",
                }
            ],
            "stats": {"student_count": 1, "avg_balance": 0, "total_grades": 0, "avg_grade": 0},
        },
    ],
)
def test_teacher_homeroom_contract_rejects_invalid_shapes(payload: dict) -> None:
    with pytest.raises(ValidationError):
        TeacherHomeroomOut.model_validate(payload)
