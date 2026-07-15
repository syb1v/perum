import asyncio

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.db import Base, get_db
from app.core.deps import get_current_user
from app.models import IdempotencyReceipt, Organization, School, User, UserPreferences
from app.modules.user_preferences.router import router


async def setup_app():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as db:
        organization = Organization(slug="test", name="Test")
        db.add(organization)
        await db.flush()
        school = School(org_id=organization.id, name="School")
        db.add(school)
        await db.flush()
        users = [
            User(school_id=school.id, role="student", login=f"user-{index}", password_hash="x")
            for index in range(2)
        ]
        db.add_all(users)
        await db.commit()
    app = FastAPI()
    app.include_router(router, prefix="/api")

    async def db_override():
        async with sessions() as db:
            yield db

    current_user_id = {"value": users[0].id}

    async def user_override():
        async with sessions() as db:
            return await db.get(User, current_user_id["value"])

    app.dependency_overrides[get_db] = db_override
    app.dependency_overrides[get_current_user] = user_override
    return engine, sessions, app, users, current_user_id


def test_preferences_contract_replay_conflicts_noop_and_isolation():
    async def run():
        engine, sessions, app, users, current_user_id = await setup_app()
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                assert (await client.get("/api/user/preferences")).headers["etag"] == '"1"'
                assert (await client.patch("/api/user/preferences", json={"push_preview_enabled": True})).status_code == 400
                missing_match = await client.patch(
                    "/api/user/preferences",
                    headers={"Idempotency-Key": "missing-match"},
                    json={"push_preview_enabled": True},
                )
                assert missing_match.status_code == 428
                assert missing_match.json()["error"]["code"] == "IF_MATCH_REQUIRED"
                invalid = await client.patch(
                    "/api/user/preferences",
                    headers={"Idempotency-Key": "invalid", "If-Match": '"1"'},
                    json={"push_preview_enabled": True, "unknown": 1},
                )
                assert invalid.status_code == 422
                changed = await client.patch(
                    "/api/user/preferences",
                    headers={"Idempotency-Key": "change", "If-Match": '"1"'},
                    json={"push_preview_enabled": True},
                )
                assert changed.status_code == 200
                assert changed.headers["etag"] == '"2"'
                assert changed.json()["version"] == 2
                replay = await client.patch(
                    "/api/user/preferences",
                    headers={"Idempotency-Key": "change", "If-Match": '"1"'},
                    json={"push_preview_enabled": True},
                )
                assert replay.content == changed.content
                assert replay.headers["etag"] == changed.headers["etag"]
                reused = await client.patch(
                    "/api/user/preferences",
                    headers={"Idempotency-Key": "change", "If-Match": '"2"'},
                    json={"push_preview_enabled": False},
                )
                assert reused.status_code == 409
                assert reused.json()["error"]["code"] == "IDEMPOTENCY_KEY_REUSED"
                stale = await client.patch(
                    "/api/user/preferences",
                    headers={"Idempotency-Key": "stale", "If-Match": '"1"'},
                    json={"push_preview_enabled": False},
                )
                assert stale.status_code == 412
                assert stale.json()["error"]["code"] == "VERSION_CONFLICT"
                assert stale.json()["error"]["details"]["current"]["version"] == 2
                assert stale.json()["error"]["details"]["etag"] == '"2"'
                assert stale.headers["etag"] == '"2"'
                noop = await client.patch(
                    "/api/user/preferences",
                    headers={"Idempotency-Key": "noop", "If-Match": '"2"'},
                    json={"push_preview_enabled": True},
                )
                assert noop.json()["version"] == 2
                current_user_id["value"] = users[1].id
                isolated = await client.get("/api/user/preferences")
                assert isolated.json()["push_preview_enabled"] is False
                assert isolated.headers["etag"] == '"1"'
            async with sessions() as db:
                assert len((await db.scalars(select(UserPreferences))).all()) == 2
                assert len((await db.scalars(select(IdempotencyReceipt))).all()) == 2
        finally:
            await engine.dispose()

    asyncio.run(run())


def test_preferences_requires_authentication():
    async def run():
        app = FastAPI()
        app.include_router(router, prefix="/api")
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/user/preferences")
            assert response.status_code == 401
            assert response.headers["www-authenticate"] == "Bearer"

    asyncio.run(run())
