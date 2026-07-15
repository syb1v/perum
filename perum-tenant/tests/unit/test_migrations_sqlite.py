from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

from app.core.config import get_settings


def test_alembic_upgrade_head_on_sqlite(tmp_path, monkeypatch) -> None:
    database = tmp_path / "tenant.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{database}")
    get_settings.cache_clear()

    config = Config("alembic.ini")
    command.upgrade(config, "head")
    get_settings.cache_clear()

    inspector = inspect(create_engine(f"sqlite:///{database}"))
    assert "lesson_occurrences" in inspector.get_table_names()
    assert {"school_social_settings", "friend_requests", "friendships", "user_blocks"} <= set(inspector.get_table_names())
    assert {index["name"] for index in inspector.get_indexes("friend_requests")} >= {"uq_friend_requests_pending_pair"}
    assert {column["name"] for column in inspector.get_columns("grades")} >= {"occurrence_id"}
    assert {"user_preferences", "idempotency_receipts"} <= set(inspector.get_table_names())
    assert {"conversations", "conversation_members", "messages"} <= set(inspector.get_table_names())
    assert "social_realtime_tickets" in inspector.get_table_names()
    assert {"media_upload_sessions", "media_objects", "media_bindings", "media_scan_results", "media_audit_events"} <= set(inspector.get_table_names())
    assert "next_scan_at" not in {column["name"] for column in inspector.get_columns("media_objects")}
    assert "scan_attempts" not in {column["name"] for column in inspector.get_columns("media_objects")}
    assert "signature" not in {column["name"] for column in inspector.get_columns("media_scan_results")}
    assert {column["name"] for column in inspector.get_columns("social_realtime_tickets")} == {"id", "school_id", "user_id", "token_digest", "created_at", "expires_at", "consumed_at"}
    assert {index["name"] for index in inspector.get_indexes("messages")} >= {"ix_messages_conversation_id", "ix_messages_expires_at"}
    assert {"support_tickets", "support_messages", "support_ticket_participants", "support_ticket_events"} <= set(inspector.get_table_names())
    assert {column["name"] for column in inspector.get_columns("notifications")} >= {"ref_type", "ref_id"}
    assert {index["name"] for index in inspector.get_indexes("support_tickets")} >= {"ix_support_tickets_inbox"}
    with inspector.bind.connect() as connection:
        user_count = connection.scalar(text("SELECT count(*) FROM users"))
        preferences_count = connection.scalar(text("SELECT count(*) FROM user_preferences"))
    assert preferences_count == user_count
