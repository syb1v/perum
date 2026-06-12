"""R2: биллинг. Pure-логика подписки/просрочки + валидация плана + регистрация
и auth-гейты биллинг-эндпоинтов."""

from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.schemas.organization import OrganizationCreate
from app.services.billing import (
    GRACE_DAYS,
    PLANS,
    billing_state,
    expires_at,
    is_delinquent,
    plan_price,
    school_limit,
)

client = TestClient(app)
NOW = datetime(2026, 6, 12, 12, 0, 0)


def _sub(status="trial", trial_ends_at=None, paid_until=None):
    return SimpleNamespace(status=status, trial_ends_at=trial_ends_at, paid_until=paid_until)


def test_expires_at_prefers_paid_until():
    s = _sub(paid_until=NOW + timedelta(days=5), trial_ends_at=NOW - timedelta(days=5))
    assert expires_at(s) == NOW + timedelta(days=5)
    assert expires_at(_sub(trial_ends_at=NOW)) == NOW
    assert expires_at(_sub()) is None


def test_is_delinquent_rules():
    assert is_delinquent(None, NOW) is False
    assert is_delinquent(_sub(status="canceled"), NOW) is True
    assert is_delinquent(_sub(), NOW) is False  # нет срока → не просрочено
    # триал истёк давно (за пределами grace) → просрочено
    assert is_delinquent(_sub(trial_ends_at=NOW - timedelta(days=GRACE_DAYS + 1)), NOW) is True
    # истёк, но в пределах grace → ещё не просрочено
    assert is_delinquent(_sub(trial_ends_at=NOW - timedelta(hours=1)), NOW) is False
    # оплачено вперёд → не просрочено
    assert is_delinquent(_sub(status="active", paid_until=NOW + timedelta(days=30)), NOW) is False


def test_billing_state_shape():
    st = billing_state(_sub(status="active", paid_until=NOW + timedelta(days=10)), NOW)
    assert st["status"] == "active"
    assert st["delinquent"] is False
    assert st["days_left"] == 10
    assert billing_state(None, NOW)["status"] == "none"


def test_plan_helpers():
    assert school_limit("pro") == 50
    assert plan_price("trial") == 0 and plan_price("basic") > 0
    assert "trial" in PLANS and "enterprise" in PLANS


def test_org_create_rejects_unknown_plan():
    with pytest.raises(ValidationError):
        OrganizationCreate(slug="acme", name="Acme", plan="platinum")
    # валидный план проходит
    assert OrganizationCreate(slug="acme", name="Acme", plan="pro").plan == "pro"


def test_billing_endpoints_registered():
    p = client.get("/openapi.json").json()["paths"]
    for path in [
        "/api/organizations/{slug}/billing", "/api/organizations/{slug}/billing/charge",
        "/api/organizations/{slug}/billing/invoices", "/api/billing/enforce", "/api/schools/billing",
    ]:
        assert path in p, path


def test_platform_billing_requires_platform_admin():
    assert client.post("/api/billing/enforce").status_code in (401, 403)
    assert client.post("/api/organizations/demo/billing/charge", json={"months": 1}).status_code in (401, 403)


def test_org_billing_view_requires_org_admin():
    assert client.get("/api/schools/billing").status_code in (401, 403)
