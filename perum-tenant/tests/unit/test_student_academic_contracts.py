import pytest
from pydantic import ValidationError

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
