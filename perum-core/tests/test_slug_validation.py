"""Unit tests for organization domain validation + slug_from_domain (pure logic, no DB)."""

import pytest
from pydantic import ValidationError

from app.schemas.organization import OrganizationCreate, slug_from_domain


def _make(domain: str) -> OrganizationCreate:
    return OrganizationCreate(domain=domain, node_id=1, name="Test Org")


@pytest.mark.parametrize("domain", ["acme.ru", "school-edu.ru", "my.school.ru", "kuban-edu.com"])
def test_valid_domains_accepted(domain: str):
    assert _make(domain).domain == domain


def test_domain_is_lowercased_and_stripped():
    assert _make("  ACME.RU  ").domain == "acme.ru"


@pytest.mark.parametrize("domain", [
    "notadomain",
    "-acme.ru",
    "acme-.ru",
    "acme.r",
    "acme",
])
def test_malformed_domains_rejected(domain: str):
    with pytest.raises(ValidationError):
        _make(domain)


@pytest.mark.parametrize("domain,expected_slug", [
    ("acme.ru", "acme-ru"),
    ("my-school.com", "my-school-com"),
    ("edu.example.org", "edu-example-org"),
])
def test_slug_from_domain(domain: str, expected_slug: str):
    assert slug_from_domain(domain) == expected_slug
