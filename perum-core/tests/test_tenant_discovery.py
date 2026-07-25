from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from app.core.db import get_db
from app.models import SchoolDeploymentSnapshot, SchoolSocialRollout
from app.core import ratelimit
from app.main import app
from app.routers.public import normalize_tenant_host
from app.schemas.public import TenantCapabilities
from app.services.descriptor_observability import descriptor_counter_samples, reset_descriptor_counters


class _Result:
    def __init__(self, rows):
        self.rows = rows

    def first(self):
        return self.rows[0] if self.rows else None

    def scalar_one_or_none(self):
        row = self.first()
        return row[0] if row is not None else None


class _DB:
    def __init__(self, *results, deployment_snapshot=None, rollout=None):
        self.results = iter(results)
        self.deployment_snapshot = deployment_snapshot
        self.rollout = rollout

    async def execute(self, statement):
        return _Result(next(self.results, []))

    async def get(self, model, key):
        if model is SchoolDeploymentSnapshot:
            return self.deployment_snapshot
        if model is SchoolSocialRollout:
            if self.rollout is not None:
                return self.rollout
            if self.deployment_snapshot is not None:
                return SimpleNamespace(platform_granted=True, org_enabled=True, generation=getattr(self.deployment_snapshot, "social_generation", 0))
        return None


def _client(db):
    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    return TestClient(app)


def _tenant():
    school_id = uuid4()
    school = SimpleNamespace(id=7, public_id=school_id, name="Central School", status="active", release_tag=None)
    organization = SimpleNamespace(public_id=uuid4(), name="Central Org", status="active")
    return school, organization


def teardown_function():
    app.dependency_overrides.clear()
    ratelimit._discovery_hits.clear()
    reset_descriptor_counters()


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
        "descriptor_revision": response.json()["descriptor_revision"],
        "cache_ttl_seconds": 3600,
        "schema_version": 1,
        "compatibility": {
            "mobile_api_version": 1,
            "minimum_mobile_api_version": 1,
            "minimum_app_version": "0.0.0",
        },
        "capabilities": dict.fromkeys(
            [
                "refresh_sessions", "session_management", "push_registration", "push_delivery",
                "social_friends", "social_messages", "social_realtime", "social_attachments",
                "support_requester", "support_admin", "support_attachments", "offline_preferences", "student_academics", "student_analytics", "parent_academics", "parent_analytics", "teacher_diary", "teacher_homeroom", "teacher_works", "teacher_analytics", "offline_homework_state",
                "offline_social_messages", "offline_support_messages", "offline_read_cursors", "offline_social_read_cursors",
                "offline_support_ticket_creation",
            ],
            False,
        ),
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


def test_revision_is_stable_across_aliases_and_changes_with_primary_host():
    school, organization = _tenant()
    domain = SimpleNamespace(status="active")
    first_primary = SimpleNamespace(domain="first.example.com")
    second_primary = SimpleNamespace(domain="second.example.com")

    alias_response = _client(_DB([(domain, school, organization)], [(first_primary,)])).get(
        "/api/public/tenant-discovery", params={"host": "alias.example.com"}
    )
    id_response = _client(_DB([(school, organization)], [(first_primary,)])).post(
        "/api/public/tenant-discovery", json={"school_public_id": str(school.public_id)}
    )
    moved_response = _client(_DB([(school, organization)], [(second_primary,)])).post(
        "/api/public/tenant-discovery", json={"school_public_id": str(school.public_id)}
    )

    assert alias_response.json()["descriptor_revision"] == id_response.json()["descriptor_revision"]
    assert moved_response.json()["descriptor_revision"] != id_response.json()["descriptor_revision"]
    assert moved_response.json()["api_base_url"] == "https://second.example.com/api"


