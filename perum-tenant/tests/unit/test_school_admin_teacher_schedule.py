import asyncio
import json
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.core.roles import TEACHER
from app.core.deps import require_admin
from app.modules.school_admin.schemas import AdminTeacherScheduleOut
from app.modules.school_admin.service_teachers import get_teacher_schedule


class Result:
    def __init__(self, rows):
        self.rows = rows

    def all(self):
        return self.rows


class Database:
    def __init__(self, teacher, rows=()):
        self.teacher = teacher
        self.rows = rows

    async def scalar(self, statement):
        if not self.teacher:
            return None
        if self.teacher.id != 7 or self.teacher.school_id != 1 or self.teacher.role != TEACHER or not self.teacher.is_active:
            return None
        return self.teacher

    async def execute(self, statement):
        return Result(self.rows)


def teacher(**overrides):
    values = {"id": 7, "school_id": 1, "role": TEACHER, "is_active": True, "first_name": "Анна", "last_name": "Иванова", "login": "hidden"}
    values.update(overrides)
    return SimpleNamespace(**values)


def lesson(**overrides):
    values = {"id": 11, "school_id": 1, "teacher_id": 7, "day_of_week": 1, "lesson_number": 2, "subject_id": 3, "class_id": 4, "room": None}
    values.update(overrides)
    return SimpleNamespace(**values)


def test_schedule_has_six_days_ordered_lessons_and_nullable_display_fields() -> None:
    async def run() -> None:
        rows = [(lesson(id=12, lesson_number=1), None, "7 А"), (lesson(), "Математика", None)]
        payload = await get_teacher_schedule(Database(teacher(), rows), 1, 7)
        result = AdminTeacherScheduleOut.model_validate(payload, strict=True)
        assert list(result.schedule) == [0, 1, 2, 3, 4, 5]
        assert [item.lesson_number for item in result.schedule[1].root] == [1, 2]
        assert result.schedule[0].root == []
        assert result.schedule[1].root[0].subject_name is None
        assert result.schedule[1].root[1].class_name is None
        assert set(payload) == {"teacher_id", "teacher_name", "schedule"}

    asyncio.run(run())


def test_schedule_nameless_teacher_uses_neutral_name_without_login() -> None:
    async def run() -> None:
        payload = await get_teacher_schedule(Database(teacher(first_name=None, last_name=None, login="secret-login@example.com")), 1, 7)
        encoded = json.dumps(payload, ensure_ascii=False)
        assert payload["teacher_name"] == "Учитель 7"
        assert "secret-login" not in encoded

    asyncio.run(run())


def test_unknown_or_out_of_scope_teacher_is_not_queried_for_schedule() -> None:
    async def run() -> None:
        database = Database(None)
        with pytest.raises(HTTPException) as error:
            await get_teacher_schedule(database, 1, 7)
        assert error.value.status_code == 404

    asyncio.run(run())


@pytest.mark.parametrize("field", ["email", "phone", "login", "student_ids"])
def test_schedule_contract_rejects_sensitive_fields(field: str) -> None:
    payload = {"teacher_id": 7, "teacher_name": "Иванова Анна", "schedule": {day: [] for day in range(6)}, field: "secret"}
    with pytest.raises(ValidationError):
        AdminTeacherScheduleOut.model_validate(payload, strict=True)


def test_schedule_contract_requires_authoritative_six_day_shape() -> None:
    with pytest.raises(ValidationError):
        AdminTeacherScheduleOut.model_validate({"teacher_id": 7, "teacher_name": "Иванова Анна", "schedule": {0: []}}, strict=True)


def test_schedule_role_gate_allows_only_school_admin_and_director() -> None:
    async def run() -> None:
        for role in ("school_admin", "director"):
            user = SimpleNamespace(role=role)
            assert await require_admin(user) is user
        with pytest.raises(HTTPException) as error:
            await require_admin(SimpleNamespace(role="teacher"))
        assert error.value.status_code == 403

    asyncio.run(run())


@pytest.mark.parametrize("candidate", [
    None,
    teacher(school_id=None),
    teacher(school_id=2),
    teacher(is_active=False),
    teacher(role="student"),
])
def test_lookup_rejects_missing_null_school_foreign_inactive_and_non_teacher(candidate) -> None:
    async def run() -> None:
        with pytest.raises(HTTPException) as error:
            await get_teacher_schedule(Database(candidate), 1, 7)
        assert error.value.status_code == 404

    asyncio.run(run())
