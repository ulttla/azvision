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

    def test_read_test_route_keeps_unexpected_error_detail_in_debug_mode(
        self,
        client: TestClient,
        monkeypatch: pytest.MonkeyPatch,
    ):
        import app.api.routes.auth as auth_routes
        import app.main as main

        monkeypatch.setattr(main.settings, "debug", True)
        monkeypatch.setattr(
            auth_routes,
            "get_settings",
            lambda: SimpleNamespace(auth_runtime_ready=True, debug=True),
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

    def test_read_test_route_hides_unexpected_error_detail_when_debug_disabled(
        self,
        client: TestClient,
        monkeypatch: pytest.MonkeyPatch,
    ):
        import app.api.routes.auth as auth_routes
        import app.main as main

        monkeypatch.setattr(main.settings, "debug", False)
        monkeypatch.setattr(
            auth_routes,
            "get_settings",
            lambda: SimpleNamespace(auth_runtime_ready=True, debug=False),
        )
        monkeypatch.setattr(
            auth_routes,
            "run_azure_read_test",
            lambda settings: _raise(ValueError("secret upstream traceback")),
        )

        response = client.get("/api/v1/auth/read-test")

        assert response.status_code == 500
        assert response.json() == {
            "ok": False,
            "status": "http-500",
            "message": "Internal server error",
        }
        assert "secret upstream traceback" not in response.text
    def test_config_check_hides_local_env_paths_when_debug_disabled(
        self,
        client: TestClient,
        monkeypatch: pytest.MonkeyPatch,
    ):
        import app.api.routes.auth as auth_routes

        monkeypatch.setattr(
            auth_routes,
            "get_settings",
            lambda: SimpleNamespace(
                auth_runtime_ready=True,
                azure_tenant_id="tenant",
                azure_client_id="client",
                azure_certificate_path="/private/path/cert.pem",
                certificate_path_exists=True,
                azure_certificate_thumbprint="thumbprint",
                azure_certificate_password="password",
                azure_cloud="public",
                debug=False,
                env_file_candidates=["/private/project/.env"],
                discovered_env_files=["/private/project/.env"],
            ),
        )

        response = client.get("/api/v1/auth/config-check")

        assert response.status_code == 200
        payload = response.json()
        assert payload["auth_ready"] is True
        assert "diagnostics" not in payload
        assert "env_file_candidates" not in payload["checks"]
        assert "discovered_env_files" not in payload["checks"]
        assert "certificate_path_exists" not in payload["checks"]
        assert "certificate_password_present" not in payload["checks"]
        assert "/private/project/.env" not in response.text
        assert "password" not in response.text

    def test_config_check_reports_oidc_readiness_without_provider_value_leak(
        self,
        client: TestClient,
        monkeypatch: pytest.MonkeyPatch,
    ):
        import app.api.routes.auth as auth_routes

        monkeypatch.setattr(
            auth_routes,
            "get_settings",
            lambda: SimpleNamespace(
                auth_runtime_ready=False,
                azure_tenant_id="",
                azure_client_id="",
                azure_certificate_path="",
                azure_certificate_thumbprint="",
                azure_cloud="public",
                debug=False,
                auth_oidc_login_enabled=True,
                auth_oidc_issuer="https://login.example.test/tenant-secret",
                auth_oidc_audience="client-secret-id",
                auth_oidc_jwks_url="https://login.example.test/keys-secret",
                auth_oidc_workspace_map_json=(
                    '{"users":{"owner@example.test":{"workspaces":[{"workspace_id":"workspace-a","role":"owner"}]}}}'
                ),
            ),
        )

        response = client.get("/api/v1/auth/config-check")

        assert response.status_code == 200
        oidc = response.json()["checks"]["oidc"]
        assert oidc == {
            "login_enabled": True,
            "issuer_present": True,
            "audience_present": True,
            "jwks_url_present": True,
            "workspace_map_present": True,
            "workspace_map_valid": True,
            "mapped_user_count": 1,
            "grant_count": 1,
        }
        assert "tenant-secret" not in response.text
        assert "client-secret-id" not in response.text
        assert "owner@example.test" not in response.text
        assert "workspace-a" not in response.text

    def test_config_check_keeps_local_env_path_diagnostics_in_debug_mode(
        self,
        client: TestClient,
        monkeypatch: pytest.MonkeyPatch,
    ):
        import app.api.routes.auth as auth_routes

        monkeypatch.setattr(
            auth_routes,
            "get_settings",
            lambda: SimpleNamespace(
                auth_runtime_ready=False,
                azure_tenant_id="",
                azure_client_id="",
                azure_certificate_path="",
                certificate_path_exists=False,
                azure_certificate_thumbprint="",
                azure_certificate_password="",
                azure_cloud="public",
                debug=True,
                env_file_candidates=["/private/project/.env"],
                discovered_env_files=["/private/project/.env"],
            ),
        )

        response = client.get("/api/v1/auth/config-check")

        assert response.status_code == 200
        payload = response.json()
        assert payload["checks"]["certificate_path_exists"] is False
        assert payload["checks"]["certificate_password_present"] is False
        assert payload["diagnostics"] == {
            "env_file_candidates": ["/private/project/.env"],
            "discovered_env_files": ["/private/project/.env"],
        }