def test_release_manifest_controls_mobile_contract_and_revision():
    school, organization = _tenant()
    school.release_tag = "tenant:release-a"
    domain = SimpleNamespace(status="active")
    primary = SimpleNamespace(domain="school.example.com")
    release = SimpleNamespace(
        id=4,
        mobile_descriptor_schema_version=1,
        mobile_compatibility={
            "mobile_api_version": 2,
            "minimum_mobile_api_version": 1,
            "minimum_app_version": "2.3.0",
        },
        mobile_build_capabilities=dict.fromkeys(
            [
                "refresh_sessions", "session_management", "push_registration", "push_delivery",
                "social_friends", "social_messages", "social_realtime", "social_attachments",
                "support_requester", "support_admin", "support_attachments", "offline_preferences", "student_academics", "student_analytics", "parent_academics", "parent_analytics", "teacher_diary", "teacher_homeroom", "teacher_works", "teacher_analytics", "offline_homework_state",
                "offline_social_messages", "offline_support_messages", "offline_read_cursors", "offline_social_read_cursors",
                "offline_support_ticket_creation",
            ],
            True,
        ),
    )
    snapshot = SimpleNamespace(
        release_image=school.release_tag,
        observed_at=datetime.now(timezone.utc).replace(tzinfo=None),
        scanner_ready=True,
        realtime_ready=True,
        push_registration_ready=True,
        push_delivery_ready=True,
        social_ready=True,
    )
    manifest_response = _client(_DB(
        [(domain, school, organization)], [(primary,)], [(release,)], deployment_snapshot=snapshot
    )).get(
        "/api/public/tenant-discovery", params={"host": "school.example.com"}
    )
    fallback_response = _client(_DB([(domain, school, organization)], [(primary,)], [])).get(
        "/api/public/tenant-discovery", params={"host": "school.example.com"}
    )

    assert manifest_response.json()["compatibility"]["mobile_api_version"] == 2
    assert manifest_response.json()["capabilities"]["push_delivery"] is True
    assert fallback_response.json()["capabilities"]["push_delivery"] is False
    assert manifest_response.json()["descriptor_revision"] != fallback_response.json()["descriptor_revision"]


def test_sequential_release_upgrade_and_downgrade_change_revision_and_effective_capabilities():
    school, organization = _tenant()
    domain = SimpleNamespace(status="active")
    primary = SimpleNamespace(domain="school.example.com")
    base = dict.fromkeys(
        [
            "refresh_sessions", "session_management", "push_registration", "push_delivery",
            "social_friends", "social_messages", "social_realtime", "social_attachments",
            "support_requester", "support_admin", "support_attachments", "offline_preferences", "student_academics", "student_analytics", "parent_academics", "parent_analytics", "teacher_diary", "teacher_homeroom", "teacher_works", "teacher_analytics", "offline_homework_state",
            "offline_social_messages", "offline_support_messages", "offline_read_cursors", "offline_social_read_cursors",
            "offline_support_ticket_creation",
        ],
        False,
    )
    snapshot_time = datetime.now(timezone.utc).replace(tzinfo=None)

    def resolve(tag, release_id, homework_enabled):
        school.release_tag = tag
        release = SimpleNamespace(
            id=release_id,
            mobile_descriptor_schema_version=1,
            mobile_compatibility={"mobile_api_version": 1, "minimum_mobile_api_version": 1, "minimum_app_version": "1.0.0"},
            mobile_build_capabilities={**base, "refresh_sessions": True, "offline_homework_state": homework_enabled},
        )
        snapshot = SimpleNamespace(
            release_image=tag, observed_at=snapshot_time, scanner_ready=False,
            realtime_ready=False, push_registration_ready=False, push_delivery_ready=False,
            social_ready=False,
        )
        response = _client(_DB([(domain, school, organization)], [(primary,)], [(release,)], deployment_snapshot=snapshot)).get(
            "/api/public/tenant-discovery", params={"host": "school.example.com"}
        )
        assert response.status_code == 200
        return response.json()

    initial = resolve("tenant:release-a", 1, False)
    upgraded = resolve("tenant:release-b", 2, True)
    downgraded = resolve("tenant:release-c", 3, False)

    assert initial["capabilities"]["offline_homework_state"] is False
    assert upgraded["capabilities"]["offline_homework_state"] is True
    assert downgraded["capabilities"]["offline_homework_state"] is False
    assert initial["descriptor_revision"] != upgraded["descriptor_revision"]
    assert downgraded["descriptor_revision"] == initial["descriptor_revision"]


def test_deployment_snapshot_only_gates_runtime_dependent_capabilities():
    school, organization = _tenant()
    school.release_tag = "tenant:release-a"
    domain = SimpleNamespace(status="active")
    primary = SimpleNamespace(domain="school.example.com")
    capabilities = dict.fromkeys(
        [
            "refresh_sessions", "session_management", "push_registration", "push_delivery",
            "social_friends", "social_messages", "social_realtime", "social_attachments",
            "support_requester", "support_admin", "support_attachments", "offline_preferences", "student_academics", "student_analytics", "parent_academics", "parent_analytics", "teacher_diary", "teacher_homeroom", "teacher_works", "teacher_analytics", "offline_homework_state",
            "offline_social_messages", "offline_support_messages", "offline_read_cursors", "offline_social_read_cursors",
            "offline_support_ticket_creation",
        ],
        True,
    )
    release = SimpleNamespace(
        id=4,
        mobile_descriptor_schema_version=1,
        mobile_compatibility={
            "mobile_api_version": 1,
            "minimum_mobile_api_version": 1,
            "minimum_app_version": "1.0.0",
        },
        mobile_build_capabilities=capabilities,
    )
    snapshot = SimpleNamespace(
        release_image=school.release_tag,
        observed_at=datetime.now(timezone.utc).replace(tzinfo=None),
        scanner_ready=False,
        realtime_ready=True,
        push_registration_ready=True,
        push_delivery_ready=False,
        social_ready=True,
    )
    response = _client(_DB(
        [(domain, school, organization)], [(primary,)], [(release,)], deployment_snapshot=snapshot
    )).get("/api/public/tenant-discovery", params={"host": "school.example.com"})

    effective = response.json()["capabilities"]
    assert effective["refresh_sessions"] is True
    assert effective["social_realtime"] is True
    assert effective["push_registration"] is True
    assert effective["push_delivery"] is False
    assert effective["social_attachments"] is False
    assert effective["support_attachments"] is False


