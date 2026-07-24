import pytest
from pydantic import ValidationError

from app.modules.analytics.schemas import TeacherAnalyticsDashboardOut, TeacherAnalyticsTopicsOut


def _dashboard_payload() -> dict:
    return {
        "class_id": 7,
        "class_name": "8A",
        "period": {"start": "2026-01-01T00:00:00", "end": "2026-03-31T23:59:59.999999"},
        "kpi": {
            "avg_grade": 3.75,
            "total_grades": 10,
            "bad_grades": 4,
            "bad_ratio": "4/10",
            "problem_topics_count": 1,
        },
        "dynamics": [{"date": "2026-01-10", "avg": 4.2}],
        "problem_topics": [
            {
                "id": 11,
                "name": "Quadratic equations",
                "avg": 3.2,
                "bad_count": 4,
                "total_count": 10,
                "bad_ratio": "4/10",
            }
        ],
        "attention_students": [{"id": 12, "name": "Student A.", "avg": 3.1, "twos": 3}],
    }


def test_teacher_analytics_dashboard_contract_accepts_full_and_empty_collections() -> None:
    response = TeacherAnalyticsDashboardOut.model_validate(_dashboard_payload())
    empty = TeacherAnalyticsDashboardOut.model_validate(
        {**_dashboard_payload(), "dynamics": [], "problem_topics": [], "attention_students": []}
    )

    assert response.period.start == "2026-01-01T00:00:00"
    assert response.problem_topics[0].bad_count == 4
    assert empty.attention_students == []


@pytest.mark.parametrize(
    "payload",
    [
        {key: value for key, value in _dashboard_payload().items() if key != "period"},
        {**_dashboard_payload(), "class_name": None},
        {**_dashboard_payload(), "dynamics": None},
        {**_dashboard_payload(), "school_id": 1},
        {**_dashboard_payload(), "period": {"start": "2026-01-01T00:00:00"}},
        {**_dashboard_payload(), "kpi": {**_dashboard_payload()["kpi"], "school_id": 1}},
        {**_dashboard_payload(), "dynamics": [{"date": "2026-01-10", "avg": 4.2, "grade_id": 1}]},
        {**_dashboard_payload(), "attention_students": [{"id": 1, "name": "A.", "avg": 3.0}]},
    ],
)
def test_teacher_analytics_dashboard_contract_rejects_invalid_shapes(payload: dict) -> None:
    with pytest.raises(ValidationError):
        TeacherAnalyticsDashboardOut.model_validate(payload)


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
