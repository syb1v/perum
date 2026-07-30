import asyncio
from datetime import datetime, timedelta

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.db import Base, get_db
from app.core.deps import get_current_user
from app.models import Organization, School, Transaction, User
from app.modules.student.router import router
from app.modules.student.schemas import StudentRecentTransactionOut


async def setup_app():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as db:
        organization = Organization(slug="test", name="Test")
        db.add(organization)
        await db.flush()
        schools = [School(org_id=organization.id, name=f"School {index}") for index in range(2)]
        db.add_all(schools)
        await db.flush()
        users = [
            User(school_id=schools[0].id, role="student", login="student", password_hash="x"),
            User(school_id=schools[0].id, role="student", login="other", password_hash="x"),
            User(school_id=schools[0].id, role="teacher", login="teacher", password_hash="x"),
        ]
        db.add_all(users)
        await db.flush()
        now = datetime(2026, 7, 30, 12, 0)
        db.add_all([
            Transaction(school_id=schools[0].id, user_id=users[0].id, type="grade", amount=index, balance_after=index, reason=f"row-{index}", created_at=now + timedelta(minutes=index))
            for index in range(55)
        ])
        db.add(Transaction(school_id=schools[0].id, user_id=users[1].id, type="manual", amount=999, balance_after=999, reason="other user", created_at=now + timedelta(days=1)))
        db.add(Transaction(school_id=schools[1].id, user_id=users[0].id, type="manual", amount=888, balance_after=888, reason="other school", created_at=now + timedelta(days=2)))
        db.add(Transaction(school_id=None, user_id=users[0].id, type="manual", amount=777, balance_after=777, reason="legacy row", created_at=now + timedelta(days=3)))
        await db.commit()
    app = FastAPI()
    app.include_router(router, prefix="/api/student")

    async def db_override():
        async with sessions() as db:
            yield db

    current_user_id = {"value": users[0].id}

    async def user_override():
        async with sessions() as db:
            return await db.get(User, current_user_id["value"])

    app.dependency_overrides[get_db] = db_override
    app.dependency_overrides[get_current_user] = user_override
    return engine, app, users, current_user_id


def test_student_transactions_are_scoped_bounded_ordered_and_closed():
    async def run():
        engine, app, users, current_user_id = await setup_app()
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                response = await client.get("/api/student/transactions/recent?limit=50")
                assert response.status_code == 200
                body = response.json()
                assert len(body) == 50
                assert [row["reason"] for row in body[:2]] == ["legacy row", "row-54"]
                assert set(body[0]) == {"id", "type", "amount", "balance_after", "reason", "created_at"}
                assert body[0]["created_at"].endswith("Z")
                assert all(row["amount"] not in {888, 999} for row in body)
                assert (await client.get("/api/student/transactions/recent?limit=51")).status_code == 422
                current_user_id["value"] = users[2].id
                assert (await client.get("/api/student/transactions/recent")).status_code == 403
        finally:
            await engine.dispose()

    asyncio.run(run())
    try:
        StudentRecentTransactionOut.model_validate({"id": 1, "type": "grade", "amount": 1, "balance_after": 1, "reason": None, "created_at": "2026-07-30T12:00:00", "user_id": 7})
    except ValidationError:
        pass
    else:
        raise AssertionError("closed response DTO accepted an unrelated identifier")