def test_stale_snapshot_disables_only_runtime_dependent_capabilities():
    school, organization = _tenant()
    school.release_tag = "tenant:release-a"
    domain = SimpleNamespace(status="active")
    primary = SimpleNamespace(domain="school.example.com")
    capabilities = dict.fromkeys(
        [
            "refresh_sessions", "session_management", "push_registration", "push_delivery",
            "social_friends", "social_messages", "social_realtime", "social_attachments",
            "support_requester", "support_admin", "support_attachments", "offline_preferences", "student_academics", "student_analytics", "parent_academics", "parent_analytics", "teacher_diary", "teacher_homeroom", "teacher_works", "teacher_analytics", "offline_homework_state",
            "offline_social_messages", "offline_support_messages", "offline_read_cursors", "offline_social_read_cursors",
            "offline_support_ticket_creation",
        ],
        True,
    )
    release = SimpleNamespace(
        id=4,
        mobile_descriptor_schema_version=1,
        mobile_compatibility={
            "mobile_api_version": 1,
            "minimum_mobile_api_version": 1,
            "minimum_app_version": "1.0.0",
        },
        mobile_build_capabilities=capabilities,
    )
    snapshot = SimpleNamespace(
        release_image=school.release_tag,
        observed_at=datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=1),
        scanner_ready=True,
        realtime_ready=True,
        push_registration_ready=True,
        push_delivery_ready=True,
        social_ready=True,
    )
    response = _client(_DB(
        [(domain, school, organization)], [(primary,)], [(release,)], deployment_snapshot=snapshot
    )).get("/api/public/tenant-discovery", params={"host": "school.example.com"})

    effective = response.json()["capabilities"]
    assert effective["refresh_sessions"] is True
    assert all(effective[name] is False for name in (
        "push_registration", "push_delivery", "social_realtime",
        "social_attachments", "support_attachments",
    ))


def test_snapshot_cannot_raise_build_false_capability():
    school, organization = _tenant()
    school.release_tag = "tenant:release-a"
    domain = SimpleNamespace(status="active")
    primary = SimpleNamespace(domain="school.example.com")
    capabilities = dict.fromkeys(
        [
            "refresh_sessions", "session_management", "push_registration", "push_delivery",
            "social_friends", "social_messages", "social_realtime", "social_attachments",
            "support_requester", "support_admin", "support_attachments", "offline_preferences", "student_academics", "student_analytics", "parent_academics", "parent_analytics", "teacher_diary", "teacher_homeroom", "teacher_works", "teacher_analytics", "offline_homework_state",
            "offline_social_messages", "offline_support_messages", "offline_read_cursors", "offline_social_read_cursors",
            "offline_support_ticket_creation",
        ],
        False,
    )
    release = SimpleNamespace(
        id=4,
        mobile_descriptor_schema_version=1,
        mobile_compatibility={
            "mobile_api_version": 1,
            "minimum_mobile_api_version": 1,
            "minimum_app_version": "1.0.0",
        },
        mobile_build_capabilities=capabilities,
    )
    snapshot = SimpleNamespace(
        release_image=school.release_tag,
        observed_at=datetime.now(timezone.utc).replace(tzinfo=None),
        scanner_ready=True,
        realtime_ready=True,
        push_registration_ready=True,
        push_delivery_ready=True,
        social_ready=True,
    )
    response = _client(_DB(
        [(domain, school, organization)], [(primary,)], [(release,)], deployment_snapshot=snapshot
    )).get("/api/public/tenant-discovery", params={"host": "school.example.com"})

    assert not any(response.json()["capabilities"].values())


