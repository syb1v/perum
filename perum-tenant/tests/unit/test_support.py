import asyncio

from fastapi import FastAPI
import httpx
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.db import Base, get_db
from app.core.deps import get_current_user
from app.models import (
    Notification,
    Organization,
    School,
    SupportEvent,
    SupportEscalationOutbox,
    SupportEscalationReceipt,
    SupportMessage,
    SupportParticipant,
    SupportTicket,
    User,
)
from app.modules.support.router import admin_router, router


async def setup_app():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as db:
        organization = Organization(slug="support", name="Support")
        db.add(organization)
        await db.flush()
        schools = [School(org_id=organization.id, name=f"School {index}") for index in range(2)]
        db.add_all(schools)
        await db.flush()
        users = {
            "student": User(school_id=schools[0].id, role="student", login="student", password_hash="x"),
            "other": User(school_id=schools[0].id, role="parent", login="other", password_hash="x"),
            "teacher": User(school_id=schools[0].id, role="teacher", login="teacher", password_hash="x"),
            "admin": User(school_id=schools[0].id, role="school_admin", login="admin", password_hash="x"),
            "director": User(school_id=schools[0].id, role="director", login="director", password_hash="x"),
            "inactive_admin": User(school_id=schools[0].id, role="school_admin", login="inactive-admin", password_hash="x", is_active=False),
            "foreign_student": User(school_id=schools[1].id, role="student", login="foreign-student", password_hash="x"),
            "foreign_admin": User(school_id=schools[1].id, role="school_admin", login="foreign-admin", password_hash="x"),
            "org_admin": User(school_id=None, role="org_admin", login="org-admin", password_hash="x"),
        }
        db.add_all(users.values())
        await db.commit()

    app = FastAPI()
    app.include_router(router, prefix="/api")
    app.include_router(admin_router, prefix="/api/admin")

    async def db_override():
        async with sessions() as db:
            yield db

    current_user_id = {"value": users["student"].id}

    async def user_override():
        async with sessions() as db:
            return await db.get(User, current_user_id["value"])

    app.dependency_overrides[get_db] = db_override
    app.dependency_overrides[get_current_user] = user_override
    return engine, sessions, app, users, current_user_id


def ticket_payload(index=1):
    return {
        "client_ticket_id": f"ticket-{index}",
        "client_message_id": f"initial-{index}",
        "subject": f"Question {index}",
        "category": "technical",
        "body": f"Initial message {index}",
    }


async def create_ticket(client, index=1):
    response = await client.post("/api/support/tickets", json=ticket_payload(index))
    assert response.status_code == 201
    return response


