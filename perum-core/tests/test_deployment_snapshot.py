from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.db import get_db
from app.main import app
from app.models import SchoolDeploymentSnapshot, SchoolMetric, SchoolSecret
from app.routers import telemetry


class _Result:
    def __init__(self, school):
        self.school = school

    def scalar_one_or_none(self):
        return self.school


class _DB:
    def __init__(self, school, snapshot=None):
        self.school = school
        self.snapshot = snapshot
        self.added = []
        self.committed = False

    async def execute(self, statement):
        if "FROM schools" in str(statement) and "schools.slug" not in str(statement):
            return _Result(self.school.id)
        return _Result(self.school)

    async def get(self, model, key):
        if model is SchoolSecret:
            return SimpleNamespace(telemetry_token="safe-token")
        if model is SchoolDeploymentSnapshot:
            return self.snapshot
        if model is SchoolMetric:
            return SimpleNamespace()
        return None

    def add(self, value):
        self.added.append(value)
        if isinstance(value, SchoolDeploymentSnapshot):
            self.snapshot = value

    async def commit(self):
        self.committed = True


def _request(db, school_id, release_image, observed_at=None):
    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    body = {
        "slug": "school",
        "metrics": {},
        "deployment_snapshot": {
            "schema_version": 1,
            "school_id": str(school_id),
            "release_image": release_image,
            "scanner_ready": False,
            "realtime_ready": True,
            "push_registration_ready": True,
            "push_delivery_ready": False,
            "social_ready": True,
            "observed_at": (observed_at or datetime.now(timezone.utc)).isoformat(),
        },
    }
    try:
        return TestClient(app).post(
            "/api/telemetry", json=body, headers={"X-Telemetry-Token": "safe-token"}
        )
    finally:
        app.dependency_overrides.clear()
        telemetry._hits.clear()


def test_authenticated_snapshot_is_stored():
    school_id = uuid4()
    db = _DB(SimpleNamespace(id=7, public_id=school_id, release_tag="tenant:release-a"))

    response = _request(db, school_id, "tenant:release-a")

    assert response.status_code == 200
    assert db.committed is True
    assert db.snapshot.school_id == 7
    assert db.snapshot.scanner_ready is False
    assert db.snapshot.social_ready is True


def test_snapshot_observation_is_normalized_to_utc():
    school_id = uuid4()
    db = _DB(SimpleNamespace(id=7, public_id=school_id, release_tag="tenant:release-a"))
    observed_at = datetime.now(timezone(timedelta(hours=3)))

    response = _request(db, school_id, "tenant:release-a", observed_at)

    assert response.status_code == 200
    assert db.snapshot.observed_at == observed_at.astimezone(timezone.utc).replace(tzinfo=None)


def test_snapshot_rejects_school_and_release_mismatch():
    school_id = uuid4()
    school = SimpleNamespace(id=7, public_id=school_id, release_tag="tenant:release-a")

    wrong_school = _request(_DB(school), uuid4(), "tenant:release-a")
    wrong_release = _request(_DB(school), school_id, "tenant:release-b")

    assert wrong_school.status_code == 409
    assert wrong_release.status_code == 409


def test_snapshot_rejects_non_monotonic_observation():
    school_id = uuid4()
    observed_at = datetime.now(timezone.utc).replace(tzinfo=None)
    existing = SimpleNamespace(observed_at=observed_at)
    school = SimpleNamespace(id=7, public_id=school_id, release_tag="tenant:release-a")

    response = _request(
        _DB(school, existing), school_id, "tenant:release-a", observed_at.replace(tzinfo=timezone.utc) - timedelta(seconds=1)
    )

    assert response.status_code == 409


def test_snapshot_schema_is_strict_and_versioned():
    school_id = uuid4()
    school = SimpleNamespace(id=7, public_id=school_id, release_tag="tenant:release-a")
    response = _request(_DB(school), school_id, "tenant:release-a")
    assert response.status_code == 200

    async def override_db():
        yield _DB(school)

    app.dependency_overrides[get_db] = override_db
    try:
        invalid = TestClient(app).post(
            "/api/telemetry",
            headers={"X-Telemetry-Token": "safe-token"},
            json={
                "slug": "school",
                "deployment_snapshot": {
                    "schema_version": 2,
                    "school_id": str(school_id),
                    "release_image": "tenant:release-a",
                    "scanner_ready": True,
                    "realtime_ready": True,
                    "push_registration_ready": True,
                    "push_delivery_ready": True,
                    "social_ready": True,
                    "observed_at": datetime.now(timezone.utc).isoformat(),
                },
            },
        )
    finally:
        app.dependency_overrides.clear()
        telemetry._hits.clear()
    assert invalid.status_code == 422
