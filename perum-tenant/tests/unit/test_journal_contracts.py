import pytest
from pydantic import ValidationError

from app.modules.journal.schemas import (
    JournalTeacherSubjectsOut,
    JournalTopicOut,
    JournalTopicsOut,
    JournalWorkTypesOut,
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
