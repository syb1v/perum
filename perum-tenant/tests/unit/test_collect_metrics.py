"""R3 (tenant): интеграционный тест агрегации collect_metrics на in-memory sqlite.
Проверяет точные значения (роли, avg_grade с NULL, active_24h distinct/свежесть,
балансы), пустую школу и отсутствие PII в снимке. aiosqlite — dev-зависимость."""

import asyncio
from datetime import datetime, timedelta

import pytest

pytest.importorskip("aiosqlite")

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models as M
from app.core.db import Base
from app.core.roles import DIRECTOR, PARENT, SCHOOL_ADMIN, STUDENT, TEACHER
from app.telemetry import collect_metrics

EXPECTED_KEYS = {
    "users_total", "students", "teachers", "parents", "admins",
    "grades_total", "avg_grade", "active_24h", "balance_total",
}


async def _engine():
    eng = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    return eng


async def _seed_and_collect():
    eng = await _engine()
    sm = async_sessionmaker(eng, class_=AsyncSession, expire_on_commit=False)
    async with sm() as db:
        sch = M.School(org_id=1, name="S")
        db.add(sch)
        await db.flush()
        sid = sch.id

        def add_users(role, n, bal=0):
            out = []
            for i in range(n):
                u = M.User(school_id=sid, role=role, login=f"{role}-{i}", password_hash="x", balance=bal)
                db.add(u)
                out.append(u)
            return out

        students = add_users(STUDENT, 3, bal=100)
        add_users(TEACHER, 2)
        add_users(PARENT, 1)
        add_users(SCHOOL_ADMIN, 1)
        add_users(DIRECTOR, 1)
        await db.flush()

        # Оценки: 4 и 5 + одна NULL (в avg не входит). FK class/subject в sqlite не enforce.
        for gv in (4, 5, None):
            db.add(M.Grade(school_id=sid, student_id=students[0].id, class_id=1, subject_id=1, grade_value=gv))

        now = datetime.utcnow()
        # active_24h = distinct user_id за 24ч, не-NULL: student0 (дубль схлопывается) + student1 = 2.
        db.add(M.PageVisit(school_id=sid, session_identifier="a", user_id=students[0].id, path="/", created_at=now))
        db.add(M.PageVisit(school_id=sid, session_identifier="a", user_id=students[0].id, path="/x", created_at=now))
        db.add(M.PageVisit(school_id=sid, session_identifier="b", user_id=students[1].id, path="/", created_at=now))
        db.add(M.PageVisit(school_id=sid, session_identifier="c", user_id=students[2].id, path="/", created_at=now - timedelta(hours=48)))
        db.add(M.PageVisit(school_id=sid, session_identifier="d", user_id=None, path="/", created_at=now))
        await db.commit()
        return await collect_metrics(db, sid)


def test_collect_metrics_exact_values():
    m = asyncio.run(_seed_and_collect())
    assert m["students"] == 3
    assert m["teachers"] == 2
    assert m["parents"] == 1
    assert m["admins"] == 2  # school_admin + director
    assert m["users_total"] == 8
    assert m["grades_total"] == 3
    assert m["avg_grade"] == 4.5  # (4+5)/2, NULL исключён
    assert m["active_24h"] == 2  # student0 (дубль) + student1; старый и анонимный не в счёт
    assert m["balance_total"] == 300  # 3 ученика * 100
    # Никаких PII — только агрегаты.
    assert set(m.keys()) == EXPECTED_KEYS


async def _empty_school():
    eng = await _engine()
    sm = async_sessionmaker(eng, class_=AsyncSession, expire_on_commit=False)
    async with sm() as db:
        sch = M.School(org_id=1, name="Empty")
        db.add(sch)
        await db.commit()
        return await collect_metrics(db, sch.id)


def test_collect_metrics_empty_school():
    m = asyncio.run(_empty_school())
    assert m["users_total"] == 0 and m["students"] == 0 and m["grades_total"] == 0
    assert m["avg_grade"] is None
    assert m["active_24h"] == 0 and m["balance_total"] == 0
    assert set(m.keys()) == EXPECTED_KEYS