def test_support_create_replay_atomicity_serialization_and_isolation():
    async def run():
        engine, sessions, app, users, current = await setup_app()
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                created = await create_ticket(client)
                body = created.json()
                assert body["replayed"] is False
                assert body["ticket"]["status"] == "open"
                assert body["ticket"]["priority"] == "normal"
                assert body["ticket"]["unread"] is False
                assert body["initial_message"]["side"] == "requester"
                assert body["initial_message"]["sender_id"] == users["student"].id
                assert body["ticket"]["created_at"]
                assert body["initial_message"]["created_at"]

                replay = await client.post("/api/support/tickets", json=ticket_payload())
                assert replay.status_code == 201
                assert replay.json()["replayed"] is True
                assert replay.json()["ticket"] == body["ticket"]
                assert replay.json()["initial_message"] == body["initial_message"]

                for field, value in (("subject", "Different"), ("category", "other"), ("body", "Different"), ("client_message_id", "different")):
                    payload = ticket_payload()
                    payload[field] = value
                    conflict = await client.post("/api/support/tickets", json=payload)
                    assert conflict.status_code == 409

                invalid = ticket_payload(9)
                invalid["body"] = "   "
                assert (await client.post("/api/support/tickets", json=invalid)).status_code == 422

                second = await create_ticket(client, 2)
                ticket_id = body["ticket"]["id"]
                second_id = second.json()["ticket"]["id"]
                own_list = await client.get("/api/support/tickets")
                assert [item["id"] for item in own_list.json()["items"]] == [second_id, ticket_id]

                current["value"] = users["other"].id
                assert (await client.get("/api/support/tickets")).json()["items"] == []
                assert (await client.get(f"/api/support/tickets/{ticket_id}")).status_code == 404
                assert (await client.get(f"/api/support/tickets/{ticket_id}/messages")).status_code == 404
                assert (await client.post(f"/api/support/tickets/{ticket_id}/messages", json={"client_message_id": "x", "body": "x"})).status_code == 404

                current["value"] = users["foreign_student"].id
                assert (await client.get("/api/support/tickets")).json()["items"] == []
                assert (await client.get(f"/api/support/tickets/{ticket_id}")).status_code == 404

                current["value"] = users["admin"].id
                admin_list = await client.get("/api/admin/support/tickets")
                assert {item["id"] for item in admin_list.json()["items"]} == {ticket_id, second_id}

                current["value"] = users["foreign_admin"].id
                assert (await client.get("/api/admin/support/tickets")).json()["items"] == []
                assert (await client.get(f"/api/admin/support/tickets/{ticket_id}")).status_code == 404

            async with sessions() as db:
                assert await db.scalar(select(func.count(SupportTicket.id))) == 2
                assert await db.scalar(select(func.count(SupportMessage.id))) == 2
                assert await db.scalar(select(func.count(SupportParticipant.id))) == 4
                assert await db.scalar(select(func.count(SupportEvent.id))) == 2
                tickets = list((await db.scalars(select(SupportTicket).order_by(SupportTicket.id))).all())
                for ticket in tickets:
                    participants = list((await db.scalars(select(SupportParticipant).where(SupportParticipant.ticket_id == ticket.id))).all())
                    assert {item.kind for item in participants} == {"requester", "shared_inbox"}
                    assert ticket.last_message_id is not None
                    assert ticket.last_message_side == "requester"
        finally:
            await engine.dispose()

    asyncio.run(run())


def test_support_replies_idempotency_status_notifications_and_closed_guard():
    async def run():
        engine, sessions, app, users, current = await setup_app()
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                created = await create_ticket(client)
                ticket_id = created.json()["ticket"]["id"]
                requester_reply = {"client_message_id": "requester-1", "body": "More details"}
                sent = await client.post(f"/api/support/tickets/{ticket_id}/messages", json=requester_reply)
                assert sent.status_code == 200
                assert sent.json()["side"] == "requester"
                replay = await client.post(f"/api/support/tickets/{ticket_id}/messages", json=requester_reply)
                assert replay.content == sent.content
                conflict = await client.post(f"/api/support/tickets/{ticket_id}/messages", json={**requester_reply, "body": "Changed"})
                assert conflict.status_code == 409

                current["value"] = users["admin"].id
                admin_reply = {"client_message_id": "admin-1", "body": "School answer"}
                answer = await client.post(f"/api/admin/support/tickets/{ticket_id}/messages", json=admin_reply)
                assert answer.status_code == 200
                assert answer.json()["side"] == "shared_inbox"
                assert (await client.get(f"/api/admin/support/tickets/{ticket_id}")).json()["status"] == "waiting_requester"
                answer_replay = await client.post(f"/api/admin/support/tickets/{ticket_id}/messages", json=admin_reply)
                assert answer_replay.content == answer.content
                assert (await client.post(f"/api/admin/support/tickets/{ticket_id}/messages", json={**admin_reply, "body": "Changed"})).status_code == 409

                current["value"] = users["student"].id
                reopened = await client.post(f"/api/support/tickets/{ticket_id}/messages", json={"client_message_id": "requester-2", "body": "Requester answer"})
                assert reopened.status_code == 200
                assert (await client.get(f"/api/support/tickets/{ticket_id}")).json()["status"] == "open"

                async with sessions() as db:
                    ticket = await db.scalar(select(SupportTicket).where(SupportTicket.public_id == ticket_id))
                    ticket.status = "resolved"
                    await db.commit()
                assert (await client.post(f"/api/support/tickets/{ticket_id}/messages", json={"client_message_id": "requester-3", "body": "Reopen resolved"})).status_code == 200
                assert (await client.get(f"/api/support/tickets/{ticket_id}")).json()["status"] == "open"

                async with sessions() as db:
                    ticket = await db.scalar(select(SupportTicket).where(SupportTicket.public_id == ticket_id))
                    ticket.status = "closed"
                    await db.commit()
                    before_messages = await db.scalar(select(func.count(SupportMessage.id)))
                    before_events = await db.scalar(select(func.count(SupportEvent.id)))
                assert (await client.post(f"/api/support/tickets/{ticket_id}/messages", json={"client_message_id": "closed", "body": "No send"})).status_code == 409
                current["value"] = users["admin"].id
                assert (await client.post(f"/api/admin/support/tickets/{ticket_id}/messages", json={"client_message_id": "closed-admin", "body": "No send"})).status_code == 409

            async with sessions() as db:
                assert await db.scalar(select(func.count(SupportMessage.id))) == before_messages
                assert await db.scalar(select(func.count(SupportEvent.id))) == before_events
                notifications = list((await db.scalars(select(Notification))).all())
                assert len(notifications) == 1
                assert notifications[0].user_id == users["student"].id
                assert notifications[0].ref_id == ticket_id
                assert notifications[0].is_read is False
        finally:
            await engine.dispose()

    asyncio.run(run())


