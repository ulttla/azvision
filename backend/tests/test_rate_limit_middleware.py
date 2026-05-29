from __future__ import annotations

from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import app, rate_limiter


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
