from __future__ import annotations

import json
import sqlite3

from fastapi.testclient import TestClient

from app.main import app


def _restrictive_client() -> TestClient:
    """Fresh TestClient without the conftest wildcard override."""
    return TestClient(app, raise_server_exceptions=True)


class TestExportRoutes:
    def test_create_export_writes_non_secret_audit_event(
        self,
        client: TestClient,
        db_path,
    ):
        response = client.post(
            "/api/v1/workspaces/local-demo/exports",
            json={"format": "png", "export_id": "export-a", "image_data_url": "data:image/png;base64,aGk="},
            headers={"X-Request-Id": "req-export-create"},
        )

        assert response.status_code == 200
        assert response.json()["id"] == "export-a"
        with sqlite3.connect(str(db_path)) as conn:
            conn.row_factory = sqlite3.Row
            event = conn.execute(
                "SELECT * FROM audit_events WHERE event_type = ?",
                ("export.created",),
            ).fetchone()
        assert event is not None
        assert event["workspace_id"] == "local-demo"
        assert event["account_id"] == "test-account"
        assert event["request_id"] == "req-export-create"
        assert json.loads(event["metadata_json"]) == {
            "export_id": "export-a",
            "format": "png",
            "size_bytes": 2,
        }
        assert "aGk=" not in event["metadata_json"]

    def test_create_export_requires_image_data_url_with_http_400_envelope(
        self,
        client: TestClient,
    ):
        response = client.post(
            "/api/v1/workspaces/local-demo/exports",
            json={"format": "png"},
        )

        assert response.status_code == 400
        assert response.json() == {
            "ok": False,
            "status": "http-400",
            "message": "image_data_url is required",
        }

    def test_create_export_rejects_invalid_base64_with_http_400_envelope(
        self,
        client: TestClient,
    ):
        response = client.post(
            "/api/v1/workspaces/local-demo/exports",
            json={"format": "png", "image_data_url": "data:image/png;base64,%%%"},
        )

        assert response.status_code == 400
        assert response.json() == {
            "ok": False,
            "status": "http-400",
            "message": "image_data_url is not valid base64",
        }

    def test_get_export_returns_http_404_envelope_when_missing(
        self,
        client: TestClient,
    ):
        response = client.get("/api/v1/workspaces/local-demo/exports/missing-export")

        assert response.status_code == 404
        assert response.json() == {
            "ok": False,
            "status": "http-404",
            "message": "Export not found",
        }

    def test_export_create_forbids_cross_workspace_before_payload_validation(
        self,
    ):
        client = _restrictive_client()
        response = client.post(
            "/api/v1/workspaces/workspace-b/exports",
            json={"format": "png"},
        )

        assert response.status_code == 403
        assert response.json() == {
            "ok": False,
            "status": "http-403",
            "message": "Workspace access denied.",
        }
        assert "workspace-b" not in response.text

    def test_export_list_forbids_cross_workspace_without_id_leak(
        self,
    ):
        client = _restrictive_client()
        response = client.get("/api/v1/workspaces/workspace-b/exports")

        assert response.status_code == 403
        assert response.json()["message"] == "Workspace access denied."
        assert "workspace-b" not in response.text
