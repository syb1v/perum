import asyncio
import json
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.core.deps import require_admin
from app.modules.school_admin.schemas import AdminClassScheduleReadOut
from app.modules.school_admin.service_classes import get_class_schedule_read


class Result:
    def __init__(self, rows):
        self.rows = rows

    def scalar_one_or_none(self):
        return self.rows

    def all(self):
        return self.rows


class Database:
    def __init__(self, class_, rows=()):
        self.class_ = class_
        self.rows = rows
        self.executions = 0

    async def execute(self, statement):
        self.executions += 1
        if self.executions == 1:
            candidate = self.class_
            if not candidate or candidate.id != 4 or candidate.school_id != 1:
                candidate = None
            return Result(candidate)
        return Result(self.rows)


def class_(**overrides):
    values = {"id": 4, "school_id": 1, "name": "7 А"}
    values.update(overrides)
    return SimpleNamespace(**values)


def lesson(**overrides):
    values = {"id": 11, "school_id": 1, "class_id": 4, "day_of_week": 1, "lesson_number": 2, "room": None}
    values.update(overrides)
    return SimpleNamespace(**values)


def teacher(**overrides):
    values = {"id": 7, "school_id": 1, "role": "teacher", "is_active": True, "first_name": "Анна", "last_name": "Иванова", "login": "hidden@example.com"}
    values.update(overrides)
    return SimpleNamespace(**values)


def test_read_projection_is_six_day_ordered_closed_and_privacy_minimized() -> None:
    async def run() -> None:
        rows = [(lesson(id=12, lesson_number=1), None, None), (lesson(), "Математика", teacher())]
        payload = await get_class_schedule_read(Database(class_(), rows), 1, 4)
        result = AdminClassScheduleReadOut.model_validate(payload, strict=True)
        assert list(result.schedule) == [0, 1, 2, 3, 4, 5]
        assert [item.lesson_number for item in result.schedule[1].root] == [1, 2]
        assert result.schedule[0].root == []
        assert result.schedule[1].root[0].subject_display is None
        assert result.schedule[1].root[0].teacher_display is None
        assert result.schedule[1].root[1].teacher_display == "Иванова Анна"
        assert set(payload) == {"class_name", "schedule"}
        assert set(payload["schedule"][1][0]) == {"lesson_number", "subject_display", "teacher_display", "room"}
        encoded = json.dumps(payload, ensure_ascii=False)
        for forbidden in ("student_ids", "subject_id", "teacher_id", "class_id", "schedule_id", "login", "hidden@example.com", "groups"):
            assert forbidden not in encoded

    asyncio.run(run())


def test_read_projection_uses_neutral_teacher_fallback_without_login() -> None:
    async def run() -> None:
        payload = await get_class_schedule_read(Database(class_(), [(lesson(), "Физика", teacher(id=987654, first_name=None, last_name=None))]), 1, 4)
        encoded = json.dumps(payload, ensure_ascii=False)
        assert payload["schedule"][1][0]["teacher_display"] == "Учитель"
        assert "987654" not in encoded
        assert "hidden@example.com" not in encoded

    asyncio.run(run())


@pytest.mark.parametrize("candidate", [None, class_(school_id=None), class_(school_id=2)])
def test_read_projection_rejects_missing_null_school_and_foreign_class(candidate) -> None:
    async def run() -> None:
        database = Database(candidate)
        with pytest.raises(HTTPException) as error:
            await get_class_schedule_read(database, 1, 4)
        assert error.value.status_code == 404
        assert error.value.detail == "Класс не найден"
        assert database.executions == 1

    asyncio.run(run())


def test_read_role_gate_allows_only_school_admin_and_director() -> None:
    async def run() -> None:
        for role in ("school_admin", "director"):
            user = SimpleNamespace(role=role)
            assert await require_admin(user) is user
        with pytest.raises(HTTPException) as error:
            await require_admin(SimpleNamespace(role="teacher"))
        assert error.value.status_code == 403

    asyncio.run(run())


@pytest.mark.parametrize("field", ["id", "class_id", "subject_id", "teacher_id", "student_ids", "groups", "login", "created_at"])
def test_read_contract_rejects_forbidden_fields(field: str) -> None:
    payload = {"class_name": "7 А", "schedule": {day: [] for day in range(6)}, field: None}
    with pytest.raises(ValidationError):
        AdminClassScheduleReadOut.model_validate(payload, strict=True)


def test_read_contract_requires_exact_six_days() -> None:
    with pytest.raises(ValidationError):
        AdminClassScheduleReadOut.model_validate({"class_name": "7 А", "schedule": {0: []}}, strict=True)


@pytest.mark.parametrize("numbers", [[2, 1], [1, 1], [0], [9]])
def test_read_contract_rejects_unsorted_duplicate_and_out_of_range_lessons(numbers) -> None:
    lessons = [
        {"lesson_number": number, "subject_display": None, "teacher_display": None, "room": None}
        for number in numbers
    ]
    with pytest.raises(ValidationError):
        AdminClassScheduleReadOut.model_validate(
            {"class_name": "7 А", "schedule": {**{day: [] for day in range(6)}, 1: lessons}},
            strict=True,
        )
