import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.modules.journal.service import (
    _award,
    _parse_lesson_date,
    _validate_grade_values,
    _validate_student,
    _work_type_weight,
)


def test_grade_values_have_create_update_parity() -> None:
    for grade_value, attendance_mark in [(None, None), (6, None), (None, "late")]:
        with pytest.raises(HTTPException) as exc:
            _validate_grade_values(grade_value, attendance_mark)
        assert exc.value.status_code == 400

    _validate_grade_values(5, None)
    _validate_grade_values(None, "НП")


def test_invalid_lesson_date_is_rejected() -> None:
    with pytest.raises(HTTPException) as exc:
        _parse_lesson_date("not-a-date")
    assert exc.value.status_code == 400


def test_student_must_be_active_same_school_student_and_class_member() -> None:
    asyncio.run(_test_student_must_be_active_same_school_student_and_class_member())


async def _test_student_must_be_active_same_school_student_and_class_member() -> None:
    db = SimpleNamespace(get=AsyncMock(), scalar=AsyncMock())
    valid = SimpleNamespace(school_id=1, role="student", is_active=True)

    for student in [
        None,
        SimpleNamespace(school_id=2, role="student", is_active=True),
        SimpleNamespace(school_id=1, role="teacher", is_active=True),
        SimpleNamespace(school_id=1, role="student", is_active=False),
    ]:
        db.get.return_value = student
        with pytest.raises(HTTPException) as exc:
            await _validate_student(db, 1, 10, 20)
        assert exc.value.status_code == 400

    db.get.return_value = valid
    db.scalar.return_value = None
    with pytest.raises(HTTPException) as exc:
        await _validate_student(db, 1, 10, 20)
    assert exc.value.status_code == 400

    db.scalar.return_value = 1
    await _validate_student(db, 1, 10, 20)


def test_work_type_must_be_active_and_school_scoped() -> None:
    asyncio.run(_test_work_type_must_be_active_and_school_scoped())


async def _test_work_type_must_be_active_and_school_scoped() -> None:
    db = SimpleNamespace(get=AsyncMock())
    assert await _work_type_weight(db, 1, None) == 1.0

    for work_type in [
        None,
        SimpleNamespace(school_id=2, is_active=True, weight=2.0),
        SimpleNamespace(school_id=1, is_active=False, weight=2.0),
    ]:
        db.get.return_value = work_type
        with pytest.raises(HTTPException) as exc:
            await _work_type_weight(db, 1, 5)
        assert exc.value.status_code == 400

    db.get.return_value = SimpleNamespace(school_id=1, is_active=True, weight=2.0)
    assert await _work_type_weight(db, 1, 5) == 2.0


def test_award_reports_actual_amount_applied_at_zero_floor() -> None:
    asyncio.run(_test_award_reports_actual_amount_applied_at_zero_floor())


async def _test_award_reports_actual_amount_applied_at_zero_floor() -> None:
    student = SimpleNamespace(balance=3)
    db = SimpleNamespace(scalar=AsyncMock(return_value=student), flush=AsyncMock())

    assert await _award(db, 20, -10) == (0, -3)
    assert student.balance == 0
    assert await _award(db, 20, 5) == (5, 5)
