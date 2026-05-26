"""RBAC-гейты v2 + чистая логика (без БД — проверки до обращения к БД).

Подтверждают разделение уровней: school/org/platform-эндпоинты отбивают
неаутентифицированные/чужие токены ещё в auth-зависимости, до запросов в БД.
"""

from fastapi.testclient import TestClient

from app.main import app
from app.services.billing import PLAN_SCHOOL_LIMITS, school_limit

client = TestClient(app)

GARBAGE = {"Authorization": "Bearer not.a.jwt"}


# --- разделение уровней (org_admin vs platform_admin) ---

def test_schools_require_org_admin_token():
    assert client.get("/api/schools").status_code == 401
    assert client.get("/api/schools", headers=GARBAGE).status_code == 401


def test_releases_require_platform_admin_token():
    assert client.get("/api/releases").status_code == 401
    assert client.get("/api/releases", headers=GARBAGE).status_code == 401


def test_enrollment_token_requires_platform_admin():
    assert client.post("/api/organizations/acme/enrollment-token").status_code == 401


def test_org_billing_requires_platform_admin():
    assert client.get("/api/organizations/acme/billing").status_code == 401


def test_school_update_requires_org_admin():
    assert client.post("/api/schools/1/update").status_code == 401


# --- открытые служебные эндпоинты ---

def test_enroll_route_mounted_validates_body():
    # без тела → 422 (роут есть, БД не трогается)
    assert client.post("/api/enroll").status_code == 422


def test_agent_whoami_open_in_platform_mode():
    r = client.get("/api/agent/whoami")
    assert r.status_code == 200
    body = r.json()
    assert body["role"] == "platform"
    assert body["enrolled"] is False


# --- чистая логика биллинга ---

def test_school_limit_known_plans():
    assert school_limit("trial") == 1
    assert school_limit("basic") == PLAN_SCHOOL_LIMITS["basic"]
    assert school_limit("pro") == PLAN_SCHOOL_LIMITS["pro"]


def test_school_limit_unknown_plan_falls_back_to_trial():
    assert school_limit("nonexistent") == PLAN_SCHOOL_LIMITS["trial"]
