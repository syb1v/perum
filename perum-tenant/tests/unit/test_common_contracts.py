import pytest
from pydantic import ValidationError

from app.modules.common.schemas import ActivePeriodsOut


def test_active_periods_contract_accepts_current_and_empty_response() -> None:
    response = ActivePeriodsOut.model_validate(
        {
            "current_period": {
                "id": 1,
                "name": "First quarter",
                "period_type": "quarter",
                "start_date": "2026-09-01",
                "end_date": "2026-10-30",
            },
            "periods": [
                {
                    "id": 2,
                    "name": "Autumn holiday",
                    "period_type": "holiday",
                    "start_date": "2026-10-31",
                    "end_date": "2026-11-08",
                }
            ],
        }
    )
    empty = ActivePeriodsOut.model_validate({"current_period": None, "periods": []})

    assert response.current_period is not None
    assert response.current_period.start_date.isoformat() == "2026-09-01"
    assert response.periods[0].end_date.isoformat() == "2026-11-08"
    assert empty.current_period is None


@pytest.mark.parametrize(
    "payload",
    [
        {"periods": []},
        {"current_period": None},
        {"current_period": None, "periods": [], "school_id": 1},
        {
            "current_period": None,
            "periods": [
                {
                    "id": 1,
                    "name": "Quarter",
                    "period_type": "quarter",
                    "start_date": "2026-09-01",
                    "end_date": "2026-10-30",
                    "academic_year_id": 1,
                }
            ],
        },
        {
            "current_period": None,
            "periods": [
                {
                    "id": 1,
                    "name": "Quarter",
                    "period_type": "quarter",
                    "start_date": None,
                    "end_date": "2026-10-30",
                }
            ],
        },
    ],
)
def test_active_periods_contract_rejects_invalid_shapes(payload: dict) -> None:
    with pytest.raises(ValidationError):
        ActivePeriodsOut.model_validate(payload)
