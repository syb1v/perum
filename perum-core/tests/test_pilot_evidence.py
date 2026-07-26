import io
from email.message import Message
from uuid import UUID

import pytest

from tools.pilot_evidence import EvidenceCollector, EvidenceError, HttpClient, MAX_RESPONSE_BYTES, NoRedirect, SIMULATIONS, render_markdown, synthetic_evidence


SCHOOL = UUID("12345678-1234-5678-9234-567812345678")


class FakeClient:
    def get(self, path, metrics=False):
        if path == "/health": return 200, {"status": "ok"}
        if path.startswith("/api/diagnostics/"): return 200, {"schema_valid": True, "release_match": True, "snapshot_present": True, "snapshot_fresh": True, "snapshot_accepted": True}
        if path == "/api/releases/current": return 200, {"private": "ignored"}
        if path == "/metrics": return 200, "perum_mobile_descriptor_release_total\nperum_mobile_descriptor_deployment_total\n"
        return 404, None

    def post(self, path, payload):
        return 200, self.descriptor()

    def descriptor(self):
        return {
            "tenant_id": str(SCHOOL), "organization_id": "22345678-1234-5678-9234-567812345678",
            "school_id": str(SCHOOL), "organization_name": "Org", "school_name": "School",
            "canonical_host": "school.example.test", "primary_host": "school.example.test",
            "matched_host": "school.example.test", "api_base_url": "https://school.example.test/api",
            "web_base_url": "https://school.example.test", "descriptor_revision": "secret",
            "cache_ttl_seconds": 60, "schema_version": 1,
            "compatibility": {"mobile_api_version": 1, "minimum_mobile_api_version": 1, "minimum_app_version": "1.0.0"},
            "capabilities": {
                "refresh_sessions": True, "session_management": True, "push_registration": True,
                "push_delivery": True, "social_friends": False, "social_messages": False,
                "social_realtime": False, "social_attachments": False, "support_requester": False,
                "support_admin": False, "support_attachments": False, "offline_preferences": True, "student_academics": True, "student_analytics": True, "parent_academics": True, "parent_analytics": True, "teacher_diary": True, "teacher_homeroom": True, "teacher_works": True, "teacher_analytics": True, "school_admin_overview": True, "school_admin_social_moderation": True, "school_admin_academic_calendar": True,
                "offline_homework_state": True, "offline_social_messages": False,
                "offline_support_messages": False, "offline_read_cursors": True,
                "offline_social_read_cursors": False, "offline_support_ticket_creation": False,
            },
        }


def test_collector_redacts_and_requires_unavailable_proofs_for_go():
    evidence = EvidenceCollector(FakeClient(), SCHOOL, b"test-key").collect()
    serialized = str(evidence)
    assert evidence["decision"] == "NO-GO"
    assert evidence["findings"] == ["rollback_proven", "mobile_telemetry_proven"]
    assert str(SCHOOL) not in serialized
    assert "private.example" not in serialized
    assert "secret" not in serialized
    assert evidence["pilot"].startswith("pilot-")


def test_synthetic_modes_are_explicit_and_no_go():
    for mode in SIMULATIONS:
        evidence = synthetic_evidence(mode)
        assert evidence["synthetic"] is True
        assert evidence["decision"] == "NO-GO"
        assert evidence["findings"]
        assert "Synthetic: YES" in render_markdown(evidence)


class Response:
    def __init__(self, data, content_type="application/json", status=200):
        self.data = io.BytesIO(data)
        self.status = status
        self.headers = Message()
        self.headers["Content-Type"] = content_type

    def read(self, size):
        return self.data.read(size)


def test_discovery_post_is_anonymous(monkeypatch):
    client = HttpClient("https://core.example.test", "admin-secret")
    request_seen = None

    def open_request(request, timeout):
        nonlocal request_seen
        request_seen = request
        return Response(b"{}")

    monkeypatch.setattr(client.opener, "open", open_request)
    client.post("/api/public/tenant-discovery", {"school_public_id": str(SCHOOL)})

    assert request_seen.get_header("Authorization") is None


@pytest.mark.parametrize("base_url", [
    "http://core.example.test", "https://user:pass@core.example.test",
    "https://core.example.test/path", "https://core.example.test?query=1",
])
def test_http_client_rejects_unsafe_base_urls(base_url):
    with pytest.raises(EvidenceError):
        HttpClient(base_url, "token")


@pytest.mark.parametrize("response", [
    Response(b"{}", "text/html"),
    Response(b"{not-json}"),
    Response(b"x" * (MAX_RESPONSE_BYTES + 1)),
])
def test_http_client_fails_closed_on_content_type_size_and_json(monkeypatch, response):
    client = HttpClient("https://core.example.test", "token")
    monkeypatch.setattr(client.opener, "open", lambda request, timeout: response)
    assert client.get("/health") == (0, None)


def test_http_client_refuses_all_redirects():
    with pytest.raises(EvidenceError, match="redirect refused"):
        NoRedirect().redirect_request(None, None, 302, "Found", {}, "https://core.example.test/health")


def test_collector_rejects_wrong_school_and_malformed_descriptor():
    client = FakeClient()
    descriptor = client.descriptor()
    descriptor["school_id"] = "32345678-1234-5678-9234-567812345678"
    client.descriptor = lambda: descriptor

    evidence = EvidenceCollector(client, SCHOOL, b"test-key").collect()

    assert evidence["checks"]["stable_id_discovery"] is False
    assert str(SCHOOL) not in str(evidence)
    assert descriptor["school_id"] not in str(evidence)
