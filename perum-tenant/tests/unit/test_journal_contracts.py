import pytest
from pydantic import ValidationError

from app.modules.journal.schemas import (
    JournalTeacherSubjectsOut,
    JournalTopicOut,
    JournalTopicsOut,
    JournalWorkTypesOut,
    JournalGradeDetailOut,
    JournalGradeUpdateOut,
    LessonOccurrenceUpdateOut,
    TopicCreate,
    TopicUpdate,
)


def test_journal_work_types_contract_accepts_items_and_empty_list() -> None:
    response = JournalWorkTypesOut.model_validate(
        {
            "success": True,
            "work_types": [{"id": 1, "name": "Test", "weight": 2.0}],
        }
    )
    empty = JournalWorkTypesOut.model_validate({"success": True, "work_types": []})

    assert response.work_types[0].weight == 2.0
    assert empty.work_types == []


@pytest.mark.parametrize(
    "payload",
    [
        {"success": True, "work_types": [], "school_id": 1},
        {
            "success": True,
            "work_types": [{"id": 1, "name": "Test", "weight": 2.0, "school_id": 1}],
        },
        {"success": True, "work_types": [{"id": 1, "name": "Test"}]},
        {"success": None, "work_types": []},
        {"success": True, "work_types": None},
    ],
)
def test_journal_work_types_contract_rejects_invalid_shapes(payload: dict) -> None:
    with pytest.raises(ValidationError):
        JournalWorkTypesOut.model_validate(payload)


def test_journal_teacher_subjects_contract_accepts_nested_nullable_picker() -> None:
    response = JournalTeacherSubjectsOut.model_validate(
        {
            "classes": [
                {"id": 1, "name": "7A", "grade_level": None, "subjects": []},
                {
                    "id": 2,
                    "name": "8B",
                    "grade_level": 8,
                    "subjects": [
                        {"id": 3, "name": "Mathematics", "short_name": None, "category": "normal"}
                    ],
                },
            ]
        }
    )
    empty = JournalTeacherSubjectsOut.model_validate({"classes": []})

    assert response.classes[0].grade_level is None
    assert response.classes[1].subjects[0].short_name is None
    assert empty.classes == []


@pytest.mark.parametrize(
    "payload",
    [
        {"classes": [], "school_id": 1},
        {"classes": [{"id": 1, "name": "7A", "grade_level": None, "subjects": [], "school_id": 1}]},
        {
            "classes": [
                {
                    "id": 1,
                    "name": "7A",
                    "grade_level": 7,
                    "subjects": [
                        {"id": 2, "name": "Mathematics", "short_name": None, "category": "normal", "school_id": 1}
                    ],
                }
            ]
        },
        {"classes": [{"id": 1, "name": "7A", "grade_level": 7}]},
        {"classes": None},
    ],
)
def test_journal_teacher_subjects_contract_rejects_invalid_shapes(payload: dict) -> None:
    with pytest.raises(ValidationError):
        JournalTeacherSubjectsOut.model_validate(payload)


def test_journal_topics_read_contract_accepts_items_and_empty_list() -> None:
    response = JournalTopicsOut.model_validate(
        {"topics": [{"id": 1, "name": "Quadratic equations", "order_num": 4}]}
    )
    empty = JournalTopicsOut.model_validate({"topics": []})

    assert response.topics[0].order_num == 4
    assert empty.topics == []


@pytest.mark.parametrize(
    "payload",
    [
        {"topics": [], "school_id": 1},
        {"topics": [{"id": 1, "name": "Topic", "order_num": 1, "subject_id": 2}]},
        {"topics": [{"id": 1, "name": "Topic", "order_num": 1, "description": "Extra"}]},
        {"topics": [{"name": "Topic", "order_num": 1}]},
        {"topics": [{"id": 1, "order_num": 1}]},
        {"topics": [{"id": 1, "name": "Topic"}]},
        {"topics": [{"id": None, "name": "Topic", "order_num": 1}]},
        {"topics": None},
        {},
    ],
)
def test_journal_topics_read_contract_rejects_invalid_shapes(payload: dict) -> None:
    with pytest.raises(ValidationError):
        JournalTopicsOut.model_validate(payload)


@pytest.mark.parametrize("schema", [TopicCreate, TopicUpdate])
def test_journal_topic_mutation_requests_accept_only_name(schema: type) -> None:
    assert schema.model_validate({"name": "Quadratic equations"}).name == "Quadratic equations"

    for payload in [{}, {"name": None}, {"name": "Topic", "order_num": 2}, {"name": "Topic", "subject_id": 1}]:
        with pytest.raises(ValidationError):
            schema.model_validate(payload)


def test_journal_topic_mutation_response_is_closed() -> None:
    response = JournalTopicOut.model_validate({"id": 1, "name": "Topic", "order_num": 2})

    assert response.order_num == 2
    with pytest.raises(ValidationError):
        JournalTopicOut.model_validate({"id": 1, "name": "Topic", "order_num": 2, "subject_id": 3})


def test_lesson_occurrence_update_receipt_accepts_nullable_topic() -> None:
    response = LessonOccurrenceUpdateOut.model_validate(
        {
            "success": True,
            "occurrence_id": 17,
            "status": "completed",
            "lesson_date": "2026-07-23",
            "lesson_number": 4,
            "topic_id": None,
            "version": 4,
        }
    )

    assert response.lesson_date.isoformat() == "2026-07-23"
    assert response.topic_id is None
    assert response.version == 4


