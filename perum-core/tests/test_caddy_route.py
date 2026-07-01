"""Tests for Caddy route construction (pure, no network)."""

from app.services.caddy_admin import _build_route, route_id


def test_route_id():
    assert route_id("acme") == "perum-org-acme"


def test_build_route_splits_api_to_app_and_rest_to_web():
    route = _build_route("acme", "acme.perum.local", "org_acme_app:3000", "perum_web:3000")
    assert route["@id"] == "perum-org-acme"
    assert route["match"] == [{"host": ["acme.perum.local"]}]
    assert route["terminal"] is True

    sub = route["handle"][0]
    assert sub["handler"] == "subroute"
    api_route, web_route = sub["routes"]

    # /api + /docs go to the org's tenant app
    assert "/api/*" in api_route["match"][0]["path"]
    assert api_route["handle"][0]["upstreams"] == [{"dial": "org_acme_app:3000"}]
    # everything else (the UI) goes to the frontend
    assert web_route["handle"][0]["upstreams"] == [{"dial": "perum_web:3000"}]
    # /internal must never be publicly routed
    assert all("/internal" not in p for p in api_route["match"][0]["path"])
