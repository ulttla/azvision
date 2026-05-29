from __future__ import annotations

import json
import sqlite3

from fastapi.testclient import TestClient

from app.api.routes.workspaces import get_workspace_access_context
from app.api.workspace_security import WorkspaceAccessContext, WorkspaceMembership
from app.main import app


def _restrictive_client() -> TestClient:
    """Fresh TestClient without the conftest wildcard override."""
    return TestClient(app, raise_server_exceptions=True)


def test_default_workspace_route_allows_local_demo_owner(client: TestClient):
    response = client.get("/api/v1/workspaces/local-demo")

    assert response.status_code == 200
    assert response.json()["id"] == "local-demo"


def test_default_workspace_route_forbids_cross_workspace_without_id_leak():
    client = _restrictive_client()
    response = client.get("/api/v1/workspaces/workspace-b")

    assert response.status_code == 403
    assert response.json() == {
        "ok": False,
        "status": "http-403",
        "message": "Workspace access denied.",
    }
    assert "workspace-b" not in response.text


def test_workspace_patch_writes_non_secret_audit_event(client: TestClient, db_path):
    response = client.patch(
        "/api/v1/workspaces/local-demo",
        json={"name": "Updated", "description": "Changed"},
        headers={"X-Request-Id": "req-workspace-update"},
    )

    assert response.status_code == 200
    with sqlite3.connect(str(db_path)) as conn:
        conn.row_factory = sqlite3.Row
        event = conn.execute(
            "SELECT * FROM audit_events WHERE event_type = ?",
            ("workspace.updated",),
        ).fetchone()
    assert event is not None
    assert event["workspace_id"] == "local-demo"
    assert event["account_id"] == "test-account"
    assert event["request_id"] == "req-workspace-update"
    assert json.loads(event["metadata_json"]) == {"fields": ["description", "name"]}
    assert "Updated" not in event["metadata_json"]
    assert "Changed" not in event["metadata_json"]


def test_workspace_create_writes_non_secret_audit_event(client: TestClient, db_path):
    response = client.post(
        "/api/v1/workspaces",
        json={"id": "local-demo", "name": "Created"},
        headers={"X-Request-Id": "req-workspace-create"},
    )

    assert response.status_code == 200
    with sqlite3.connect(str(db_path)) as conn:
        conn.row_factory = sqlite3.Row
        event = conn.execute(
            "SELECT * FROM audit_events WHERE event_type = ?",
            ("workspace.created",),
        ).fetchone()
    assert event is not None
    assert event["workspace_id"] == "local-demo"
    assert event["account_id"] == "test-account"
    assert event["request_id"] == "req-workspace-create"
    assert json.loads(event["metadata_json"]) == {"fields": ["id", "name"]}
    assert "Created" not in event["metadata_json"]


def test_viewer_dependency_override_cannot_patch_workspace(client: TestClient):
    def viewer_context() -> WorkspaceAccessContext:
        return WorkspaceAccessContext(
            account_id="acct-viewer",
            memberships=(
                WorkspaceMembership(
                    workspace_id="local-demo",
                    account_id="acct-viewer",
                    role="viewer",
                ),
            ),
        )

    app.dependency_overrides[get_workspace_access_context] = viewer_context
    try:
        response = client.patch("/api/v1/workspaces/local-demo", json={"name": "Blocked"})
    finally:
        app.dependency_overrides.pop(get_workspace_access_context, None)

    assert response.status_code == 403
    assert response.json()["message"] == "Workspace action denied."


def test_workspace_create_cannot_escape_local_membership():
    client = _restrictive_client()
    response = client.post("/api/v1/workspaces", json={"id": "workspace-b", "name": "Other"})

    assert response.status_code == 403
    assert response.json()["message"] == "Workspace access denied."
    assert "workspace-b" not in response.text
