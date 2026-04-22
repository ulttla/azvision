from __future__ import annotations

from fastapi.testclient import TestClient


class TestExportRoutes:
    def test_create_export_requires_image_data_url_with_http_400_envelope(
        self,
        client: TestClient,
    ):
        response = client.post(
            "/api/v1/workspaces/ws-export-test/exports",
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
            "/api/v1/workspaces/ws-export-test/exports",
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
        response = client.get("/api/v1/workspaces/ws-export-test/exports/missing-export")

        assert response.status_code == 404
        assert response.json() == {
            "ok": False,
            "status": "http-404",
            "message": "Export not found",
        }
