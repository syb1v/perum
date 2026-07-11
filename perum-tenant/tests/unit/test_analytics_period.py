from datetime import datetime

from app.modules.analytics.service import _grade_filter, parse_period


def test_explicit_period_end_is_inclusive() -> None:
    start, end = parse_period("2026-07-01,2026-07-11")
    assert start == datetime(2026, 7, 1)
    assert end == datetime(2026, 7, 11, 23, 59, 59)


def test_grade_filter_uses_effective_lesson_date() -> None:
    expression = str(_grade_filter(1, 2, datetime(2026, 1, 1), datetime(2026, 1, 31), None))
    assert "coalesce(grades.lesson_date, grades.created_at)" in expression
