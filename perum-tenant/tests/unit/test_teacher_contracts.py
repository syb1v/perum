from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.modules.teacher.schemas import TeacherClassesOut


def test_teacher_classes_contract_accepts_nullable_created_at() -> None:
    response = TeacherClassesOut.model_validate(
        {
            "classes": [
                {
                    "id": 1,
                    "name": "7A",
                    "student_count": 0,
                    "created_at": None,
                },
                {
                    "id": 2,
                    "name": "8B",
                    "student_count": 24,
                    "created_at": datetime(2026, 7, 22, 12, 0, tzinfo=UTC).isoformat(),
                },
            ]
        }
    )

    assert response.classes[0].created_at is None
    assert response.classes[1].created_at == datetime(2026, 7, 22, 12, 0, tzinfo=UTC)


def test_teacher_classes_contract_rejects_extra_fields() -> None:
    with pytest.raises(ValidationError):
        TeacherClassesOut.model_validate({"classes": [], "school_id": 1})
