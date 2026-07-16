import asyncio
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app
from app.models import SupportEscalationEvent, SupportMessage, SupportTicket
from app.routers.support import EscalationIntake, MessageCreate, TicketCreate, outbound_escalation, _authenticate_school, _platform_visible

client = TestClient(app)


def test_escalation_routes_and_auth_gates():
    paths = client.get("/openapi.json").json()["paths"]
    assert "/internal/support/escalations" in paths
    assert "/internal/support/escalations/outbound" in paths
    assert "/internal/support/escalations/outbound/ack" in paths
    assert "/api/support/escalations/pending" in paths
    assert "/api/support/escalations/{ticket_id}" in paths
    assert "/api/support/escalations/{ticket_id}/approve" in paths
    assert "/api/support/escalations/{ticket_id}/reject" in paths
    assert "/api/support/escalations/{ticket_id}/relay" in paths
    assert client.get("/api/support/escalations/pending").status_code in (401, 403)
    assert client.post(
        "/internal/support/escalations",
        json={
            "school_public_id": str(uuid4()),
            "correlation_id": "c1",
            "subject": "Subject",
            "message": "Body",
            "redacted_snapshot": {},
        },
    ).status_code == 401


def test_payloads_are_text_only_and_bounded():
    with pytest.raises(ValueError):
        MessageCreate(body="x" * 4001)
    with pytest.raises(ValueError):
        TicketCreate(subject="ok", message="x" * 4001)
    with pytest.raises(ValueError):
        EscalationIntake(
            school_public_id=uuid4(), correlation_id="c", subject="ok", message="x" * 4001
        )


def test_model_defaults_preserve_direct_ticket_compatibility():
    ticket = SupportTicket(org_id=1, subject="Direct")
    assert ticket.source is None
    assert ticket.school_id is None
    assert ticket.correlation_id is None
    assert SupportTicket.source.default.arg == "direct"
    assert SupportTicket.approval_status.default.arg == "not_required"
    assert SupportTicket.approval_version.default.arg == 0
    assert SupportMessage.public_id.default is not None


def test_platform_visibility_requires_school_approval():
    sql = str(_platform_visible().compile(compile_kwargs={"literal_binds": True}))
    assert "support_tickets.source = 'direct'" in sql
    assert "support_tickets.approval_status = 'approved'" in sql


def test_escalation_audit_action_is_unique_per_ticket():
    constraints = {constraint.name for constraint in SupportEscalationEvent.__table__.constraints}
    assert "uq_support_escalation_action" in constraints


def test_outbound_returns_only_org_approved_school_relays():
    class Db:
        async def execute(self, query):
            sql = str(query.compile(compile_kwargs={"literal_binds": True}))
            assert "support_messages.sender_type = 'org_school_relay'" in sql
            assert "support_messages.sender_type = 'platform_admin'" not in sql
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: []))

    from app.routers import support
    original_auth = support._authenticate_school
    original_ticket = support._school_ticket

    async def auth(*_args):
        return SimpleNamespace(id=1)

    async def ticket(*_args):
        return SimpleNamespace(id=2, approval_status="approved", status="open", approval_version=1)

    support._authenticate_school = auth
    support._school_ticket = ticket
    try:
        result = asyncio.run(outbound_escalation(uuid4(), "correlation", 0, "token", Db()))
    finally:
        support._authenticate_school = original_auth
        support._school_ticket = original_ticket
    assert result["messages"] == []


class _AuthDb:
    def __init__(self, school, secret):
        self.school = school
        self.secret = secret

    async def execute(self, query):
        return SimpleNamespace(scalar_one_or_none=lambda: self.school)

    async def get(self, model, key):
        return self.secret


def test_internal_auth_accepts_exact_token_and_rejects_generically():
    school = SimpleNamespace(id=1)
    assert asyncio.run(
        _authenticate_school(_AuthDb(school, SimpleNamespace(internal_rpc_token="secret")), uuid4(), "secret")
    ) is school
    for db, token in [
        (_AuthDb(None, None), "secret"),
        (_AuthDb(school, SimpleNamespace(internal_rpc_token="secret")), "wrong"),
        (_AuthDb(school, SimpleNamespace(internal_rpc_token=None)), "secret"),
    ]:
        with pytest.raises(HTTPException) as exc:
            asyncio.run(_authenticate_school(db, uuid4(), token))
        assert exc.value.status_code == 401
        assert exc.value.detail == "invalid internal token"
