from __future__ import annotations

import hashlib
import json
import sqlite3
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import app


def _use_db(monkeypatch, db_path) -> None:
    monkeypatch.setenv("AZVISION_DATABASE_URL", f"sqlite:///{db_path}")
    get_settings.cache_clear()


def _seed_session(db_path, *, token: str, role: str = "owner", workspace_id: str = "workspace-a") -> None:
    account_id = f"account-{role}"
    now = datetime.now(UTC)
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    with sqlite3.connect(str(db_path)) as conn:
        conn.execute(
            "INSERT INTO accounts(id, email, display_name) VALUES (?, ?, ?)",
            (account_id, f"{account_id}@example.test", account_id),
        )
        conn.execute(
            "INSERT INTO sessions(id, account_id, token_hash, expires_at) VALUES (?, ?, ?, ?)",
            (f"session-{role}", account_id, token_hash, (now + timedelta(hours=1)).isoformat()),
        )
        conn.execute(
            "INSERT INTO workspace_members(id, workspace_id, account_id, role) VALUES (?, ?, ?, ?)",
            (f"member-{role}", workspace_id, account_id, role),
        )
        conn.commit()


def _client() -> TestClient:
    return TestClient(app, raise_server_exceptions=True)


def test_owner_can_create_and_list_credential_profile_without_plain_secret(db_path, monkeypatch):
    _use_db(monkeypatch, db_path)
    _seed_session(db_path, token="owner-token")

    with _client() as client:
        created = client.post(
            "/api/v1/workspaces/workspace-a/credential-profiles",
            json={
                "id": "cred-a",
                "provider": "azure",
                "auth_type": "certificate",
                "secret_ref": "secret://azvision/workspace-a/cred-a",
                "metadata": {"tenant_id": "tenant-a"},
            },
            headers={"Authorization": "Bearer owner-token", "X-Request-Id": "req-cred-create"},
        )
        listed = client.get(
            "/api/v1/workspaces/workspace-a/credential-profiles",
            headers={"Authorization": "Bearer owner-token"},
        )

    assert created.status_code == 200
    assert created.json()["owner_account_id"] == "account-owner"
    assert created.json()["secret_ref"] == "secret://azvision/workspace-a/cred-a"
    assert created.json()["metadata"] == {"tenant_id": "tenant-a"}
    assert listed.status_code == 200
    assert listed.json()["items"][0]["id"] == "cred-a"
    assert "PRIVATE KEY" not in created.text
    assert "password" not in created.text.lower()
    with sqlite3.connect(str(db_path)) as conn:
        conn.row_factory = sqlite3.Row
        event = conn.execute(
            "SELECT * FROM audit_events WHERE event_type = ?",
            ("credential_profile.created",),
        ).fetchone()
    assert event is not None
    assert event["workspace_id"] == "workspace-a"
    assert event["account_id"] == "account-owner"
    assert event["request_id"] == "req-cred-create"
    assert json.loads(event["metadata_json"]) == {
        "auth_type": "certificate",
        "credential_profile_id": "cred-a",
        "provider": "azure",
    }


def test_viewer_cannot_create_credential_profile(db_path, monkeypatch):
    _use_db(monkeypatch, db_path)
    _seed_session(db_path, token="viewer-token", role="viewer")

    with _client() as client:
        response = client.post(
            "/api/v1/workspaces/workspace-a/credential-profiles",
            json={"secret_ref": "secret://pointer", "metadata": {}},
            headers={"Authorization": "Bearer viewer-token"},
        )

    assert response.status_code == 403
    assert response.json().get("message") == "Workspace action denied."


def test_credential_profile_rejects_secret_metadata_values(db_path, monkeypatch):
    _use_db(monkeypatch, db_path)
    _seed_session(db_path, token="owner-token")

    with _client() as client:
        response = client.post(
            "/api/v1/workspaces/workspace-a/credential-profiles",
            json={
                "secret_ref": "secret://pointer",
                "metadata": {"client_secret": "must-not-store"},
            },
            headers={"Authorization": "Bearer owner-token"},
        )

    assert response.status_code == 400
    assert "must-not-store" not in response.text


def test_cross_workspace_credential_profiles_denied_without_leak(db_path, monkeypatch):
    _use_db(monkeypatch, db_path)
    _seed_session(db_path, token="owner-token", workspace_id="workspace-a")

    with _client() as client:
        response = client.get(
            "/api/v1/workspaces/workspace-b/credential-profiles",
            headers={"Authorization": "Bearer owner-token"},
        )

    assert response.status_code == 403
    assert response.json().get("message") == "Workspace access denied."
    assert "workspace-b" not in response.text
