import pytest

from app.core.config import get_settings


@pytest.fixture(autouse=True)
def enable_social_rollout(monkeypatch):
    monkeypatch.setenv("SOCIAL_ROLLOUT_ENABLED", "true")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