def test_support_monotonic_reads_unread_totals_and_notification_clear():
    async def run():
        engine, sessions, app, users, current = await setup_app()
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                created = await create_ticket(client)
                ticket_id = created.json()["ticket"]["id"]
                initial_id = created.json()["initial_message"]["id"]
                await client.post(f"/api/support/tickets/{ticket_id}/messages", json={"client_message_id": "requester-1", "body": "Second requester message"})

                current["value"] = users["admin"].id
                admin_detail = await client.get(f"/api/admin/support/tickets/{ticket_id}")
                assert admin_detail.json()["unread"] is True
                assert (await client.get("/api/admin/support/unread-count")).json() == {"tickets": 1, "messages": 2, "unassigned": 1, "urgent": 0}
                thread = (await client.get(f"/api/admin/support/tickets/{ticket_id}/messages")).json()["items"]
                newest_requester_id = thread[-1]["id"]
                assert (await client.post(f"/api/admin/support/tickets/{ticket_id}/read", json={"message_id": newest_requester_id})).status_code == 204
                assert (await client.post(f"/api/admin/support/tickets/{ticket_id}/read", json={"message_id": initial_id})).status_code == 204
                assert (await client.get("/api/admin/support/unread-count")).json() == {"tickets": 0, "messages": 0, "unassigned": 1, "urgent": 0}

                first_answer = await client.post(f"/api/admin/support/tickets/{ticket_id}/messages", json={"client_message_id": "admin-1", "body": "First answer"})
                second_answer = await client.post(f"/api/admin/support/tickets/{ticket_id}/messages", json={"client_message_id": "admin-2", "body": "Second answer"})
                assert first_answer.status_code == second_answer.status_code == 200

                current["value"] = users["student"].id
                assert (await client.get("/api/support/unread-count")).json() == {"tickets": 1, "messages": 2}
                assert (await client.post(f"/api/support/tickets/{ticket_id}/read", json={"message_id": second_answer.json()["id"]})).status_code == 204
                assert (await client.post(f"/api/support/tickets/{ticket_id}/read", json={"message_id": first_answer.json()["id"]})).status_code == 204
                assert (await client.get("/api/support/unread-count")).json() == {"tickets": 0, "messages": 0}

                assert (await client.post(f"/api/support/tickets/{ticket_id}/read", json={"message_id": "00000000-0000-0000-0000-000000000000"})).status_code == 404
                assert (await client.get("/api/support/tickets/missing")).status_code == 404

            async with sessions() as db:
                notifications = list((await db.scalars(select(Notification).order_by(Notification.id))).all())
                assert len(notifications) == 2
                assert all(item.is_read for item in notifications)
                ticket = await db.scalar(select(SupportTicket).where(SupportTicket.public_id == ticket_id))
                requester = await db.scalar(select(SupportParticipant).where(SupportParticipant.ticket_id == ticket.id, SupportParticipant.kind == "requester"))
                shared = await db.scalar(select(SupportParticipant).where(SupportParticipant.ticket_id == ticket.id, SupportParticipant.kind == "shared_inbox"))
                assert requester.last_read_message_id == second_answer.json()["id"]
                assert shared.last_read_message_id == newest_requester_id
                read_events = list((await db.scalars(select(SupportEvent).where(SupportEvent.action == "ticket_read"))).all())
                assert len(read_events) == 2
        finally:
            await engine.dispose()

    asyncio.run(run())


