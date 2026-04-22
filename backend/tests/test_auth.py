from __future__ import annotations

from types import SimpleNamespace

import requests
import pytest
from fastapi.testclient import TestClient

from app.auth import azure_read_test
from app.auth.azure_read_test import AzureReadTestError
from app.core.config import Settings


def _http_error(detail: str) -> requests.HTTPError:
    response = requests.Response()
    response.status_code = 502
    response._content = detail.encode()
    return requests.HTTPError(detail, response=response)


def _raise(exc: Exception):
    raise exc


class TestAzureReadTest:
    def test_run_azure_read_test_wraps_http_error(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setenv("AZURE_TENANT_ID", "tenant")
        monkeypatch.setenv("AZURE_CLIENT_ID", "client")
        monkeypatch.setenv("AZURE_CERT_PATH", __file__)
        settings = Settings()

        monkeypatch.setattr(azure_read_test, "get_management_token", lambda settings: "token")
        monkeypatch.setattr(
            azure_read_test,
            "get_json",
            lambda url, token: _raise(_http_error("read test upstream exploded")),
        )

        with pytest.raises(AzureReadTestError, match="read test upstream exploded"):
            azure_read_test.run_azure_read_test(settings)


class TestAuthRoutes:
    def test_read_test_route_uses_global_azure_error_envelope(
        self,
        client: TestClient,
        monkeypatch: pytest.MonkeyPatch,
    ):
        import app.api.routes.auth as auth_routes

        monkeypatch.setattr(
            auth_routes,
            "get_settings",
            lambda: SimpleNamespace(auth_runtime_ready=True),
        )
        monkeypatch.setattr(
            auth_routes,
            "run_azure_read_test",
            lambda settings: _raise(AzureReadTestError("read test route boom")),
        )

        response = client.get("/api/v1/auth/read-test")

        assert response.status_code == 502
        assert response.json() == {
            "ok": False,
            "status": "azure-error",
            "message": "read test route boom",
        }

    def test_read_test_route_keeps_config_error_as_http_503(
        self,
        client: TestClient,
        monkeypatch: pytest.MonkeyPatch,
    ):
        import app.api.routes.auth as auth_routes

        monkeypatch.setattr(
            auth_routes,
            "get_settings",
            lambda: SimpleNamespace(auth_runtime_ready=False),
        )

        response = client.get("/api/v1/auth/read-test")

        assert response.status_code == 503
        assert response.json() == {
            "ok": False,
            "status": "http-503",
            "message": "Missing required Azure settings or certificate path is invalid. Put Azure values in project root .env or backend/.env and ensure certificate path exists.",
        }

    def test_read_test_route_keeps_unexpected_error_as_http_500(
        self,
        client: TestClient,
        monkeypatch: pytest.MonkeyPatch,
    ):
        import app.api.routes.auth as auth_routes

        monkeypatch.setattr(
            auth_routes,
            "get_settings",
            lambda: SimpleNamespace(auth_runtime_ready=True),
        )
        monkeypatch.setattr(
            auth_routes,
            "run_azure_read_test",
            lambda settings: _raise(ValueError("unexpected auth failure")),
        )

        response = client.get("/api/v1/auth/read-test")

        assert response.status_code == 500
        assert response.json() == {
            "ok": False,
            "status": "http-500",
            "message": "unexpected auth failure",
        }
