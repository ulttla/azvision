from __future__ import annotations

import json
import sqlite3

from fastapi.testclient import TestClient

from app.auth.oidc_login import OIDCWorkspaceSessionGrant, VerifiedOIDCIdentity, oidc_account_id
from app.core.config import get_settings
from app.main import app


def _use_db(monkeypatch, db_path) -> None:
    monkeypatch.setenv("AZVISION_DATABASE_URL", f"sqlite:///{db_path}")
    get_settings.cache_clear()


def _client() -> TestClient:
    return TestClient(app, raise_server_exceptions=True)


def test_oidc_session_route_disabled_by_default(db_path, monkeypatch):
    _use_db(monkeypatch, db_path)
    monkeypatch.delenv("AZVISION_AUTH_OIDC_LOGIN_ENABLED", raising=False)
    get_settings.cache_clear()

    with _client() as client:
        response = client.post("/api/v1/auth/oidc/session", json={"id_token": "opaque"})

    assert response.status_code == 404


def test_oidc_session_enabled_but_unconfigured_fails_closed(db_path, monkeypatch):
    _use_db(monkeypatch, db_path)
    monkeypatch.setenv("AZVISION_AUTH_OIDC_LOGIN_ENABLED", "true")
    get_settings.cache_clear()

    with _client() as client:
        response = client.post(
            "/api/v1/auth/oidc/session",
            json={"id_token": "opaque", "workspace_id": "workspace-a"},
            headers={"X-Request-ID": "req-oidc-failed"},
        )

    assert response.status_code == 503
    assert response.json().get("message") == "OIDC login is not configured."
    with sqlite3.connect(str(db_path)) as conn:
        conn.row_factory = sqlite3.Row
        session_count = conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]
        event = conn.execute(
            "SELECT * FROM audit_events WHERE event_type = ?",
            ("auth.oidc_session.failed",),
        ).fetchone()
    assert session_count == 0
    assert event is not None
    assert event["workspace_id"] == "workspace-a"
    assert event["request_id"] == "req-oidc-failed"
    assert json.loads(event["metadata_json"]) == {"reason": "not_configured"}
    assert "opaque" not in event["metadata_json"]


def test_oidc_session_success_uses_verified_identity_and_never_echoes_id_token(db_path, monkeypatch):
    _use_db(monkeypatch, db_path)
    monkeypatch.setenv("AZVISION_AUTH_OIDC_LOGIN_ENABLED", "true")
    get_settings.cache_clear()

    import app.api.routes.auth as auth_routes

    identity = VerifiedOIDCIdentity(
        issuer="https://login.example.test",
        subject="subject-a",
        email="owner@example.test",
        display_name="Owner",
    )
    account_id = oidc_account_id(issuer=identity.issuer, subject=identity.subject)

    monkeypatch.setattr(auth_routes, "verify_oidc_id_token", lambda settings, token: identity)
    monkeypatch.setattr(
        auth_routes,
        "resolve_oidc_workspace_grant",
        lambda settings, verified, requested_workspace_id, payload: OIDCWorkspaceSessionGrant(
            account_id=account_id,
            email=verified.email,
            workspace_id=requested_workspace_id or "workspace-a",
            role="owner",
            display_name=verified.display_name,
        ),
    )

    with _client() as client:
        response = client.post(
            "/api/v1/auth/oidc/session",
            json={"id_token": "raw-id-token", "workspace_id": "workspace-a"},
            headers={"X-Request-Id": "req-oidc"},
        )
        token = response.json()["token"]
        allowed = client.get(
            "/api/v1/workspaces/workspace-a/subscriptions",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 200
    assert response.json()["account_id"] == account_id
    assert response.json()["workspace_id"] == "workspace-a"
    assert allowed.status_code == 200
    assert "raw-id-token" not in response.text
    with sqlite3.connect(str(db_path)) as conn:
        conn.row_factory = sqlite3.Row
        event = conn.execute(
            "SELECT * FROM audit_events WHERE event_type = ?",
            ("auth.oidc_session.created",),
        ).fetchone()
    assert event is not None
    assert event["account_id"] == account_id
    assert event["request_id"] == "req-oidc"
    assert json.loads(event["metadata_json"]) == {
        "issuer": "https://login.example.test",
        "subject_hash": account_id,
    }
    assert "raw-id-token" not in event["metadata_json"]
