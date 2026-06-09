from __future__ import annotations

from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.api.rate_limiter import rate_limit_readiness_summary, route_limit_group
from app.core.config import get_settings
from app.main import app, rate_limiter


def test_route_limit_group_contract_covers_public_beta_route_groups():
    assert route_limit_group("/api/v1/auth/oidc/session") == "auth_oidc_session"
    assert route_limit_group("/api/v1/auth/config-check") == "auth"
    assert route_limit_group("/api/v1/workspaces/local-demo/exports") == "exports"
    assert route_limit_group("/api/v1/copilot/chat") == "copilot"
    assert route_limit_group("/api/v1/workspaces/local-demo/chat") == "copilot"
    assert route_limit_group("/api/v1/workspaces/local-demo/topology") == "default"


def test_rate_limit_readiness_requires_provider_and_enforcement():
    base = {
        "rate_limit_enabled": True,
        "rate_limit_window_seconds": 60,
        "rate_limit_default_per_window": 120,
        "rate_limit_auth_per_window": 20,
        "rate_limit_auth_oidc_session_per_window": 10,
        "rate_limit_exports_per_window": 30,
        "rate_limit_copilot_per_window": 20,
    }

    provider_only = rate_limit_readiness_summary(
        SimpleNamespace(**base, rate_limit_shared_provider="edge-gateway", rate_limit_shared_enforced=False)
    )
    enforced_only = rate_limit_readiness_summary(
        SimpleNamespace(**base, rate_limit_shared_provider="", rate_limit_shared_enforced=True)
    )
    shared_ready = rate_limit_readiness_summary(
        SimpleNamespace(**base, rate_limit_shared_provider="edge-gateway", rate_limit_shared_enforced=True)
    )

    assert provider_only["shared_provider_present"] is True
    assert provider_only["shared_enforced"] is False
    assert provider_only["public_beta_shared_gate_satisfied"] is False
    assert enforced_only["shared_provider_present"] is False
    assert enforced_only["shared_enforced"] is True
    assert enforced_only["public_beta_shared_gate_satisfied"] is False
    assert shared_ready["public_beta_shared_gate_satisfied"] is True


def test_rate_limit_disabled_by_default(client: TestClient):
    first = client.get("/api/v1/auth/config-check")
    second = client.get("/api/v1/auth/config-check")

    assert first.status_code == 200
    assert second.status_code == 200


def test_rate_limit_enabled_returns_stable_429(monkeypatch, db_path):
    monkeypatch.setenv("AZVISION_DATABASE_URL", f"sqlite:///{db_path}")
    monkeypatch.setenv("AZVISION_RATE_LIMIT_ENABLED", "true")
    monkeypatch.setenv("AZVISION_RATE_LIMIT_AUTH_PER_WINDOW", "1")
    monkeypatch.setenv("AZVISION_RATE_LIMIT_WINDOW_SECONDS", "60")
    get_settings.cache_clear()
    rate_limiter.buckets.clear()

    try:
        with TestClient(app, raise_server_exceptions=True) as client:
            first = client.get("/api/v1/auth/config-check", headers={"X-Request-ID": "req-rate-limit"})
            second = client.get("/api/v1/auth/config-check", headers={"X-Request-ID": "req-rate-limit"})
    finally:
        get_settings.cache_clear()
        rate_limiter.buckets.clear()

    assert first.status_code == 200
    assert second.status_code == 429
    assert second.headers["X-Request-ID"] == "req-rate-limit"
    assert second.headers["Retry-After"]
    assert second.json() == {
        "ok": False,
        "status": "rate-limited",
        "message": "Too many requests. Please retry later.",
    }


def test_oidc_session_rate_limit_has_separate_bucket(monkeypatch, db_path):
    monkeypatch.setenv("AZVISION_DATABASE_URL", f"sqlite:///{db_path}")
    monkeypatch.setenv("AZVISION_RATE_LIMIT_ENABLED", "true")
    monkeypatch.setenv("AZVISION_RATE_LIMIT_AUTH_PER_WINDOW", "100")
    monkeypatch.setenv("AZVISION_RATE_LIMIT_AUTH_OIDC_SESSION_PER_WINDOW", "1")
    monkeypatch.setenv("AZVISION_RATE_LIMIT_WINDOW_SECONDS", "60")
    get_settings.cache_clear()
    rate_limiter.buckets.clear()

    try:
        with TestClient(app, raise_server_exceptions=True) as client:
            first = client.post("/api/v1/auth/oidc/session", json={"id_token": "opaque"})
            second = client.post("/api/v1/auth/oidc/session", json={"id_token": "opaque"})
            config_check = client.get("/api/v1/auth/config-check")
    finally:
        get_settings.cache_clear()
        rate_limiter.buckets.clear()

    assert first.status_code == 404
    assert second.status_code == 429
    assert config_check.status_code == 200
