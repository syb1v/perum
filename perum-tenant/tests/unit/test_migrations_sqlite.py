from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect

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
    assert {column["name"] for column in inspector.get_columns("grades")} >= {"occurrence_id"}