def test_support_ticket_and_message_pagination_and_role_dependencies():
    async def run():
        engine, sessions, app, users, current = await setup_app()
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                ids = [(await create_ticket(client, index)).json()["ticket"]["id"] for index in range(1, 5)]
                first_page = await client.get("/api/support/tickets", params={"limit": 2})
                assert [item["id"] for item in first_page.json()["items"]] == list(reversed(ids[2:]))
                assert first_page.json()["next_cursor"] is not None
                second_page = await client.get("/api/support/tickets", params={"limit": 2, "cursor": first_page.json()["next_cursor"]})
                assert [item["id"] for item in second_page.json()["items"]] == list(reversed(ids[:2]))
                assert second_page.json()["next_cursor"] is None

                ticket_id = ids[0]
                for index in range(1, 5):
                    assert (await client.post(f"/api/support/tickets/{ticket_id}/messages", json={"client_message_id": f"page-{index}", "body": f"Message {index}"})).status_code == 200
                message_page = await client.get(f"/api/support/tickets/{ticket_id}/messages", params={"limit": 2})
                assert [item["body"] for item in message_page.json()["items"]] == ["Message 3", "Message 4"]
                older_page = await client.get(f"/api/support/tickets/{ticket_id}/messages", params={"limit": 2, "before": message_page.json()["next_cursor"]})
                assert [item["body"] for item in older_page.json()["items"]] == ["Message 1", "Message 2"]

                current["value"] = users["admin"].id
                assert (await client.get("/api/support/tickets")).status_code == 403
                assert (await client.get("/api/admin/support/tickets")).status_code == 200
                current["value"] = users["director"].id
                assert (await client.get("/api/admin/support/tickets")).status_code == 200
                current["value"] = users["teacher"].id
                assert (await client.get("/api/support/tickets")).status_code == 200
                assert (await client.get("/api/admin/support/tickets")).status_code == 403
                current["value"] = users["org_admin"].id
                assert (await client.get("/api/support/tickets")).status_code == 403
                assert (await client.get("/api/admin/support/tickets")).status_code == 403
        finally:
            await engine.dispose()

    asyncio.run(run())


def test_support_metadata_patch_idempotency_and_version_conflicts():
    async def run():
        engine, sessions, app, users, current = await setup_app()
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                ticket_id = (await create_ticket(client)).json()["ticket"]["id"]
                current["value"] = users["admin"].id
                payload = {
                    "client_action_id": "metadata-1",
                    "expected_version": 1,
                    "status": "in_progress",
                    "category": "academic",
                    "priority": "urgent",
                }
                patched = await client.patch(f"/api/admin/support/tickets/{ticket_id}", json=payload)
                assert patched.status_code == 200
                assert patched.json()["version"] == 2
                assert patched.json()["status"] == "in_progress"
                assert patched.json()["category"] == "academic"
                assert patched.json()["priority"] == "urgent"

                replay = await client.patch(f"/api/admin/support/tickets/{ticket_id}", json=payload)
                assert replay.status_code == 200
                assert replay.json() == patched.json()

                reused = await client.patch(f"/api/admin/support/tickets/{ticket_id}", json={**payload, "priority": "low"})
                assert reused.status_code == 409
                assert (await client.patch(f"/api/admin/support/tickets/{ticket_id}", json={**payload, "expected_version": 2})).status_code == 409

                stale = await client.patch(
                    f"/api/admin/support/tickets/{ticket_id}",
                    json={"client_action_id": "metadata-2", "expected_version": 1, "status": "resolved"},
                )
                assert stale.status_code == 409
                assert stale.json()["detail"] == {"code": "VERSION_CONFLICT", "current_version": 2}

            async with sessions() as db:
                ticket = await db.scalar(select(SupportTicket).where(SupportTicket.public_id == ticket_id))
                assert ticket.version == 2
                assert await db.scalar(select(func.count(SupportEvent.id)).where(SupportEvent.ticket_id == ticket.id, SupportEvent.action == "ticket_updated")) == 1
        finally:
            await engine.dispose()

    asyncio.run(run())


