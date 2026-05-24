"""Tests for Caddy route construction (pure, no network)."""

from app.services.caddy_admin import _build_route, route_id


def test_route_id():
    assert route_id("acme") == "perum-org-acme"


def test_build_route_shape():
    route = _build_route("acme", "acme.perum.local", "org_acme_app:3000")
    assert route["@id"] == "perum-org-acme"
    assert route["match"] == [{"host": ["acme.perum.local"]}]
    assert route["terminal"] is True
    handler = route["handle"][0]
    assert handler["handler"] == "reverse_proxy"
    assert handler["upstreams"] == [{"dial": "org_acme_app:3000"}]
