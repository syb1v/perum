"""R2: биллинг. Pure-логика подписки/просрочки + валидация плана + регистрация
и auth-гейты биллинг-эндпоинтов."""

import asyncio

from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.db import get_db
from app.core.deps import require_billing_ok, require_platform_admin
from app.main import app
from app.models import Invoice, Organization, School, Subscription
from app.schemas.organization import OrganizationCreate
from app.services import billing
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


class _Scalars:
    def __init__(self, values):
        self.values = values

    def all(self):
        return list(self.values)

    def first(self):
        return self.values[0] if self.values else None


class _Result:
    def __init__(self, values):
        self.values = values

    def scalars(self):
        return _Scalars(self.values)

    def scalar_one_or_none(self):
        return self.values[0] if self.values else None


class _BillingDB:
    def __init__(self, orgs, subscriptions, schools=(), invoices=()):
        self.orgs = list(orgs)
        self.subscriptions = {sub.org_id: sub for sub in subscriptions}
        self.schools = list(schools)
        self.invoices = list(invoices)
        self.commits = 0

    async def execute(self, statement):
        sql = str(statement)
        params = statement.compile().params
        if "FROM organizations" in sql:
            return _Result([org for org in self.orgs if org.status == "active"])
        if "FROM invoices" in sql:
            org_id = next(value for key, value in params.items() if "org_id" in key)
            open_invoices = [
                invoice for invoice in self.invoices
                if invoice.org_id == org_id and invoice.status == "open"
            ]
            if "LIMIT" in sql:
                return _Result([invoice.id for invoice in open_invoices[:1]])
            return _Result(open_invoices)
        raise AssertionError(f"unexpected query: {sql}")

    async def get(self, model, key):
        if model is Subscription:
            return self.subscriptions.get(key)
        if model is Organization:
            return next((org for org in self.orgs if org.id == key), None)
        return None

    def add(self, value):
        if isinstance(value, Invoice):
            value.id = max((invoice.id for invoice in self.invoices), default=0) + 1
            self.invoices.append(value)

    async def flush(self):
        pass

    async def commit(self):
        self.commits += 1

    async def refresh(self, value):
        pass


def _org(org_id, slug, status="active", plan="basic"):
    return Organization(id=org_id, slug=slug, name=slug, status=status, plan=plan)


def _subscription(org_id, *, status="active", paid_until=None):
    return Subscription(org_id=org_id, status=status, paid_until=paid_until)


def _school(school_id, org_id, slug, status="active"):
    return School(id=school_id, org_id=org_id, slug=slug, name=slug, status=status)


def _sub(status="trial", trial_ends_at=None, paid_until=None):
    return SimpleNamespace(status=status, trial_ends_at=trial_ends_at, paid_until=paid_until)


def test_expires_at_prefers_paid_until():
    s = _sub(paid_until=NOW + timedelta(days=5), trial_ends_at=NOW - timedelta(days=5))
    assert expires_at(s) == NOW + timedelta(days=5)
    assert expires_at(_sub(trial_ends_at=NOW)) == NOW
    assert expires_at(_sub()) is None


def test_is_delinquent_rules():
    assert is_delinquent(None, NOW) is False
    assert is_delinquent(_sub(status="canceled"), NOW) is False
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
        OrganizationCreate(domain="acme.ru", node_id=1, name="Acme", plan="platinum")
    # валидный план проходит
    assert OrganizationCreate(domain="acme.ru", node_id=1, name="Acme", plan="pro").plan == "pro"


def test_billing_endpoints_registered():
    p = client.get("/openapi.json").json()["paths"]
    for path in [
        "/api/organizations/{org_id}/billing", "/api/organizations/{org_id}/billing/charge",
        "/api/organizations/{org_id}/billing/invoices", "/api/billing/enforce", "/api/schools/billing",
    ]:
        assert path in p, path


def test_platform_billing_requires_platform_admin():
    assert client.post("/api/billing/enforce").status_code in (401, 403)
    assert client.post("/api/organizations/1/billing/charge", json={"months": 1}).status_code in (401, 403)


def test_org_billing_view_requires_org_admin():
    assert client.get("/api/schools/billing").status_code in (401, 403)


def test_reconciliation_is_non_destructive_and_idempotent(monkeypatch):
    delinquent_org = _org(1, "delinquent")
    active_school = _school(1, 1, "active-school")
    already_suspended_school = _school(2, 1, "suspended-school", "suspended")
    paid_until = datetime.utcnow() - timedelta(days=GRACE_DAYS + 2)
    db = _BillingDB(
        [delinquent_org],
        [_subscription(1, paid_until=paid_until)],
        [active_school, already_suspended_school],
    )
    suspend_calls = []

    async def forbidden_suspend(*args, **kwargs):
        suspend_calls.append((args, kwargs))
        raise AssertionError("reconciliation must not suspend schools")

    monkeypatch.setattr("app.services.school_provisioner.suspend_school", forbidden_suspend)

    first = asyncio.run(billing.run_billing_reconciliation(db))
    second = asyncio.run(billing.run_billing_reconciliation(db))

    assert delinquent_org.status == "active"
    assert delinquent_org.suspended_at is None
    assert active_school.status == "active"
    assert already_suspended_school.status == "suspended"
    assert suspend_calls == []
    assert db.subscriptions[1].status == "past_due"
    assert len(db.invoices) == 1
    assert db.invoices[0].status == "open"
    assert db.invoices[0].amount_rub == plan_price("basic")
    assert db.invoices[0].period_start == paid_until
    assert db.invoices[0].period_end == paid_until + timedelta(days=30)
    assert first == {
        "checked": 1,
        "delinquent": ["delinquent"],
        "invoices_created": ["delinquent"],
        "invoices_existing": [],
        "subscriptions_marked_past_due": ["delinquent"],
        "suspended": [],
    }
    assert second == {
        "checked": 1,
        "delinquent": ["delinquent"],
        "invoices_created": [],
        "invoices_existing": ["delinquent"],
        "subscriptions_marked_past_due": [],
        "suspended": [],
    }


