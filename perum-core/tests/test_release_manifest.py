import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.schemas.mobile_descriptor import MobileReleaseManifestV1


def _manifest() -> dict:
    return {
        "schema_version": 1,
        "compatibility": {
            "mobile_api_version": 1,
            "minimum_mobile_api_version": 1,
            "minimum_app_version": "0.0.0",
        },
        "capabilities": {
            "refresh_sessions": True,
            "session_management": True,
            "push_registration": True,
            "push_delivery": False,
            "social_friends": True,
            "social_messages": True,
            "social_realtime": True,
            "social_attachments": False,
            "support_requester": True,
            "support_admin": True,
            "support_attachments": False,
            "offline_preferences": True,
            "student_academics": True,
            "parent_academics": True,
            "teacher_diary": True,
            "offline_homework_state": True,
            "offline_social_messages": True,
            "offline_support_messages": True,
            "offline_read_cursors": False,
            "offline_social_read_cursors": False,
            "offline_support_ticket_creation": False,
        },
    }


def test_release_manifest_accepts_complete_v1_contract():
    manifest = MobileReleaseManifestV1.model_validate(_manifest())

    assert manifest.model_dump(mode="json") == _manifest()


@pytest.mark.parametrize(
    "mutate",
    [
        lambda value: value.__setitem__("unknown", True),
        lambda value: value["compatibility"].__setitem__("unknown", 1),
        lambda value: value["capabilities"].__setitem__("unknown", True),
        lambda value: value.__setitem__("schema_version", 2),
        lambda value: value["compatibility"].__setitem__("mobile_api_version", "1"),
        lambda value: value["capabilities"].__setitem__("push_delivery", "true"),
        lambda value: value["compatibility"].__setitem__("minimum_app_version", "1.0"),
        lambda value: value["compatibility"].update(
            minimum_mobile_api_version=2, mobile_api_version=1
        ),
        lambda value: value["capabilities"].pop("offline_read_cursors"),
        lambda value: value["capabilities"].pop("offline_social_read_cursors"),
    ],
)
def test_release_manifest_rejects_invalid_or_incomplete_contract(mutate):
    manifest = _manifest()
    mutate(manifest)

    with pytest.raises(ValidationError):
        MobileReleaseManifestV1.model_validate(manifest)


def _shape(schema: dict, components: dict) -> dict:
    if "$ref" in schema:
        schema = components[schema["$ref"].rsplit("/", 1)[-1]]
    return {
        "type": schema.get("type"),
        "required": sorted(schema.get("required", [])),
        "properties": {
            name: _shape(value, components)
            for name, value in sorted(schema.get("properties", {}).items())
        },
    }


def test_checked_in_tenant_manifest_and_openapi_match_authoritative_contract():
    root = Path(__file__).resolve().parents[2]
    manifest = json.loads((root / "perum-tenant/mobile-descriptor.json").read_text())
    validated = MobileReleaseManifestV1.model_validate(manifest)
    assert validated.model_dump(mode="json") == manifest

    core = json.loads((root / "packages/api-schema/openapi/core.json").read_text())
    tenant = json.loads((root / "packages/api-schema/openapi/tenant.json").read_text())
    core_components = core["components"]["schemas"]
    tenant_components = tenant["components"]["schemas"]
    core_descriptor = core_components["TenantDiscoveryResponse"]
    tenant_descriptor = tenant_components["MobileDescriptor"]
    for property_name in ("schema_version", "compatibility", "capabilities"):
        assert _shape(core_descriptor["properties"][property_name], core_components) == _shape(
            tenant_descriptor["properties"][property_name], tenant_components
        )
