import pytest
from pydantic import ValidationError

from app.modules.school_admin.schemas import AdminDashboardOverviewOut


def payload() -> dict:
    return {
        "success": True,
        "kpi": {"average_grade": 4.1, "total_grades": 20, "total_students": 8, "failing_count": 1, "absences": 2, "homework_count": 5, "control_work_count": 1},
        "class_performance": [{"class_id": 1, "class_name": "7 А", "grade_level": None, "avg_grade": 4.2, "grades_count": 10}],
        "grade_distribution": [{"grade_value": 5, "count": 4}],
        "attendance": [{"mark": "УП", "count": 2}],
        "failing_students": [{"id": 2, "name": "Ученик", "avg": 2.5, "grades_count": 4, "class_name": None}],
        "teacher_activity": [{"id": 3, "name": "Учитель", "grades_given": 12}],
        "daily_avg": [{"date": "25.07", "avg_grade": 4.0}],
    }


def test_admin_dashboard_contract_accepts_populated_and_empty_overview() -> None:
    assert AdminDashboardOverviewOut.model_validate(payload(), strict=True).kpi.total_grades == 20
    empty = payload()
    for field in ("class_performance", "grade_distribution", "attendance", "failing_students", "teacher_activity", "daily_avg"):
        empty[field] = []
    assert AdminDashboardOverviewOut.model_validate(empty, strict=True).daily_avg == []


@pytest.mark.parametrize("mutate", [
    lambda value: value.__setitem__("unknown", True),
    lambda value: value["kpi"].__setitem__("unknown", 1),
    lambda value: value["kpi"].pop("total_grades"),
    lambda value: value["class_performance"][0].__setitem__("avg_grade", "4.2"),
    lambda value: value["failing_students"][0].__setitem__("class_name", 7),
])
def test_admin_dashboard_contract_rejects_invalid_shapes(mutate) -> None:
    value = payload()
    mutate(value)
    with pytest.raises(ValidationError):
        AdminDashboardOverviewOut.model_validate(value, strict=True)
