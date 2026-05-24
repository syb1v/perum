"""Unit tests for organization slug validation (pure logic, no DB)."""

import pytest
from pydantic import ValidationError

from app.schemas.organization import RESERVED_SLUGS, OrganizationCreate


def _make(slug: str) -> OrganizationCreate:
    return OrganizationCreate(slug=slug, name="Test Org")


@pytest.mark.parametrize("slug", ["acme", "acme-edu", "school45", "kuban-edu-1", "abc"])
def test_valid_slugs_accepted(slug: str):
    org = _make(slug)
    assert org.slug == slug


def test_slug_is_lowercased_and_trimmed():
    org = OrganizationCreate(slug="  ACME-Edu  ", name="Test")
    assert org.slug == "acme-edu"


@pytest.mark.parametrize("slug", sorted(RESERVED_SLUGS))
def test_reserved_slugs_rejected(slug: str):
    with pytest.raises(ValidationError, match="reserved"):
        _make(slug)


@pytest.mark.parametrize(
    "slug",
    [
        "ab",            # too short (min 3)
        "1acme",         # must start with a letter
        "acme_edu",      # underscore not allowed
        "acme.edu",      # dot not allowed
        "acme--",        # must end with letter/digit
        "ACME EDU",      # space not allowed
        "a" * 41,        # too long (max 40)
        "-acme",         # cannot start with hyphen
    ],
)
def test_malformed_slugs_rejected(slug: str):
    with pytest.raises(ValidationError):
        _make(slug)


@pytest.mark.parametrize("mode", ["shared_host", "dedicated_vm"])
def test_valid_deployment_modes(mode: str):
    org = OrganizationCreate(slug="acme", name="Test", deployment_mode=mode)
    assert org.deployment_mode == mode


def test_invalid_deployment_mode_rejected():
    with pytest.raises(ValidationError, match="deployment_mode"):
        OrganizationCreate(slug="acme", name="Test", deployment_mode="kubernetes")
