import pytest
from pydantic import ValidationError

from app.modules.journal.schemas import JournalWorkTypesOut


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