def test_support_assignment_eligibility_replay_assignees_and_events_isolation():
    async def run():
        engine, sessions, app, users, current = await setup_app()
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                ticket_id = (await create_ticket(client)).json()["ticket"]["id"]
                current["value"] = users["admin"].id

                assignees = await client.get("/api/admin/support/assignees")
                assert assignees.status_code == 200
                assert {(item["id"], item["role"]) for item in assignees.json()} == {
                    (users["admin"].id, "school_admin"),
                    (users["director"].id, "director"),
                }

                for index, user_key in enumerate(("teacher", "inactive_admin", "foreign_admin"), 1):
                    rejected = await client.post(
                        f"/api/admin/support/tickets/{ticket_id}/assign",
                        json={"client_action_id": f"rejected-{index}", "expected_version": 1, "assignee_id": users[user_key].id},
                    )
                    assert rejected.status_code == 404
                    assert rejected.json() == {"detail": "Сотрудник не найден"}

                assign = {"client_action_id": "assign-1", "expected_version": 1, "assignee_id": users["director"].id}
                assigned = await client.post(f"/api/admin/support/tickets/{ticket_id}/assign", json=assign)
                assert assigned.status_code == 200
                assert assigned.json()["version"] == 2
                replay = await client.post(f"/api/admin/support/tickets/{ticket_id}/assign", json=assign)
                assert replay.status_code == 200
                assert replay.json() == assigned.json()
                assert (await client.post(f"/api/admin/support/tickets/{ticket_id}/assign", json={**assign, "assignee_id": users["admin"].id})).status_code == 409
                assert (await client.post(f"/api/admin/support/tickets/{ticket_id}/assign", json={**assign, "expected_version": 2})).status_code == 409
                stale = await client.post(
                    f"/api/admin/support/tickets/{ticket_id}/assign",
                    json={"client_action_id": "assign-stale", "expected_version": 1, "assignee_id": users["admin"].id},
                )
                assert stale.status_code == 409
                assert stale.json()["detail"] == {"code": "VERSION_CONFLICT", "current_version": 2}

                current["value"] = users["director"].id
                unassign = {"client_action_id": "unassign-1", "expected_version": 2, "assignee_id": None}
                unassigned = await client.post(f"/api/admin/support/tickets/{ticket_id}/assign", json=unassign)
                assert unassigned.status_code == 200
                assert unassigned.json()["version"] == 3
                assert (await client.post(f"/api/admin/support/tickets/{ticket_id}/assign", json=unassign)).json() == unassigned.json()

                events = await client.get(f"/api/admin/support/tickets/{ticket_id}/events")
                assert events.status_code == 200
                assert [item["action"] for item in events.json()["items"]] == ["ticket_created", "ticket_assigned", "ticket_unassigned"]
                assert all("body" not in item and "subject" not in item for item in events.json()["items"])
                assert "Initial message" not in events.text
                assert "Question 1" not in events.text

                current["value"] = users["foreign_admin"].id
                assert (await client.get(f"/api/admin/support/tickets/{ticket_id}/events")).status_code == 404

            async with sessions() as db:
                ticket = await db.scalar(select(SupportTicket).where(SupportTicket.public_id == ticket_id))
                assert ticket.assignee_id is None
                assert ticket.version == 3
                actions = list((await db.scalars(select(SupportEvent.action).where(SupportEvent.ticket_id == ticket.id, SupportEvent.action.in_(("ticket_assigned", "ticket_unassigned"))))).all())
                assert actions == ["ticket_assigned", "ticket_unassigned"]
        finally:
            await engine.dispose()

    asyncio.run(run())


