from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


def _restrictive_client() -> TestClient:
    """Fresh TestClient without the conftest wildcard override."""
    return TestClient(app, raise_server_exceptions=True)


def test_scans_list_allows_local_demo_workspace(client: TestClient):
    response = client.get("/api/v1/workspaces/local-demo/scans")

    assert response.status_code == 200
    assert response.json()["items"][0]["workspace_id"] == "local-demo"


def test_scans_list_forbids_cross_workspace_without_id_leak():
    client = _restrictive_client()
    response = client.get("/api/v1/workspaces/workspace-b/scans")

    assert response.status_code == 403
    assert response.json() == {
        "ok": False,
        "status": "http-403",
        "message": "Workspace access denied.",
    }
    assert "workspace-b" not in response.text


def test_scan_start_denies_cross_workspace_before_collecting_inventory(
    monkeypatch,
):
    client = _restrictive_client()
    import app.api.routes.scans as scans_routes

    def fail_collect_inventory(*args, **kwargs):
        raise AssertionError("collect_inventory must not run before workspace access gate")

    monkeypatch.setattr(scans_routes, "collect_inventory", fail_collect_inventory)

    response = client.post("/api/v1/workspaces/workspace-b/scans")

    assert response.status_code == 403
    assert response.json()["message"] == "Workspace access denied."
    assert "workspace-b" not in response.text
