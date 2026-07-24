import pytest
from pydantic import ValidationError

from app.services.parsers.dtos import ImportExecutionResponse, ParsingPreviewResponse


def test_import_preview_contract_is_closed() -> None:
    response = ParsingPreviewResponse.model_validate(
        {
            "subject_raw_name": None,
            "class_raw_name": "7A",
            "unique_acronyms": ["HW"],
            "unique_dates": ["2026-07-20"],
            "student_names": ["Ivan Ivanov"],
            "preview_grades": [
                {
                    "student_name": "Ivan Ivanov",
                    "date": "2026-07-20",
                    "acronym": "HW",
                    "grade_value": 5,
                    "attendance_mark": None,
                    "original_cell_text": "5",
                }
            ],
            "total_grades_found": 1,
            "validation_errors": [],
        }
    )

    assert response.preview_grades[0].grade_value == 5
    with pytest.raises(ValidationError):
        ParsingPreviewResponse.model_validate({**response.model_dump(), "debug": True})


def test_import_execution_contract_has_typed_logs() -> None:
    response = ImportExecutionResponse.model_validate(
        {
            "added_count": 1,
            "skipped_count": 0,
            "replaced_count": 2,
            "logs": [{"student_name": "Ivan Ivanov", "date": "2026-07-20", "message": "Added", "level": "info"}],
        }
    )

    assert response.logs[0].level == "info"
    with pytest.raises(ValidationError):
        ImportExecutionResponse.model_validate({**response.model_dump(), "logs": [{"student_name": "Ivan Ivanov", "date": "2026-07-20", "message": "Added", "level": "debug"}]})