def test_reconciliation_handles_mixed_and_pre_suspended_states():
    current_org = _org(1, "current")
    delinquent_org = _org(2, "delinquent")
    suspended_org = _org(3, "suspended", "suspended")
    schools = [
        _school(1, 1, "current-school"),
        _school(2, 2, "delinquent-school"),
        _school(3, 3, "pre-suspended-school", "suspended"),
    ]
    db = _BillingDB(
        [current_org, delinquent_org, suspended_org],
        [
            _subscription(1, paid_until=datetime.utcnow() + timedelta(days=10)),
            _subscription(2, paid_until=datetime.utcnow() - timedelta(days=GRACE_DAYS + 2)),
            _subscription(3, status="past_due", paid_until=datetime.utcnow() - timedelta(days=30)),
        ],
        schools,
    )

    result = asyncio.run(billing.run_billing_reconciliation(db))

    assert result["checked"] == 2
    assert result["delinquent"] == ["delinquent"]
    assert result["invoices_created"] == ["delinquent"]
    assert db.subscriptions[1].status == "active"
    assert db.subscriptions[2].status == "past_due"
    assert suspended_org.status == "suspended"
    assert [school.status for school in schools] == ["active", "active", "suspended"]
    assert [invoice.org_id for invoice in db.invoices] == [2]


def test_canceled_subscription_is_not_reconciled_or_blocked():
    org = _org(1, "canceled")
    sub = _subscription(
        1,
        status="canceled",
        paid_until=datetime.utcnow() - timedelta(days=GRACE_DAYS + 30),
    )
    db = _BillingDB([org], [sub])

    async def exercise():
        result = await billing.run_billing_reconciliation(db)
        admin = await require_billing_ok(SimpleNamespace(org_id=org.id), db)
        return result, admin

    result, admin = asyncio.run(exercise())

    assert result["checked"] == 1
    assert result["delinquent"] == []
    assert result["invoices_created"] == []
    assert result["subscriptions_marked_past_due"] == []
    assert is_delinquent(sub, datetime.utcnow()) is False
    assert admin.org_id == org.id
    assert sub.status == "canceled"
    assert db.invoices == []


def test_payment_waits_for_reconciliation_and_leaves_paid_current_state(monkeypatch):
    async def scenario():
        org = _org(1, "delinquent")
        sub = _subscription(
            1,
            paid_until=datetime.utcnow() - timedelta(days=GRACE_DAYS + 2),
        )
        db = _BillingDB([org], [sub])
        reconciliation_entered = asyncio.Event()
        allow_reconciliation = asyncio.Event()
        original_open_invoice_for = billing.open_invoice_for

        async def controlled_open_invoice_for(*args, **kwargs):
            reconciliation_entered.set()
            await allow_reconciliation.wait()
            return await original_open_invoice_for(*args, **kwargs)

        monkeypatch.setattr(billing, "open_invoice_for", controlled_open_invoice_for)
        reconcile_task = asyncio.create_task(billing.run_billing_reconciliation(db))
        await reconciliation_entered.wait()
        payment_task = asyncio.create_task(billing.record_payment(db, org, sub, 1))
        await asyncio.sleep(0)
        assert payment_task.done() is False

        allow_reconciliation.set()
        reconciliation_result, paid_invoice = await asyncio.gather(reconcile_task, payment_task)
        return db, sub, reconciliation_result, paid_invoice

    before = datetime.utcnow()
    db, sub, reconciliation_result, paid_invoice = asyncio.run(scenario())
    after = datetime.utcnow()

    assert reconciliation_result["invoices_created"] == ["delinquent"]
    assert len(db.invoices) == 1
    assert paid_invoice is db.invoices[0]
    assert paid_invoice.status == "paid"
    assert paid_invoice.amount_rub == plan_price("basic")
    assert before <= paid_invoice.period_start <= after
    assert paid_invoice.period_end == paid_invoice.period_start + timedelta(days=30)
    assert sub.status == "active"
    assert sub.paid_until == paid_invoice.period_end
    assert not [invoice for invoice in db.invoices if invoice.status == "open"]


def test_enforce_compatibility_endpoint_authorized_and_non_destructive():
    org = _org(1, "delinquent")
    school = _school(1, 1, "school")
    db = _BillingDB(
        [org],
        [_subscription(1, paid_until=datetime.utcnow() - timedelta(days=GRACE_DAYS + 2))],
        [school],
    )

    async def override_db():
        yield db

    async def override_platform_admin():
        return SimpleNamespace(id=1, is_active=True)

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[require_platform_admin] = override_platform_admin
    try:
        response = TestClient(app).post("/api/billing/enforce")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["delinquent"] == ["delinquent"]
    assert response.json()["invoices_created"] == ["delinquent"]
    assert response.json()["suspended"] == []
    assert org.status == "active"
    assert school.status == "active"


def test_scheduler_and_service_use_reconciliation_terminology():
    from app import main

    assert hasattr(main, "_billing_reconciliation_loop")
    assert not hasattr(main, "_billing_enforcement_loop")
    assert not hasattr(billing, "run_billing_enforcement")


def test_enforce_operation_id_remains_compatible():
    operation = client.get("/openapi.json").json()["paths"]["/api/billing/enforce"]["post"]

    assert operation["operationId"] == "enforce_billing_api_billing_enforce_post"
    assert operation["summary"] == "Reconcile Billing"
    assert "приостановки" in operation["description"]
