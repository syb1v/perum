import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from pydantic import ValidationError

from app.modules.student import service
from app.modules.student.schemas import (
    StudentDiaryOut,
    StudentFinalGradesOut,
    StudentGradesOut,
    StudentQuestOut,
)


def test_no_class_diary_has_normalized_closed_shape() -> None:
    response = StudentDiaryOut.model_validate(
        {
            "class_id": None,
            "class_name": None,
            "week_start": "2026-07-20",
            "week_end": "2026-07-26",
            "week_offset": 0,
            "current_period": None,
            "week_periods": [],
            "diary": {},
        }
    )

    assert response.diary == {}
    with pytest.raises(ValidationError):
        StudentDiaryOut.model_validate({"class_id": None, "class_name": None, "diary": {}})


def test_diary_service_returns_string_day_keys(monkeypatch) -> None:
    empty_scalars = SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: []))
    empty_rows = SimpleNamespace(all=lambda: [])
    db = SimpleNamespace(
        execute=AsyncMock(
            side_effect=[empty_scalars, empty_scalars, empty_rows, empty_scalars, empty_scalars, empty_scalars]
        )
    )
    monkeypatch.setattr(
        service,
        "_student_class",
        AsyncMock(return_value=SimpleNamespace(id=1, name="5А", bell_schedule_id=None, grade_level=5)),
    )
    monkeypatch.setattr(service, "_work_type_names", AsyncMock(return_value={}))
    monkeypatch.setattr(service, "_list_periods", AsyncMock(return_value=[]))

    payload = asyncio.run(service.get_diary(db, 1, SimpleNamespace(id=2), 0))
    response = StudentDiaryOut.model_validate(payload)

    assert list(response.diary) == ["0", "1", "2", "3", "4", "5"]


def test_student_grades_and_finals_are_closed() -> None:
    grades = StudentGradesOut.model_validate(
        {"grades": [{"id": 1, "value": 5, "points": 10, "weight": 2, "date": "2026-07-20", "type": "Test", "comment": None, "subject_id": 2, "subject_name": "Math", "color": "green", "topic": None}]}
    )
    finals = StudentFinalGradesOut.model_validate(
        {"final_grades": [{"id": 3, "subject_id": 2, "subject_name": "Math", "period_id": None, "period_name": None, "grade_value": 5, "grade_type": "year", "comment": None, "color": "green"}]}
    )

    assert grades.grades[0].value == 5
    assert finals.final_grades[0].grade_value == 5
    with pytest.raises(ValidationError):
        StudentGradesOut.model_validate({"grades": [], "school_id": 1})


def test_student_quest_contract_matches_consumer_states() -> None:
    quest = StudentQuestOut.model_validate(
        {"id": None, "quest_id": 4, "title": "Quest", "description": None, "reward": 20, "progress": 0, "target": 3, "status": "available", "reward_claimed": False}
    )

    assert quest.status == "available"
    with pytest.raises(ValidationError):
        StudentQuestOut.model_validate({**quest.model_dump(), "status": "draft"})
