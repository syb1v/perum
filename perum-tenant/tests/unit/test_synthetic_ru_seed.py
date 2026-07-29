import asyncio
import importlib.util
from pathlib import Path
from datetime import date, datetime

import pytest
from sqlalchemy import event, func, select
from sqlalchemy.dialects import postgresql
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.db import Base
from app.models import (
    AcademicYear, Class, ClassStudent, ExchangeLog, ExchangeSettings, FinalGrade, Grade, Investment, Organization, PageVisit, School,
    SchoolPeriod, Subject, SubjectAverage, SyntheticSeedRow, TeacherSubject, TenantMeta, TradingWindow, Transaction, User, UserInventory, WorkType,
)
from app.scripts.seed_synthetic_ru import (
    RANDOM_SEED, build_plan, default_reference_date, external_reference_counts,
    _owned_insert, rebuild_owned, seed_synthetic,
)
from app.services.points_calculator import calculate_points


async def _seed_db(current_year=False):
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")

    @event.listens_for(engine.sync_engine, "connect")
    def enable_foreign_keys(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as db:
        org = Organization(slug="synru-test", name="Тестовая организация")
        db.add(org)
        await db.flush()
        school = School(org_id=org.id, name="Существующая школа")
        db.add(school)
        await db.flush()
        subject = Subject(school_id=school.id, name="Математика")
        outsider = User(school_id=school.id, role="teacher", login="existing-teacher", first_name="До", last_name="Сида", password_hash="existing")
        db.add_all([subject, outsider, ExchangeSettings(school_id=school.id)])
        if current_year:
            year = AcademicYear(school_id=school.id, name="2025/2026", start_date=datetime(2025, 9, 1), end_date=datetime(2026, 5, 31), is_current=True)
            db.add(year)
            await db.flush()
            for name, start, end in [
                ("I четверть", datetime(2025, 9, 1), datetime(2025, 10, 26)),
                ("II четверть", datetime(2025, 11, 5), datetime(2025, 12, 28)),
                ("III четверть", datetime(2026, 1, 12), datetime(2026, 3, 22)),
                ("IV четверть", datetime(2026, 4, 1), datetime(2026, 5, 31)),
            ]:
                db.add(SchoolPeriod(academic_year_id=year.id, name=name, period_type="quarter", start_date=start, end_date=end, is_active=False))
        await db.commit()
        yield db, school.id, subject.id, outsider.id
    await engine.dispose()


def test_medium_plan_is_deterministic_and_bounded():
    reference = date(2026, 5, 22)
    first = build_plan("medium", reference)
    assert first == build_plan("medium", reference)
    assert first["random_seed"] == RANDOM_SEED
    assert first["reference_date"] == "2026-05-22"
    assert (first["classes"], first["students"], first["teachers"], first["parents"], first["admins"]) == (24, 624, 60, 450, 0)
    assert first["users"] == 1134
    assert first["grades_total"] == 94848
    assert first["grades_total"] <= 120_000
    assert default_reference_date(date(2026, 7, 29)) == reference


def test_security_rebuild_singletons_ledger_and_dates():
    async def run():
        async for db, school_id, subject_id, outsider_id in _seed_db(current_year=True):
            result = await seed_synthetic(db, school_id, "small", "persona-hash", reference_date=date(2026, 5, 22), activity_date=date(2026, 7, 29))
            users = (await db.scalars(select(User).where(User.login.like("synru%")))).all()
            personas = set(result["test_logins"].values())
            assert set(result["test_logins"]) == {"teacher", "student", "parent"}
            assert sum(user.is_active for user in users) == 3
            assert all(user.must_change_password for user in users)
            assert sum(user.password_hash == "persona-hash" for user in users) == 3
            assert all(user.password_hash != "persona-hash" for user in users if user.login not in personas)
            assert await db.scalar(select(func.count()).select_from(AcademicYear)) == 1
            assert await db.scalar(select(func.count()).select_from(ExchangeSettings)) == 1
            assert await db.get(Subject, subject_id) is not None

            numeric = (await db.scalars(select(Grade).where(Grade.grade_value.is_not(None)))).all()
            subject = await db.get(Subject, numeric[0].subject_id)
            school_class = await db.get(Class, numeric[0].class_id)
            assert numeric[0].value == calculate_points(numeric[0].grade_value, subject.category, numeric[0].weight, subject.profile_weight, subject.is_profile_track, bool(school_class.is_profile))
            for student in [user for user in users if user.role == "student"]:
                ledger = (await db.scalars(select(Transaction).where(Transaction.user_id == student.id).order_by(Transaction.created_at, Transaction.id))).all()
                running = 0
                for row in ledger:
                    running += row.amount
                    assert running >= 0
                    assert row.balance_after == running
                assert student.balance == running
            assert all(row.academic_year == 2025 for row in (await db.scalars(select(Investment))).all())
            assert {row.type for row in (await db.scalars(select(Transaction).where(Transaction.type.like("exchange_%")))).all()} == {"exchange_invest", "exchange_result"}
            purchases = (await db.scalars(select(Transaction).where(Transaction.type == "purchase"))).all()
            assert purchases
            assert all([(await db.get(UserInventory, row.related_id)) is not None for row in purchases])
            assert max(row.created_at.date() for row in (await db.scalars(select(Investment))).all()) <= date(2026, 5, 22)
            assert max(row.closes_at.date() for row in (await db.scalars(select(TradingWindow))).all()) <= date(2026, 5, 22)
            assert max(row.created_at.date() for row in (await db.scalars(select(FinalGrade))).all()) <= date(2026, 5, 22)
            assert max(row.created_at.date() for row in (await db.scalars(select(PageVisit))).all()) <= date(2026, 7, 29)
            averages = (await db.scalars(select(SubjectAverage))).all()
            for average in averages:
                matching = [grade.grade_value for grade in numeric if grade.class_id == average.class_id and grade.subject_id == average.subject_id and grade.lesson_date.isocalendar().week == average.week_number]
                assert matching
                assert average.average_score == round(sum(matching) / len(matching), 2)
            investments = (await db.scalars(select(Investment))).all()
            logs = (await db.scalars(select(ExchangeLog))).all()
            for investment in investments:
                class_id = await db.scalar(select(ClassStudent.class_id).where(ClassStudent.student_id == investment.user_id))
                assert await db.scalar(select(TeacherSubject.id).where(TeacherSubject.class_id == class_id, TeacherSubject.subject_id == investment.subject_id))
                point = await db.scalar(select(SubjectAverage).where(SubjectAverage.class_id == class_id, SubjectAverage.subject_id == investment.subject_id, SubjectAverage.week_number == investment.week_number, SubjectAverage.academic_year == investment.academic_year))
                assert point is not None
                assert investment.index_change == point.index_change
                assert investment.result_amount == int(investment.amount * (1 + point.index_change / 100))
                assert any(log.user_id == investment.user_id and log.subject_id == investment.subject_id and log.price == point.average_score for log in logs)

            with pytest.raises(RuntimeError, match="--rebuild"):
                    await seed_synthetic(db, school_id, "small", "persona-hash", reference_date=date(2026, 5, 22), activity_date=date(2026, 7, 29))
            deleted = await rebuild_owned(db, school_id)
            assert deleted["users"] > 0
            assert await db.get(User, outsider_id) is not None
            assert await db.get(Subject, subject_id) is not None
    asyncio.run(run())


def test_external_reference_and_ownership_drift_fail_closed():
    async def run():
        async for db, school_id, _, _ in _seed_db():
            result = await seed_synthetic(db, school_id, "small", "persona-hash", reference_date=date(2026, 5, 22))
            synthetic_student = await db.scalar(select(User).where(User.login == result["test_logins"]["student"]))
            db.add(PageVisit(school_id=school_id, session_identifier="external", user_id=synthetic_student.id, path="/external"))
            await db.commit()
            with pytest.raises(RuntimeError, match="page_visits=1"):
                await rebuild_owned(db, school_id)
            await db.delete(await db.scalar(select(PageVisit).where(PageVisit.session_identifier == "external")))
            await db.commit()
            marker = await db.get(TenantMeta, f"synru:{school_id}")
            await db.delete(marker)
            await db.commit()
            with pytest.raises(RuntimeError, match="ownership rows exist without marker"):
                await seed_synthetic(db, school_id, "small", "persona-hash", reference_date=date(2026, 5, 22))
    asyncio.run(run())


def test_singleton_refusal_happens_before_accounts():
    async def run():
        async for db, school_id, _, _ in _seed_db():
            db.add(ExchangeSettings(school_id=school_id))
            await db.commit()
            with pytest.raises(RuntimeError, match="ambiguous exchange settings"):
                await seed_synthetic(db, school_id, "small", "persona-hash", reference_date=date(2026, 5, 22))
            assert await db.scalar(select(func.count()).select_from(User).where(User.login.like("synru%"))) == 0
            assert await db.get(TenantMeta, f"synru:{school_id}") is None
    asyncio.run(run())


def test_failed_build_cleans_quarantined_accounts(monkeypatch):
    async def run():
        async for db, school_id, _, _ in _seed_db():
            original = _owned_insert

            async def fail_after_users(session, sid, model, rows):
                ids = await original(session, sid, model, rows)
                if model is User:
                    accounts = (await session.scalars(select(User).where(User.login.like("synru%")))).all()
                    assert accounts and all(not user.is_active for user in accounts)
                    raise RuntimeError("injected build failure")
                return ids

            monkeypatch.setattr("app.scripts.seed_synthetic_ru._owned_insert", fail_after_users)
            with pytest.raises(RuntimeError, match="injected build failure"):
                await seed_synthetic(db, school_id, "small", "persona-hash", reference_date=date(2026, 5, 22))
            assert await db.scalar(select(func.count()).select_from(User).where(User.login.like("synru%"))) == 0
            assert await db.get(TenantMeta, f"synru:{school_id}") is None
    asyncio.run(run())


def test_postgresql_advisory_lock_statement_is_compatible():
    statement = select(func.pg_try_advisory_lock(0x53594E52, 42))
    compiled = str(statement.compile(dialect=postgresql.dialect()))
    assert "pg_try_advisory_lock" in compiled
    assert "pg_advisory_unlock" in str(select(func.pg_advisory_unlock(0x53594E52, 42)).compile(dialect=postgresql.dialect()))


def test_medium_grade_preflight_uses_constant_size_ownership_exists():
    ownership = select(SyntheticSeedRow.id).where(
        SyntheticSeedRow.namespace == "synru",
        SyntheticSeedRow.school_id == 42,
        SyntheticSeedRow.table_name == "grades",
        SyntheticSeedRow.row_id == Grade.id,
    ).exists()
    compiled = ownership.compile(dialect=postgresql.dialect())
    assert len(compiled.params) == 3
    assert "synthetic_seed_rows" in str(compiled)


def test_default_population_keeps_every_account_inactive():
    async def run():
        async for db, school_id, _, _ in _seed_db():
            result = await seed_synthetic(db, school_id, "small", reference_date=date(2026, 5, 22), activity_date=date(2026, 7, 29))
            users = (await db.scalars(select(User).where(User.login.like("synru%")))).all()
            assert users and all(not user.is_active and user.must_change_password for user in users)
            assert "test_logins" not in result
            assert result["account_status"] == "all synthetic accounts inactive"
    asyncio.run(run())


def test_failure_does_not_cleanup_foreign_run_marker(monkeypatch):
    async def run():
        async for db, school_id, _, _ in _seed_db():
            original = _owned_insert

            async def replace_marker_then_fail(session, sid, model, rows):
                ids = await original(session, sid, model, rows)
                if model is User:
                    marker = await session.get(TenantMeta, f"synru:{sid}")
                    marker.value = '{"status":"building","run_token":"another-run"}'
                    await session.commit()
                    raise RuntimeError("runner lost ownership")
                return ids

            monkeypatch.setattr("app.scripts.seed_synthetic_ru._owned_insert", replace_marker_then_fail)
            with pytest.raises(RuntimeError, match="lost ownership"):
                await seed_synthetic(db, school_id, "small", activity_date=date(2026, 7, 29), reference_date=date(2026, 5, 22))
            marker = await db.get(TenantMeta, f"synru:{school_id}")
            assert "another-run" in marker.value
            accounts = (await db.scalars(select(User).where(User.login.like("synru%")))).all()
            assert accounts and all(not account.is_active for account in accounts)
    asyncio.run(run())


def test_reused_work_type_custom_weight_and_inactive_refusal():
    async def custom_weight():
        async for db, school_id, _, _ in _seed_db():
            db.add(WorkType(school_id=school_id, name="Контрольная работа", weight=2.75, is_active=True))
            await db.commit()
            await seed_synthetic(db, school_id, "small", reference_date=date(2026, 5, 22), activity_date=date(2026, 7, 29))
            rows = (await db.scalars(select(Grade).join(WorkType, WorkType.id == Grade.work_type_id).where(WorkType.name == "Контрольная работа"))).all()
            assert rows and all(row.weight == 2.75 for row in rows)
            grade = rows[0]
            subject = await db.get(Subject, grade.subject_id)
            school_class = await db.get(Class, grade.class_id)
            assert grade.value == calculate_points(grade.grade_value, subject.category, 2.75, subject.profile_weight, subject.is_profile_track, bool(school_class.is_profile))

    async def inactive_refusal():
        async for db, school_id, _, _ in _seed_db():
            db.add(WorkType(school_id=school_id, name="Контрольная работа", weight=2.0, is_active=False))
            await db.commit()
            with pytest.raises(RuntimeError, match="required work types are inactive"):
                await seed_synthetic(db, school_id, "small", reference_date=date(2026, 5, 22), activity_date=date(2026, 7, 29))
            assert await db.scalar(select(func.count()).select_from(User).where(User.login.like("synru%"))) == 0
            assert await db.get(TenantMeta, f"synru:{school_id}") is None

    asyncio.run(custom_weight())
    asyncio.run(inactive_refusal())


def test_ownership_migration_downgrade_fails_closed(monkeypatch):
    path = Path(__file__).parents[2] / "migrations/versions/20260729_0100_tenant_0039_synthetic_seed_ownership.py"
    spec = importlib.util.spec_from_file_location("synru_ownership_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)

    class Bind:
        def __init__(self, counts):
            self.counts = iter(counts)

        def scalar(self, _):
            return next(self.counts)

    monkeypatch.setattr(migration.op, "get_bind", lambda: Bind([1, 0]))
    with pytest.raises(RuntimeError, match="ownership_rows=1"):
        migration.downgrade()
    monkeypatch.setattr(migration.op, "get_bind", lambda: Bind([0, 1]))
    with pytest.raises(RuntimeError, match="markers=1"):
        migration.downgrade()
