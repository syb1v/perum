import asyncio

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.db import Base
from app.models import Organization, School, User
from app.models.academic import Class, ClassStudent
from app.models.journal import Transaction
from app.modules.teacher.service import bulk_balance


def test_bulk_balance_updates_only_active_same_school_students_and_audits() -> None:
    async def run():
        engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        session = async_sessionmaker(engine, expire_on_commit=False)()
        try:
            org = Organization(slug="test", name="Test")
            session.add(org)
            await session.flush()
            school = School(org_id=org.id, name="One")
            other_school = School(org_id=org.id, name="Two")
            session.add_all([school, other_school])
            await session.flush()
            teacher = User(role="teacher", school_id=school.id, login="teacher", password_hash="x", is_active=True)
            active = User(role="student", school_id=school.id, login="active", password_hash="x", is_active=True, balance=-5)
            inactive = User(role="student", school_id=school.id, login="inactive", password_hash="x", is_active=False, balance=2)
            foreign = User(role="student", school_id=other_school.id, login="foreign", password_hash="x", is_active=True, balance=3)
            session.add_all([teacher, active, inactive, foreign])
            await session.flush()
            cls = Class(school_id=school.id, name="1A", teacher_id=teacher.id)
            session.add(cls)
            await session.flush()
            session.add_all([
                ClassStudent(class_id=cls.id, student_id=active.id),
                ClassStudent(class_id=cls.id, student_id=inactive.id),
                ClassStudent(class_id=cls.id, student_id=foreign.id),
            ])
            await session.commit()

            result = await bulk_balance(
                session, school.id, teacher, [active.id, inactive.id, foreign.id], 10, "Олимпиада"
            )

            await session.refresh(active)
            await session.refresh(inactive)
            await session.refresh(foreign)
            transactions = (await session.execute(select(Transaction))).scalars().all()
            assert "1 учеников" in result["message"]
            assert active.balance == 10
            assert inactive.balance == 2
            assert foreign.balance == 3
            assert len(transactions) == 1
            assert transactions[0].amount == 10
            assert transactions[0].balance_after == 10
            assert transactions[0].reason == "Олимпиада"
            assert transactions[0].created_by == teacher.id
        finally:
            await session.close()
            await engine.dispose()

    asyncio.run(run())