def test_desired_revoke_disables_social_immediately_despite_ready_snapshot():
    school, organization = _tenant()
    school.release_tag = "tenant:release-a"
    domain = SimpleNamespace(status="active")
    primary = SimpleNamespace(domain="school.example.com")
    capabilities = dict.fromkeys(TenantCapabilities.model_fields, True)
    release = SimpleNamespace(id=9, mobile_descriptor_schema_version=1, mobile_compatibility={"mobile_api_version": 1, "minimum_mobile_api_version": 1, "minimum_app_version": "1.0.0"}, mobile_build_capabilities=capabilities)
    snapshot = SimpleNamespace(release_image=school.release_tag, observed_at=datetime.now(timezone.utc).replace(tzinfo=None), scanner_ready=True, realtime_ready=True, push_registration_ready=True, push_delivery_ready=True, social_ready=True, social_generation=1)
    rollout = SimpleNamespace(platform_granted=False, org_enabled=False, generation=2)
    response = _client(_DB([(domain, school, organization)], [(primary,)], [(release,)], deployment_snapshot=snapshot, rollout=rollout)).get("/api/public/tenant-discovery", params={"host": "school.example.com"})
    assert response.status_code == 200
    assert response.json()["capabilities"]["social_friends"] is False


def test_missing_snapshot_keeps_build_only_capabilities_and_emits_safe_telemetry(caplog):
    school, organization = _tenant()
    school.release_tag = "tenant:secret-release"
    domain = SimpleNamespace(status="active")
    primary = SimpleNamespace(domain="school.example.com")
    capabilities = dict.fromkeys(
        [
            "refresh_sessions", "session_management", "push_registration", "push_delivery",
            "social_friends", "social_messages", "social_realtime", "social_attachments",
            "support_requester", "support_admin", "support_attachments", "offline_preferences", "student_academics", "student_analytics", "parent_academics", "parent_analytics", "teacher_diary", "teacher_homeroom", "teacher_works", "teacher_analytics", "offline_homework_state",
            "offline_social_messages", "offline_support_messages", "offline_read_cursors", "offline_social_read_cursors",
            "offline_support_ticket_creation",
        ],
        True,
    )
    release = SimpleNamespace(
        id=4,
        mobile_descriptor_schema_version=1,
        mobile_compatibility={
            "mobile_api_version": 1,
            "minimum_mobile_api_version": 1,
            "minimum_app_version": "1.0.0",
        },
        mobile_build_capabilities=capabilities,
    )

    with caplog.at_level("WARNING", logger="app.routers.public"):
        response = _client(_DB(
            [(domain, school, organization)], [(primary,)], [(release,)]
        )).get("/api/public/tenant-discovery", params={"host": "school.example.com"})

    effective = response.json()["capabilities"]
    assert effective["refresh_sessions"] is True
    assert effective["push_registration"] is False
    record = next(record for record in caplog.records if record.getMessage().startswith("mobile_descriptor_deployment_unavailable"))
    assert record.descriptor_reason == "missing_snapshot"
    assert not hasattr(record, "school_id")
    assert "reason=missing_snapshot" in caplog.text
    assert "secret-release" not in caplog.text


def test_release_resolution_failures_emit_reason_codes_without_release_identity(caplog):
    school, organization = _tenant()
    domain = SimpleNamespace(status="active")
    primary = SimpleNamespace(domain="school.example.com")
    with caplog.at_level("WARNING", logger="app.routers.public"):
        _client(_DB([(domain, school, organization)], [(primary,)])).get(
            "/api/public/tenant-discovery", params={"host": "school.example.com"}
        )
        school.release_tag = "tenant:secret-unknown"
        _client(_DB([(domain, school, organization)], [(primary,)], [])).get(
            "/api/public/tenant-discovery", params={"host": "school.example.com"}
        )
        invalid_release = SimpleNamespace(
            id=9,
            mobile_descriptor_schema_version=1,
            mobile_compatibility={},
            mobile_build_capabilities={},
        )
        _client(_DB([(domain, school, organization)], [(primary,)], [(invalid_release,)])).get(
            "/api/public/tenant-discovery", params={"host": "school.example.com"}
        )

    records = [record for record in caplog.records if record.getMessage().startswith("mobile_descriptor_resolution_failed")]
    assert [record.descriptor_reason for record in records] == [
        "missing_release", "unknown_release", "invalid_manifest"
    ]
    assert all(not hasattr(record, "school_id") and not hasattr(record, "release_id") for record in records)
    assert "secret-unknown" not in caplog.text
    release_reasons, _ = descriptor_counter_samples()
    assert release_reasons == {"missing_release": 1, "unknown_release": 1, "invalid_manifest": 1}


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