def test_support_admin_unread_extended_counts_exclude_closed_and_other_school():
    async def run():
        engine, sessions, app, users, current = await setup_app()
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                first_id = (await create_ticket(client, 1)).json()["ticket"]["id"]
                second_id = (await create_ticket(client, 2)).json()["ticket"]["id"]
                current["value"] = users["foreign_student"].id
                foreign_id = (await create_ticket(client, 3)).json()["ticket"]["id"]

                current["value"] = users["admin"].id
                assert (await client.patch(f"/api/admin/support/tickets/{first_id}", json={"client_action_id": "urgent", "expected_version": 1, "priority": "urgent"})).status_code == 200
                assert (await client.patch(f"/api/admin/support/tickets/{second_id}", json={"client_action_id": "closed", "expected_version": 1, "status": "closed", "priority": "urgent"})).status_code == 200
                assert (await client.post(f"/api/admin/support/tickets/{first_id}/assign", json={"client_action_id": "assigned", "expected_version": 2, "assignee_id": users["admin"].id})).status_code == 200

                unread = await client.get("/api/admin/support/unread-count")
                assert unread.status_code == 200
                assert unread.json() == {"tickets": 2, "messages": 2, "unassigned": 0, "urgent": 1}

                current["value"] = users["foreign_admin"].id
                foreign_unread = await client.get("/api/admin/support/unread-count")
                assert foreign_unread.json() == {"tickets": 1, "messages": 1, "unassigned": 1, "urgent": 0}
                assert (await client.get(f"/api/admin/support/tickets/{foreign_id}/events")).status_code == 200
        finally:
            await engine.dispose()

    asyncio.run(run())


