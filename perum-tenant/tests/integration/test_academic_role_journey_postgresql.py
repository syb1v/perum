import asyncio
import os

import pytest
from alembic import command
from alembic.config import Config
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.core.db import get_db
from app.core.security import hash_password
from app.main import app
from app.models import Organization, ParentStudent, School, User

POSTGRES_URL = os.getenv("TEST_POSTGRES_URL")
pytestmark = pytest.mark.skipif(
    not POSTGRES_URL,
    reason="TEST_POSTGRES_URL is required for PostgreSQL academic role journey gate",
)


async def reset_schema():
    engine = create_async_engine(POSTGRES_URL)
    async with engine.begin() as connection:
        await connection.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
        await connection.execute(text("CREATE SCHEMA public"))
    await engine.dispose()


def migrate(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", POSTGRES_URL)
    get_settings.cache_clear()
    config = Config("alembic.ini")
    config.set_main_option("sqlalchemy.url", POSTGRES_URL)
    command.upgrade(config, "head")


def test_academic_role_journey_postgresql(monkeypatch):
    asyncio.run(reset_schema())
    migrate(monkeypatch)

    async def run():
        engine = create_async_engine(POSTGRES_URL)
        sessions = async_sessionmaker(engine, expire_on_commit=False)

        async with sessions() as db:
            organization = Organization(slug="unknown", name="Launch V1 Org")
            db.add(organization)
            await db.flush()
            school = School(org_id=organization.id, name="Launch V1 School")
            db.add(school)
            await db.flush()
            db.add(
                User(
                    school_id=school.id,
                    role="school_admin",
                    login="launch-admin",
                    password_hash=hash_password("admin-password"),
                )
            )
            await db.commit()

        async def db_override():
            async with sessions() as db:
                yield db

        app.dependency_overrides[get_db] = db_override
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                async def login(login_name, password):
                    response = await client.post("/api/login", json={"login": login_name, "password": password})
                    assert response.status_code == 200, response.text
                    return {"Authorization": f"Bearer {response.json()['access_token']}"}

                admin_headers = await login("launch-admin", "admin-password")
                assert (await client.get("/api/admin/classes")).status_code == 401

                response = await client.post(
                    "/api/admin/academic-years",
                    headers=admin_headers,
                    json={
                        "name": "2026-2027",
                        "start_date": "2026-07-28T00:00:00.000Z",
                        "end_date": "2027-05-31T00:00:00.000Z",
                        "is_current": True,
                    },
                )
                assert response.status_code == 200, response.text
                academic_year_id = response.json()["id"]
                response = await client.get("/api/admin/academic-years", headers=admin_headers)
                assert response.status_code == 200, response.text
                assert response.json()["academic_years"][0]["start_date"] == "2026-07-28T00:00:00"

                response = await client.post(
                    "/api/admin/school-periods",
                    headers=admin_headers,
                    json={
                        "name": "I quarter",
                        "period_type": "quarter",
                        "start_date": "2026-07-28T00:00:00.000Z",
                        "end_date": "2026-10-30T00:00:00.000Z",
                        "is_active": True,
                        "academic_year_id": academic_year_id,
                        "target_grades": "[7]",
                    },
                )
                assert response.status_code == 200, response.text
                response = await client.get("/api/admin/school-periods", headers=admin_headers)
                assert response.status_code == 200, response.text
                assert response.json()["periods"][0]["start_date"] == "2026-07-28T00:00:00"

                response = await client.post(
                    "/api/admin/subjects",
                    headers=admin_headers,
                    json={"name": "Mathematics", "short_name": "Math"},
                )
                assert response.status_code == 200, response.text
                subject_id = response.json()["subject"]["id"]

                response = await client.post(
                    "/api/admin/subjects",
                    headers=admin_headers,
                    json={"name": "Physics", "short_name": "Physics"},
                )
                assert response.status_code == 200, response.text
                unassigned_subject_id = response.json()["subject"]["id"]

                response = await client.post(
                    "/api/admin/work-types",
                    headers=admin_headers,
                    json={"name": "Launch assessment", "weight": 1.5},
                )
                assert response.status_code == 200, response.text
                work_type_id = response.json()["id"]

                response = await client.post(
                    "/api/admin/classes",
                    headers=admin_headers,
                    json={"name": "7A", "grade_level": 7},
                )
                assert response.status_code == 200, response.text
                class_id = response.json()["class"]["id"]

                response = await client.post(
                    "/api/admin/register-users",
                    headers=admin_headers,
                    json={
                        "users": [
                            {"role": "teacher", "login": "launch-teacher", "password": "teacher-password", "first_name": "Ada", "last_name": "Teacher"},
                            {"role": "student", "login": "launch-student", "password": "student-password", "first_name": "Sam", "last_name": "Student", "class_id": class_id},
                            {"role": "student", "login": "launch-other", "password": "other-password", "first_name": "Una", "last_name": "Linked"},
                            {"role": "parent", "login": "launch-parent", "password": "parent-password", "first_name": "Pat", "last_name": "Parent"},
                        ]
                    },
                )
                assert response.status_code == 200, response.text
                assert all(row["created"] for row in response.json()["users"])

                response = await client.get("/api/admin/users", headers=admin_headers)
                assert response.status_code == 200, response.text
                users = {row["login"]: row for row in response.json()["users"]}
                teacher_id = users["launch-teacher"]["id"]
                student_id = users["launch-student"]["id"]
                other_student_id = users["launch-other"]["id"]
                parent_id = users["launch-parent"]["id"]

                response = await client.post(
                    "/api/admin/teacher-subjects",
                    headers=admin_headers,
                    json={"teacher_id": teacher_id, "subject_id": subject_id, "class_id": class_id},
                )
                assert response.status_code == 200, response.text

                response = await client.put(
                    f"/api/admin/users/{parent_id}/students",
                    headers=admin_headers,
                    json={"student_ids": [student_id]},
                )
                assert response.status_code == 200, response.text
                assert response.json() == {"parent_id": parent_id, "student_ids": [student_id]}

                response = await client.get(f"/api/admin/users/{parent_id}/students", headers=admin_headers)
                assert response.status_code == 200, response.text
                assert response.json() == {"parent_id": parent_id, "student_ids": [student_id]}

                teacher_headers = await login("launch-teacher", "teacher-password")
                student_headers = await login("launch-student", "student-password")
                parent_headers = await login("launch-parent", "parent-password")

                assert (await client.get("/api/admin/classes", headers=teacher_headers)).status_code == 403
                assert (await client.get("/api/journal/teacher/subjects", headers=student_headers)).status_code == 403
                assert (await client.get("/api/student/grades", headers=parent_headers)).status_code == 403

                denied_grade = {
                    "student_id": student_id,
                    "subject_id": unassigned_subject_id,
                    "class_id": class_id,
                    "grade_value": 5,
                    "work_type_id": work_type_id,
                    "lesson_date": "2026-08-02",
                    "comment": "must not be created",
                }
                response = await client.post("/api/journal/grades", headers=teacher_headers, json=denied_grade)
                assert response.status_code == 403, response.text

                grade_payload = {
                    "student_id": student_id,
                    "subject_id": subject_id,
                    "class_id": class_id,
                    "grade_value": 5,
                    "work_type_id": work_type_id,
                    "lesson_date": "2026-08-02",
                    "comment": "Launch V1 journey",
                }
                response = await client.post("/api/journal/grades", headers=teacher_headers, json=grade_payload)
                assert response.status_code == 200, response.text
                grade_id = response.json()["grade_id"]

                response = await client.get("/api/student/grades", headers=student_headers)
                assert response.status_code == 200, response.text
                assert response.json()["grades"] == [
                    {
                        "id": grade_id,
                        "value": 5,
                        "points": 38,
                        "weight": 1.5,
                        "date": "2026-08-02",
                        "type": "Launch assessment",
                        "comment": "Launch V1 journey",
                        "subject_id": subject_id,
                        "subject_name": "Mathematics",
                        "color": "#4CAF50",
                        "topic": None,
                    }
                ]

                response = await client.get("/api/parent/children", headers=parent_headers)
                assert response.status_code == 200, response.text
                assert [child["id"] for child in response.json()["children"]] == [student_id]

                response = await client.get(f"/api/parent/children/{student_id}/grades", headers=parent_headers)
                assert response.status_code == 200, response.text
                assert [grade["id"] for grade in response.json()["grades"]] == [grade_id]

                response = await client.get(f"/api/parent/children/{other_student_id}/grades", headers=parent_headers)
                assert response.status_code == 403, response.text

                async with sessions() as db:
                    assert len((await db.scalars(select(ParentStudent))).all()) == 1
        finally:
            app.dependency_overrides.pop(get_db, None)
            await engine.dispose()

    asyncio.run(run())
