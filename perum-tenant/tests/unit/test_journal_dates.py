from datetime import date, datetime

import pytest
from fastapi import HTTPException

from app.modules.journal.service import _resolve_period, _scheduled_lesson_dates


class Period:
    def __init__(self, period_id: int, start: datetime, end: datetime) -> None:
        self.id = period_id
        self.period_type = "quarter"
        self.start_date = start
        self.end_date = end


def test_scheduled_lesson_dates_includes_dates_without_grades() -> None:
    assert _scheduled_lesson_dates(date(2026, 7, 1), date(2026, 7, 14), [0, 2]) == {
        "2026-07-01",
        "2026-07-06",
        "2026-07-08",
        "2026-07-13",
    }


def test_scheduled_lesson_dates_stays_inside_period() -> None:
    assert _scheduled_lesson_dates(date(2026, 7, 7), date(2026, 7, 7), [0, 2]) == set()


def test_resolve_period_rejects_unknown_id() -> None:
    periods = [Period(1, datetime(2026, 1, 1), datetime(2026, 3, 31))]
    with pytest.raises(HTTPException) as exc:
        _resolve_period(periods, 999)
    assert exc.value.status_code == 404


def test_resolve_period_uses_latest_completed_when_between_periods() -> None:
    periods = [
        Period(1, datetime(2025, 1, 1), datetime(2025, 3, 31)),
        Period(2, datetime(2025, 4, 1), datetime(2025, 6, 30)),
    ]
    assert _resolve_period(periods, None).id == 2