@pytest.mark.parametrize(
    "field,value",
    [
        ("success", None),
        ("occurrence_id", None),
        ("status", "draft"),
        ("lesson_date", None),
        ("lesson_number", 9),
        ("version", 0),
    ],
)
def test_lesson_occurrence_update_receipt_rejects_invalid_fields(field: str, value: object) -> None:
    payload = {
        "success": True,
        "occurrence_id": 17,
        "status": "scheduled",
        "lesson_date": "2026-07-23",
        "lesson_number": 4,
        "topic_id": 3,
        "version": 4,
    }
    payload[field] = value

    with pytest.raises(ValidationError):
        LessonOccurrenceUpdateOut.model_validate(payload)


def test_lesson_occurrence_update_receipt_rejects_missing_and_extra_fields() -> None:
    payload = {
        "success": True,
        "occurrence_id": 17,
        "status": "scheduled",
        "lesson_date": "2026-07-23",
        "lesson_number": 4,
        "topic_id": None,
        "version": 4,
    }

    for field in payload:
        with pytest.raises(ValidationError):
            LessonOccurrenceUpdateOut.model_validate({key: value for key, value in payload.items() if key != field})
    with pytest.raises(ValidationError):
        LessonOccurrenceUpdateOut.model_validate({**payload, "school_id": 1})


def test_journal_grade_detail_contract_accepts_full_and_nullable_responses() -> None:
    response = JournalGradeDetailOut.model_validate(
        {
            "id": 42,
            "version": 3,
            "grade_value": 5,
            "points": 10,
            "grade_type": "",
            "work_type_id": 7,
            "weight": 2.0,
            "lesson_date": "2026-07-23",
            "comment": "Good work",
            "attendance_mark": None,
            "color": "#4CAF50",
            "created_at": "2026-07-23T10:15:00",
            "subject": {"id": 11, "name": "Mathematics", "category": "normal"},
            "student": {"id": 25, "first_name": "Ivan", "last_name": None},
            "topic_id": 8,
            "topic_name": "Quadratic equations",
        }
    )
    nullable = JournalGradeDetailOut.model_validate(
        {
            "id": 43,
            "version": 1,
            "grade_value": None,
            "points": 0,
            "grade_type": "",
            "work_type_id": None,
            "weight": 1.0,
            "lesson_date": None,
            "comment": None,
            "attendance_mark": "УП",
            "color": None,
            "created_at": None,
            "subject": None,
            "student": None,
            "topic_id": None,
            "topic_name": None,
        }
    )

    assert response.lesson_date is not None and response.lesson_date.isoformat() == "2026-07-23"
    assert response.created_at is not None and response.created_at.isoformat() == "2026-07-23T10:15:00"
    assert nullable.grade_value is None


def test_journal_grade_detail_contract_rejects_missing_and_extra_fields() -> None:
    payload = {
        "id": 42,
        "version": 3,
        "grade_value": 5,
        "points": 10,
        "grade_type": "",
        "work_type_id": 7,
        "weight": 2.0,
        "lesson_date": "2026-07-23",
        "comment": None,
        "attendance_mark": None,
        "color": "#4CAF50",
        "created_at": "2026-07-23T10:15:00",
        "subject": {"id": 11, "name": "Mathematics", "category": "normal"},
        "student": {"id": 25, "first_name": "Ivan", "last_name": "Ivanov"},
        "topic_id": None,
        "topic_name": None,
    }

    for field in payload:
        with pytest.raises(ValidationError):
            JournalGradeDetailOut.model_validate({key: value for key, value in payload.items() if key != field})
    with pytest.raises(ValidationError):
        JournalGradeDetailOut.model_validate({**payload, "school_id": 1})
    with pytest.raises(ValidationError):
        JournalGradeDetailOut.model_validate({**payload, "version": 0})
    with pytest.raises(ValidationError):
        JournalGradeDetailOut.model_validate({**payload, "subject": {**payload["subject"], "school_id": 1}})


def test_journal_grade_update_receipt_accepts_grade_and_attendance_results() -> None:
    response = JournalGradeUpdateOut.model_validate(
        {
            "success": True,
            "version": 4,
            "grade_value": 5,
            "points": 50,
            "points_diff": 30,
            "new_balance": 125,
            "color": "#4CAF50",
        }
    )
    attendance = JournalGradeUpdateOut.model_validate(
        {
            "success": True,
            "version": 2,
            "grade_value": None,
            "points": 0,
            "points_diff": -10,
            "new_balance": 0,
            "color": None,
        }
    )

    assert response.version == 4
    assert response.points_diff == 30
    assert attendance.grade_value is None
    assert attendance.color is None


def test_journal_grade_update_receipt_rejects_missing_and_extra_fields() -> None:
    payload = {
        "success": True,
        "version": 4,
        "grade_value": 5,
        "points": 50,
        "points_diff": 30,
        "new_balance": 125,
        "color": "#4CAF50",
    }

    for field in payload:
        with pytest.raises(ValidationError):
            JournalGradeUpdateOut.model_validate({key: value for key, value in payload.items() if key != field})
    with pytest.raises(ValidationError):
        JournalGradeUpdateOut.model_validate({**payload, "school_id": 1})
    with pytest.raises(ValidationError):
        JournalGradeUpdateOut.model_validate({**payload, "version": 0})
