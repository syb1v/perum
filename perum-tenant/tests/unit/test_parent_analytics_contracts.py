import pytest
from pydantic import ValidationError

from app.modules.parent.schemas import ParentChildrenOut, ParentTransactionsOut
from app.modules.student.schemas import GradesAnalyticsOut, GradesSummaryOut


def test_parent_children_contract_accepts_nullable_projection_and_empty_list() -> None:
    response = ParentChildrenOut.model_validate(
        {
            "children": [
                {
                    "id": 1,
                    "first_name": None,
                    "last_name": None,
                    "patronymic": None,
                    "balance": 0,
                    "class_name": None,
                    "class_id": None,
                    "average": 0,
                    "total_grades": 0,
                    "enrollment_status": "active",
                }
            ]
        }
    )
    empty = ParentChildrenOut.model_validate({"children": []})

    assert response.children[0].class_id is None
    assert empty.children == []


def test_grades_summary_contract_accepts_populated_and_empty_responses() -> None:
    response = GradesSummaryOut.model_validate(
        {
            "subjects": [
                {"subject_id": 1, "subject_name": "Mathematics", "average": 4.25, "count": 4, "points": 20}
            ],
            "total_points": 20,
            "total_grades": 4,
        }
    )
    empty = GradesSummaryOut.model_validate({"subjects": [], "total_points": 0, "total_grades": 0})

    assert response.subjects[0].average == 4.25
    assert empty.subjects == []


@pytest.mark.parametrize("period_type", ["quarter", "half_year"])
def test_grades_analytics_contract_accepts_period_types_and_nullable_map(period_type: str) -> None:
    response = GradesAnalyticsOut.model_validate(
        {
            "period_type": period_type,
            "current_period": None,
            "periods": [
                {
                    "id": 1,
                    "name": "Period 1",
                    "start_date": "2026-09-01T00:00:00",
                    "end_date": "2026-10-31T23:59:59",
                }
            ],
            "subjects": [
                {
                    "subject_id": 2,
                    "subject_name": "Mathematics",
                    "periods": {"1": None},
                    "year_average": 4.0,
                }
            ],
        }
    )

    assert response.current_period is None
    assert response.subjects[0].periods["1"] is None


def test_parent_transactions_contract_accepts_nullable_fields_and_empty_list() -> None:
    response = ParentTransactionsOut.model_validate(
        {
            "transactions": [
                {
                    "id": 1,
                    "amount": -5,
                    "balance_after": 10,
                    "type": "purchase",
                    "reason": None,
                    "created_at": None,
                }
            ]
        }
    )
    empty = ParentTransactionsOut.model_validate({"transactions": []})

    assert response.transactions[0].reason is None
    assert empty.transactions == []


@pytest.mark.parametrize(
    ("schema", "payload"),
    [
        (ParentChildrenOut, {"children": [], "school_id": 1}),
        (
            ParentChildrenOut,
            {
                "children": [
                    {
                        "id": 1,
                        "first_name": None,
                        "last_name": None,
                        "patronymic": None,
                        "balance": 0,
                        "class_name": None,
                        "class_id": None,
                        "average": 0,
                        "total_grades": 0,
                        "enrollment_status": "inactive",
                    }
                ]
            },
        ),
        (GradesSummaryOut, {"subjects": [], "total_points": 0}),
        (
            GradesAnalyticsOut,
            {"period_type": "year", "current_period": None, "periods": [], "subjects": []},
        ),
        (
            GradesAnalyticsOut,
            {"period_type": "quarter", "periods": [], "subjects": []},
        ),
        (ParentTransactionsOut, {"transactions": [], "student_id": 1}),
    ],
)
def test_parent_analytics_contracts_reject_invalid_shapes(schema: type, payload: dict) -> None:
    with pytest.raises(ValidationError):
        schema.model_validate(payload)
