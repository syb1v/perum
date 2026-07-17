import base64

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.config import get_settings
from app.main import app
from app.modules import mobile_descriptor as mobile


def test_descriptor_has_exact_manifest_contract_and_fail_closed_runtime(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "PUSH_TOKEN_ENCRYPTION_KEY", "")
    monkeypatch.setattr(settings, "PUSH_TOKEN_HASH_KEY", "")

    descriptor, _ = mobile.resolve_descriptor()

    assert set(descriptor.capabilities.model_dump()) == set(mobile.MobileCapabilities.model_fields)
    assert descriptor.schema_version == 1
    assert descriptor.capabilities.push_registration is False
    assert descriptor.capabilities.push_delivery is False
    assert descriptor.capabilities.social_realtime is True
    assert descriptor.capabilities.social_attachments is False
    assert descriptor.capabilities.support_attachments is False


def test_push_registration_requires_keys_and_build_false_cannot_be_raised(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "PUSH_TOKEN_ENCRYPTION_KEY", base64.b64encode(b"k" * 32).decode())
    monkeypatch.setattr(settings, "PUSH_TOKEN_HASH_KEY", "hash-secret")
    build = mobile.build_descriptor()
    monkeypatch.setattr(mobile, "build_descriptor", lambda: build.model_copy(update={
        "capabilities": build.capabilities.model_copy(update={"push_registration": False})
    }))

    descriptor, _ = mobile.resolve_descriptor()

    assert mobile.runtime_readiness().push_registration_ready is True
    assert descriptor.capabilities.push_registration is False
    assert descriptor.capabilities.push_delivery is False


def test_runtime_errors_fail_closed(monkeypatch):
    monkeypatch.setattr(mobile, "push_capability", lambda: (_ for _ in ()).throw(RuntimeError("unknown")))

    readiness = mobile.runtime_readiness()

    assert readiness.push_registration_ready is False
    assert readiness.push_delivery_ready is False


def test_manifest_validation_is_strict_and_closed(tmp_path, monkeypatch):
    manifest = tmp_path / "mobile-descriptor.json"
    manifest.write_text('{"schema_version": 1, "compatibility": {}, "capabilities": {}, "unknown": true}')
    monkeypatch.setattr(mobile, "DESCRIPTOR_PATH", manifest)
    mobile.build_descriptor.cache_clear()

    with pytest.raises(ValidationError):
        mobile.build_descriptor()

    mobile.build_descriptor.cache_clear()


def test_legacy_projections_keep_response_shape(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "PUSH_TOKEN_ENCRYPTION_KEY", "")
    monkeypatch.setattr(settings, "PUSH_TOKEN_HASH_KEY", "")
    descriptor, push = mobile.resolve_descriptor()

    assert mobile.legacy_compatibility(descriptor).model_dump() == {
        "compatible": True,
        "minimum_app_version": "0.0.0",
        "api_version": 1,
    }
    assert mobile.legacy_capabilities(descriptor, push).model_dump() == {
        "refresh_sessions": True,
        "session_management": True,
        "push_tokens": {
            "registration_supported": True,
            "registration_available": False,
            "delivery_enabled": False,
            "configured_providers": [],
        },
    }


def test_mobile_descriptor_endpoints_are_anonymous_and_typed(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "PUSH_TOKEN_ENCRYPTION_KEY", "")
    monkeypatch.setattr(settings, "PUSH_TOKEN_HASH_KEY", "")
    client = TestClient(app)

    descriptor = client.get("/api/mobile/descriptor")
    compatibility = client.get("/api/mobile/compatibility")
    capabilities = client.get("/api/mobile/capabilities")

    assert descriptor.status_code == 200
    assert set(descriptor.json()) == {"schema_version", "compatibility", "capabilities"}
    assert set(descriptor.json()["compatibility"]) == set(mobile.MobileCompatibility.model_fields)
    assert set(descriptor.json()["capabilities"]) == set(mobile.MobileCapabilities.model_fields)
    assert compatibility.json() == {
        "compatible": True,
        "minimum_app_version": descriptor.json()["compatibility"]["minimum_app_version"],
        "api_version": descriptor.json()["compatibility"]["mobile_api_version"],
    }
    assert capabilities.json()["refresh_sessions"] == descriptor.json()["capabilities"]["refresh_sessions"]
    assert capabilities.json()["session_management"] == descriptor.json()["capabilities"]["session_management"]
    assert capabilities.json()["push_tokens"]["registration_available"] == descriptor.json()["capabilities"]["push_registration"]
    assert capabilities.json()["push_tokens"]["delivery_enabled"] == descriptor.json()["capabilities"]["push_delivery"]
