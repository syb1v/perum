"""Tests for stack spec building + compose rendering (pure, no docker/db)."""

from app.core.config import Settings
from app.models import Organization, OrganizationSecret
from app.services.stack_spec import (
    build_stack_spec,
    container_name,
    project_name,
    render_compose,
    volume_name,
)


def _spec():
    org = Organization(slug="acme", name="Acme Education")
    org.id = 1
    secret = OrganizationSecret(
        org_id=1,
        db_password="dbpw-secret",
        secret_key="app-secret-key",
        telemetry_token="telemetry-secret",
        redis_db_index=3,
    )
    settings = Settings(IMAGE_REGISTRY="mirror.gcr.io", TENANT_IMAGE="perum-tenant:dev")
    return build_stack_spec(org, secret, settings)


def test_naming_helpers():
    assert container_name("acme", "app") == "org_acme_app"
    assert container_name("acme", "db") == "org_acme_db"
    assert volume_name("acme") == "org_acme_data"
    assert project_name("acme") == "org_acme"


def test_build_stack_spec_resolves_images_and_urls():
    spec = _spec()
    assert spec.app_container == "org_acme_app"
    assert spec.db_container == "org_acme_db"
    assert spec.volume == "org_acme_data"
    assert spec.postgres_image == "mirror.gcr.io/library/postgres:15-alpine"
    assert spec.tenant_image == "perum-tenant:dev"
    assert spec.database_url == "postgresql://perum:dbpw-secret@org_acme_db:5432/perum"
    assert spec.redis_url.endswith("/3")
    assert spec.app_env["ORG_SLUG"] == "acme"
    assert spec.app_env["SECRET_KEY"] == "app-secret-key"


def test_render_compose_contains_key_fields():
    out = render_compose(_spec())
    assert "name: org_acme" in out
    assert "container_name: org_acme_app" in out
    assert "container_name: org_acme_db" in out
    assert "image: perum-tenant:dev" in out
    assert "image: mirror.gcr.io/library/postgres:15-alpine" in out
    assert "org_acme_data:/var/lib/postgresql/data" in out
    assert "external: true" in out
    assert "dbpw-secret" in out  # secrets present when not redacted


def test_render_compose_can_redact_secrets():
    out = render_compose(_spec(), redact_secrets=True)
    assert "dbpw-secret" not in out
    assert "app-secret-key" not in out
    assert "telemetry-secret" not in out
    assert "***" in out
