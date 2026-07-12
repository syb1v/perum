from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.core.db import get_db
from app.main import app
from app.routers.public import normalize_tenant_host


class _Result:
    def __init__(self, rows):
        self.rows = rows

    def first(self):
        return self.rows[0] if self.rows else None

    def all(self):
        return self.rows


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


def teardown_function():
    app.dependency_overrides.clear()


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


def test_authoritative_domain_discovery_returns_limited_public_contract():
    domain = SimpleNamespace(status="active")
    school = SimpleNamespace(name="Central School", status="active")
    organization = SimpleNamespace(status="active")
    client = _client(_DB([(domain, school, organization)]))

    response = client.get("/api/public/tenant-discovery", params={"host": "https://SCHOOL.example.com./login"})

    assert response.status_code == 200
    assert response.json() == {
        "school_name": "Central School",
        "canonical_host": "school.example.com",
        "api_base_url": "https://school.example.com/api",
        "web_base_url": "https://school.example.com",
        "compatibility": {"mobile_api_version": 1, "minimum_mobile_api_version": 1},
        "capabilities": {"native_mobile": True},
    }


def test_inactive_authoritative_domain_blocks_derived_fallback():
    domain = SimpleNamespace(status="removed")
    school = SimpleNamespace(name="School", status="active")
    organization = SimpleNamespace(status="active")
    response = _client(_DB([(domain, school, organization)])).get(
        "/api/public/tenant-discovery", params={"host": "school.example.com"}
    )
    assert response.status_code == 404
    assert response.json() == {"detail": "Tenant not found"}


def test_derived_subdomain_and_org_domain_fallback():
    school = SimpleNamespace(name="Fallback School", subdomain="school", status="active")
    organization = SimpleNamespace(domain="Example.COM.", status="active")
    response = _client(_DB([], [(school, organization)])).get(
        "/api/public/tenant-discovery", params={"host": "school.example.com"}
    )
    assert response.status_code == 200
    assert response.json()["school_name"] == "Fallback School"


def test_unknown_and_malformed_hosts_have_same_generic_response():
    client = _client(_DB([], []))
    unknown = client.get("/api/public/tenant-discovery", params={"host": "unknown.example.com"})
    malformed = client.get("/api/public/tenant-discovery", params={"host": "https://user@school.example.com"})
    assert unknown.status_code == malformed.status_code == 404
    assert unknown.json() == malformed.json() == {"detail": "Tenant not found"}
