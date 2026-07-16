from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from app.core.db import get_db
from app.core import ratelimit
from app.main import app
from app.routers.public import normalize_tenant_host


class _Result:
    def __init__(self, rows):
        self.rows = rows

    def first(self):
        return self.rows[0] if self.rows else None


class _DB:
    def __init__(self, *results):
        self.results = iter(results)

    async def execute(self, statement):
        return _Result(next(self.results))


def _client(db):
    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    return TestClient(app)


def _tenant():
    school_id = uuid4()
    school = SimpleNamespace(id=7, public_id=school_id, name="Central School", status="active")
    organization = SimpleNamespace(public_id=uuid4(), name="Central Org", status="active")
    return school, organization


def teardown_function():
    app.dependency_overrides.clear()
    ratelimit._discovery_hits.clear()


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (" HTTPS://School.Example.COM.:443/login?q=1 ", "school.example.com"),
        ("school.example.com:3000/path", "school.example.com"),
        ("школа.рф", "xn--80atdl2c.xn--p1ai"),
    ],
)
def test_normalize_tenant_host(value, expected):
    assert normalize_tenant_host(value) == expected


@pytest.mark.parametrize("value", ["ftp://school.example.com", "user@school.example.com", "127.0.0.1", "invalid"])
def test_normalize_tenant_host_rejects_unsafe_or_invalid_values(value):
    with pytest.raises(ValueError):
        normalize_tenant_host(value)


def test_authoritative_alias_returns_stable_public_contract():
    school, organization = _tenant()
    domain = SimpleNamespace(status="active")
    primary = SimpleNamespace(domain="primary.example.com")
    client = _client(_DB([(domain, school, organization)], [(primary,)]))

    response = client.get("/api/public/tenant-discovery", params={"host": "https://ALIAS.example.com./login"})

    assert response.status_code == 200
    assert response.json() == {
        "tenant_id": str(school.public_id),
        "organization_id": str(organization.public_id),
        "school_id": str(school.public_id),
        "organization_name": "Central Org",
        "school_name": "Central School",
        "canonical_host": "primary.example.com",
        "primary_host": "primary.example.com",
        "matched_host": "alias.example.com",
        "api_base_url": "https://primary.example.com/api",
        "web_base_url": "https://primary.example.com",
        "compatibility": {"mobile_api_version": 1, "minimum_mobile_api_version": 1},
        "capabilities": {"native_mobile": True},
    }


def test_inactive_authoritative_domain_is_not_resolved():
    school, organization = _tenant()
    domain = SimpleNamespace(status="removed")
    response = _client(_DB([(domain, school, organization)])).get(
        "/api/public/tenant-discovery", params={"host": "school.example.com"}
    )
    assert response.status_code == 404
    assert response.json() == {"detail": "Tenant not found"}


def test_post_discovers_by_organization_domain_and_school_code():
    school, organization = _tenant()
    primary = SimpleNamespace(domain="school.example.com")
    response = _client(_DB([(school, organization)], [(primary,)])).post(
        "/api/public/tenant-discovery",
        json={"organization_domain": "Example.COM.", "school_code": " SCHOOL "},
    )
    assert response.status_code == 200
    assert response.json()["primary_host"] == "school.example.com"
    assert response.json()["matched_host"] == "school.example.com"


def test_post_discovers_by_active_organization_domain_alias():
    school, organization = _tenant()
    primary = SimpleNamespace(domain="school.example.com")
    response = _client(_DB([(school, organization)], [(primary,)])).post(
        "/api/public/tenant-discovery",
        json={"organization_domain": "alias.example.com", "school_code": "school"},
    )

    assert response.status_code == 200
    assert response.json()["organization_id"] == str(organization.public_id)


def test_inactive_organization_domain_alias_is_not_resolved():
    response = _client(_DB([])).post(
        "/api/public/tenant-discovery",
        json={"organization_domain": "removed.example.com", "school_code": "school"},
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Tenant not found"}


def test_post_discovers_by_stable_school_id():
    school, organization = _tenant()
    primary = SimpleNamespace(domain="school.example.com")
    response = _client(_DB([(school, organization)], [(primary,)])).post(
        "/api/public/tenant-discovery", json={"school_public_id": str(school.public_id)}
    )
    assert response.status_code == 200
    assert UUID(response.json()["tenant_id"]) == school.public_id


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"organization_domain": "example.com"},
        {"school_code": "school"},
        {"host": "school.example.com", "school_public_id": str(uuid4())},
        {"host": "school.example.com", "unknown": True},
    ],
)
def test_post_rejects_ambiguous_or_incomplete_selectors(payload):
    assert _client(_DB()).post("/api/public/tenant-discovery", json=payload).status_code == 422


def test_unknown_and_malformed_hosts_have_same_generic_response():
    unknown = _client(_DB([])).get(
        "/api/public/tenant-discovery", params={"host": "unknown.example.com"}
    )
    malformed = _client(_DB()).get(
        "/api/public/tenant-discovery", params={"host": "https://user@school.example.com"}
    )
    assert unknown.status_code == malformed.status_code == 404
    assert unknown.json() == malformed.json() == {"detail": "Tenant not found"}


def test_discovery_is_rate_limited_by_client_ip(monkeypatch):
    settings = ratelimit.get_settings()
    monkeypatch.setattr(settings, "DISCOVERY_RATE_LIMIT", 1)
    monkeypatch.setattr(settings, "DISCOVERY_RATE_WINDOW_S", 60)
    client = _client(_DB([]))

    assert client.get("/api/public/tenant-discovery", params={"host": "unknown.example.com"}).status_code == 404
    blocked = client.post("/api/public/tenant-discovery", json={"host": "unknown.example.com"})

    assert blocked.status_code == 429
    assert blocked.headers["retry-after"] == "60"
