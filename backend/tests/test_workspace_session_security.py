from __future__ import annotations

import hashlib
import sqlite3
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import app


def _use_db(monkeypatch, db_path) -> None:
    monkeypatch.setenv("AZVISION_DATABASE_URL", f"sqlite:///{db_path}")
    get_settings.cache_clear()


def _seed_session(
    db_path,
    *,
    token: str,
    account_id: str = "account-a",
    workspace_id: str = "workspace-a",
    role: str = "owner",
    expires_delta: timedelta = timedelta(hours=1),
    revoked: bool = False,
    disabled: bool = False,
) -> None:
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    now = datetime.now(UTC)
    expires_at = (now + expires_delta).isoformat()
    with sqlite3.connect(str(db_path)) as conn:
        conn.execute(
            "INSERT INTO accounts(id, email, display_name, disabled_at) VALUES (?, ?, ?, ?)",
            (account_id, f"{account_id}@example.test", account_id, now.isoformat() if disabled else None),
        )
        conn.execute(
            """
            INSERT INTO sessions(id, account_id, token_hash, expires_at, revoked_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (f"session-{account_id}", account_id, token_hash, expires_at, now.isoformat() if revoked else None),
        )
        conn.execute(
            """
            INSERT INTO workspace_members(id, workspace_id, account_id, role)
            VALUES (?, ?, ?, ?)
            """,
            (f"member-{account_id}-{workspace_id}", workspace_id, account_id, role),
        )
        conn.commit()


def _client() -> TestClient:
    return TestClient(app, raise_server_exceptions=True)


def test_bearer_session_allows_member_workspace(db_path, monkeypatch):
    _use_db(monkeypatch, db_path)
    _seed_session(db_path, token="token-a", workspace_id="workspace-a")

    with _client() as client:
        response = client.get(
            "/api/v1/workspaces/workspace-a/subscriptions",
            headers={"Authorization": "Bearer token-a"},
        )

    assert response.status_code == 200
    assert response.json().get("ok") is True


def test_bearer_session_forbids_non_member_workspace(db_path, monkeypatch):
    _use_db(monkeypatch, db_path)
    _seed_session(db_path, token="token-a", workspace_id="workspace-a")

    with _client() as client:
        response = client.get(
            "/api/v1/workspaces/workspace-b/subscriptions",
            headers={"Authorization": "Bearer token-a"},
        )

    assert response.status_code == 403
    assert response.json().get("message") == "Workspace access denied."
    assert "workspace-b" not in response.text


def test_invalid_bearer_session_returns_401(db_path, monkeypatch):
    _use_db(monkeypatch, db_path)

    with _client() as client:
        response = client.get(
            "/api/v1/workspaces/local-demo/subscriptions",
            headers={"Authorization": "Bearer missing"},
        )

    assert response.status_code == 401
    assert response.json().get("message") == "Invalid or expired session."


def test_viewer_bearer_session_cannot_write(db_path, monkeypatch):
    _use_db(monkeypatch, db_path)
    _seed_session(db_path, token="viewer-token", workspace_id="workspace-a", role="viewer")

    with _client() as client:
        response = client.post(
            "/api/v1/workspaces/workspace-a/simulations",
            json={"name": "blocked"},
            headers={"Authorization": "Bearer viewer-token"},
        )

    assert response.status_code == 403
    assert response.json().get("message") == "Workspace action denied."


def test_no_bearer_keeps_local_demo_compatibility(client: TestClient):
    response = client.get("/api/v1/workspaces/local-demo/subscriptions")

    assert response.status_code == 200
    assert response.json().get("ok") is True
