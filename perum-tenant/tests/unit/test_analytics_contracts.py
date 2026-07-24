import pytest
from pydantic import ValidationError

from app.modules.analytics.schemas import TeacherAnalyticsTopicsOut


def test_teacher_analytics_topics_contract_accepts_full_and_empty_responses() -> None:
    response = TeacherAnalyticsTopicsOut.model_validate(
        {
            "class_avg": 3.75,
            "topics": [
                {
                    "id": 11,
                    "name": "Quadratic equations",
                    "avg": 3.2,
                    "bad_count": 4,
                    "total_count": 10,
                    "bad_ratio": "4/10",
                }
            ],
        }
    )
    empty = TeacherAnalyticsTopicsOut.model_validate({"class_avg": 0.0, "topics": []})

    assert response.topics[0].bad_count == 4
    assert empty.topics == []


@pytest.mark.parametrize(
    "payload",
    [
        {"topics": []},
        {"class_avg": None, "topics": []},
        {"class_avg": 0.0},
        {"class_avg": 0.0, "topics": None},
        {"class_avg": 0.0, "topics": [], "school_id": 1},
        {
            "class_avg": 3.2,
            "topics": [
                {
                    "id": 1,
                    "name": "Topic",
                    "avg": 3.2,
                    "bad_count": 1,
                    "total_count": 2,
                    "bad_ratio": "1/2",
                    "subject_id": 2,
                }
            ],
        },
    ],
)
def test_teacher_analytics_topics_contract_rejects_invalid_envelopes(payload: dict) -> None:
    with pytest.raises(ValidationError):
        TeacherAnalyticsTopicsOut.model_validate(payload)


@pytest.mark.parametrize("field", ["id", "name", "avg", "bad_count", "total_count", "bad_ratio"])
def test_teacher_analytics_topics_contract_rejects_missing_and_null_item_fields(field: str) -> None:
    topic = {
        "id": 1,
        "name": "Topic",
        "avg": 3.2,
        "bad_count": 1,
        "total_count": 2,
        "bad_ratio": "1/2",
    }
    with pytest.raises(ValidationError):
        TeacherAnalyticsTopicsOut.model_validate(
            {"class_avg": 3.2, "topics": [{key: value for key, value in topic.items() if key != field}]}
        )
    with pytest.raises(ValidationError):
        TeacherAnalyticsTopicsOut.model_validate(
            {"class_avg": 3.2, "topics": [{**topic, field: None}]}
        )
