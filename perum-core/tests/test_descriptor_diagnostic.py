import asyncio
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models import OrgAdmin, PlatformAdmin
from app.routers import diagnostics
from app.schemas.public import TenantCapabilities, TenantCompatibility
from app.services.mobile_descriptor import MobileDescriptorResolution


class _Result:
    def __init__(self, school):
        self.school = school

    def scalar_one_or_none(self):
        return self.school


class _DB:
    def __init__(self, school):
        self.school = school

    async def execute(self, statement):
        return _Result(self.school)


def _resolution():
    return MobileDescriptorResolution(
        1,
        TenantCompatibility(mobile_api_version=1, minimum_mobile_api_version=1, minimum_app_version="1.0.0"),
        TenantCapabilities(**dict.fromkeys(TenantCapabilities.model_fields, False)),
        True, True, True, True, 30, True,
    )


def test_diagnostic_allows_platform_and_returns_only_safe_shape(monkeypatch):
    school = SimpleNamespace(org_id=9)
    async def resolve(school, db): return _resolution()
    monkeypatch.setattr(diagnostics, "resolve_mobile_descriptor", resolve)
    result = asyncio.run(diagnostics.deployment_descriptor_diagnostic(uuid4(), PlatformAdmin(is_active=True), _DB(school)))
    assert set(result.model_dump()) == {
        "schema_valid", "release_match", "snapshot_present", "snapshot_fresh",
        "snapshot_age_bucket", "snapshot_accepted", "social_rollout_converged", "effective_capabilities",
    }
    assert result.snapshot_age_bucket == "lt_1m"


def test_diagnostic_enforces_org_scope_without_existence_leak():
    school = SimpleNamespace(org_id=9)
    with pytest.raises(HTTPException) as error:
        asyncio.run(diagnostics.deployment_descriptor_diagnostic(uuid4(), OrgAdmin(org_id=8, is_active=True), _DB(school)))
    assert error.value.status_code == 404