def test_support_escalation_outbox_retry_redaction_pull_dedupe_and_status(monkeypatch):
    async def run():
        from app.core.config import get_settings
        from app.modules.support import escalation

        monkeypatch.setenv("SCHOOL_PUBLIC_ID", "00000000-0000-0000-0000-000000000123")
        monkeypatch.setenv("INTERNAL_RPC_TOKEN", "rpc-token")
        get_settings.cache_clear()
        engine, sessions, app, users, current = await setup_app()
        monkeypatch.setattr(escalation, "SessionLocal", sessions)
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                ticket_id = (await create_ticket(client)).json()["ticket"]["id"]
                current["value"] = users["teacher"].id
                assert (await client.post(f"/api/admin/support/tickets/{ticket_id}/escalate", json={"client_action_id": "forbidden", "expected_version": 1, "redacted_summary": "safe"})).status_code == 403
                current["value"] = users["foreign_admin"].id
                assert (await client.post(f"/api/admin/support/tickets/{ticket_id}/escalate", json={"client_action_id": "foreign", "expected_version": 1, "redacted_summary": "safe"})).status_code == 404
                current["value"] = users["admin"].id
                payload = {"client_action_id": "escalate-1", "expected_version": 1, "redacted_summary": " Explicitly redacted summary "}
                created = await client.post(f"/api/admin/support/tickets/{ticket_id}/escalate", json=payload)
                assert created.status_code == 200
                assert created.json()["escalation_status"] == "pending_delivery"
                assert created.json()["version"] == 2
                replay = await client.post(f"/api/admin/support/tickets/{ticket_id}/escalate", json=payload)
                assert replay.status_code == 200
                assert replay.json() == created.json()
                assert (await client.post(f"/api/admin/support/tickets/{ticket_id}/escalate", json={**payload, "redacted_summary": "different"})).status_code == 409
                current["value"] = users["student"].id
                closed_id = (await create_ticket(client, 2)).json()["ticket"]["id"]
                director_id = (await create_ticket(client, 3)).json()["ticket"]["id"]
                current["value"] = users["admin"].id
                assert (await client.patch(f"/api/admin/support/tickets/{closed_id}", json={"client_action_id": "close", "expected_version": 1, "status": "closed"})).status_code == 200
                assert (await client.post(f"/api/admin/support/tickets/{closed_id}/escalate", json={"client_action_id": "closed-escalation", "expected_version": 2, "redacted_summary": "safe"})).status_code == 409
                current["value"] = users["director"].id
                assert (await client.post(f"/api/admin/support/tickets/{director_id}/escalate", json={"client_action_id": "director-escalation", "expected_version": 1, "redacted_summary": "director safe summary"})).status_code == 200

            async with sessions() as db:
                outbox = await db.scalar(select(SupportEscalationOutbox).join(SupportTicket).where(SupportTicket.public_id == ticket_id))
                assert outbox.payload_json["message"] == "Explicitly redacted summary"
                assert outbox.payload_json["redacted_snapshot"] == {"category": "technical", "priority": "normal", "correlation_id": outbox.payload_json["correlation_id"]}
                serialized = str(outbox.payload_json)
                assert "Initial message" not in serialized
                assert "student" not in serialized
                assert await db.scalar(select(func.count(SupportEscalationOutbox.id))) == 2
                director_ticket = await db.scalar(select(SupportTicket).where(SupportTicket.public_id == director_id))
                await db.execute(delete(SupportEscalationOutbox).where(SupportEscalationOutbox.ticket_id == director_ticket.id))
                await db.commit()

            calls = {"intake": 0, "ack": 0}

            def handler(request: httpx.Request) -> httpx.Response:
                assert request.headers["x-internal-token"] == "rpc-token"
                if request.url.path.endswith("/escalations"):
                    calls["intake"] += 1
                    if calls["intake"] == 1:
                        return httpx.Response(503)
                    return httpx.Response(201, json={"id": 77, "approval_status": "pending", "version": 0})
                if request.url.path.endswith("/outbound/ack"):
                    calls["ack"] += 1
                    return httpx.Response(200, json={"ok": True, "cursor": 11})
                return httpx.Response(200, json={"approval_status": "approved", "status": "open", "version": 1, "messages": [{"id": 11, "public_id": "x", "sender_type": "org_school_relay", "body": "Organization answer", "created_at": "2026-07-15T12:00:00"}], "cursor": 11})

            async with AsyncClient(transport=httpx.MockTransport(handler), base_url="http://core") as core_client:
                await escalation.deliver_outbox(core_client)
                async with sessions() as db:
                    outbox = await db.scalar(select(SupportEscalationOutbox))
                    ticket = await db.scalar(select(SupportTicket).where(SupportTicket.public_id == ticket_id))
                    assert outbox.status == "error"
                    assert outbox.attempts == 1
                    assert ticket.escalation_status == "delivery_error"
                    outbox.next_attempt_at = escalation.utc_now()
                    await db.commit()
                await escalation.deliver_outbox(core_client)
                await escalation.pull_outbound(core_client)
                await escalation.pull_outbound(core_client)

            async with sessions() as db:
                ticket = await db.scalar(select(SupportTicket).where(SupportTicket.public_id == ticket_id))
                assert ticket.core_ticket_id == 77
                assert ticket.escalation_status == "approved"
                assert ticket.last_core_message_cursor == 11
                assert await db.scalar(select(func.count(SupportEscalationReceipt.id))) == 1
                organization_messages = list((await db.scalars(select(SupportMessage).where(SupportMessage.sender_snapshot == "organization_support"))).all())
                assert len(organization_messages) == 1
                assert organization_messages[0].side == "admin_inbox"
                assert organization_messages[0].sender_id is None
                notifications = list((await db.scalars(select(Notification).where(Notification.text == "Organization answer"))).all())
                assert notifications == []
                assert calls == {"intake": 2, "ack": 2}

            current["value"] = users["student"].id
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                detail = await client.get(f"/api/support/tickets/{ticket_id}")
                assert detail.json()["escalation_status"] == "approved"
                assert "core_ticket_id" not in detail.json()
                thread = await client.get(f"/api/support/tickets/{ticket_id}/messages")
                assert all(item["body"] != "Organization answer" for item in thread.json()["items"])
                current["value"] = users["admin"].id
                admin_thread = await client.get(f"/api/admin/support/tickets/{ticket_id}/messages")
                relayed = [item for item in admin_thread.json()["items"] if item["body"] == "Organization answer"]
                assert relayed == [{**relayed[0], "sender_id": None, "side": "admin_inbox", "sender_snapshot": "organization_support"}]
        finally:
            get_settings.cache_clear()
            await engine.dispose()

    asyncio.run(run())
