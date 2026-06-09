from __future__ import annotations

import json
import sqlite3
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
                rate_limit_enabled=False,
                rate_limit_window_seconds=60,
                rate_limit_default_per_window=120,
                rate_limit_auth_per_window=20,
                rate_limit_auth_oidc_session_per_window=10,
                rate_limit_exports_per_window=30,
                rate_limit_copilot_per_window=20,
                rate_limit_shared_provider="",
                rate_limit_shared_enforced=False,
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
                rate_limit_enabled=True,
                rate_limit_window_seconds=60,
                rate_limit_default_per_window=120,
                rate_limit_auth_per_window=20,
                rate_limit_auth_oidc_session_per_window=10,
                rate_limit_exports_per_window=30,
                rate_limit_copilot_per_window=20,
                rate_limit_shared_provider="edge-provider-secret-name",
                rate_limit_shared_enforced=True,
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
        assert response.json()["checks"]["account_lifecycle"] == {
            "dev_session_enabled": False,
            "oidc_login_enabled": True,
            "account_management_enabled": False,
            "public_routes_exposure_gated": False,
        }
        assert "tenant-secret" not in response.text
        assert "client-secret-id" not in response.text
        assert "owner@example.test" not in response.text
        assert "workspace-a" not in response.text
        assert "edge-provider-secret-name" not in response.text

    def test_config_check_reports_rate_limit_readiness_without_provider_value_leak(
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
                auth_oidc_login_enabled=False,
                auth_oidc_issuer="",
                auth_oidc_audience="",
                auth_oidc_jwks_url="",
                auth_oidc_workspace_map_json="",
                rate_limit_enabled=True,
                rate_limit_window_seconds=60,
                rate_limit_default_per_window=120,
                rate_limit_auth_per_window=20,
                rate_limit_auth_oidc_session_per_window=10,
                rate_limit_exports_per_window=30,
                rate_limit_copilot_per_window=20,
                rate_limit_shared_provider="cloudflare-secret-zone",
                rate_limit_shared_enforced=True,
            ),
        )

        response = client.get("/api/v1/auth/config-check")

        assert response.status_code == 200
        assert response.json()["checks"]["rate_limit"] == {
            "app_limiter_enabled": True,
            "window_seconds_positive": True,
            "limits_positive": True,
            "configured_group_count": 5,
            "shared_provider_present": True,
            "shared_enforced": True,
            "public_beta_shared_gate_satisfied": True,
        }
        assert "cloudflare-secret-zone" not in response.text

    def test_config_check_reports_account_lifecycle_exposure_gate_inverse(
        self,
        client: TestClient,
        monkeypatch: pytest.MonkeyPatch,
    ):
        import app.api.routes.auth as auth_routes

        def settings(**overrides):
            base = {
                "auth_runtime_ready": False,
                "azure_tenant_id": "",
                "azure_client_id": "",
                "azure_certificate_path": "",
                "azure_certificate_thumbprint": "",
                "azure_cloud": "public",
                "debug": False,
                "auth_dev_session_enabled": False,
                "auth_oidc_login_enabled": False,
                "auth_oidc_issuer": "",
                "auth_oidc_audience": "",
                "auth_oidc_jwks_url": "",
                "auth_oidc_workspace_map_json": "",
                "auth_account_management_enabled": False,
                "rate_limit_enabled": False,
                "rate_limit_window_seconds": 60,
                "rate_limit_default_per_window": 120,
                "rate_limit_auth_per_window": 20,
                "rate_limit_auth_oidc_session_per_window": 10,
                "rate_limit_exports_per_window": 30,
                "rate_limit_copilot_per_window": 20,
                "rate_limit_shared_provider": "",
                "rate_limit_shared_enforced": False,
            }
            base.update(overrides)
            return SimpleNamespace(**base)

        cases = [
            ({}, True),
            ({"auth_dev_session_enabled": True}, False),
            ({"auth_oidc_login_enabled": True}, False),
            ({"auth_account_management_enabled": True}, False),
        ]
        for overrides, expected_gated in cases:
            monkeypatch.setattr(auth_routes, "get_settings", lambda overrides=overrides: settings(**overrides))
            response = client.get("/api/v1/auth/config-check")
            assert response.status_code == 200
            assert response.json()["checks"]["account_lifecycle"]["public_routes_exposure_gated"] is expected_gated

    def test_disable_own_account_is_hidden_when_management_disabled(self, client: TestClient):
        response = client.post("/api/v1/auth/account/disable")

        assert response.status_code == 404
        assert response.json()["message"] == "Not found"

    def test_disable_own_account_revokes_sessions_and_writes_non_secret_audit(
        self,
        client: TestClient,
        db_path,
        monkeypatch: pytest.MonkeyPatch,
    ):
        from app.core.config import get_settings

        monkeypatch.setenv("AZVISION_AUTH_ACCOUNT_MANAGEMENT_ENABLED", "true")
        get_settings.cache_clear()
        with sqlite3.connect(str(db_path)) as conn:
            conn.execute(
                "INSERT INTO accounts(id, email, display_name) VALUES (?, ?, ?)",
                ("test-account", "owner@example.test", "Owner Name"),
            )
            conn.execute(
                "INSERT INTO sessions(id, account_id, token_hash, expires_at) VALUES (?, ?, ?, ?)",
                ("sess-a", "test-account", "hash-a", "2099-01-01T00:00:00+00:00"),
            )
            conn.execute(
                "INSERT INTO sessions(id, account_id, token_hash, expires_at) VALUES (?, ?, ?, ?)",
                ("sess-b", "test-account", "hash-b", "2099-01-01T00:00:00+00:00"),
            )
            conn.commit()

        response = client.post(
            "/api/v1/auth/account/disable",
            headers={"X-Request-Id": "req-account-disable"},
        )

        assert response.status_code == 200
        assert response.json() == {
            "ok": True,
            "status": "disabled",
            "account_id": "test-account",
            "revoked_session_count": 2,
        }
        with sqlite3.connect(str(db_path)) as conn:
            conn.row_factory = sqlite3.Row
            account = conn.execute("SELECT * FROM accounts WHERE id = ?", ("test-account",)).fetchone()
            sessions = conn.execute("SELECT * FROM sessions WHERE account_id = ?", ("test-account",)).fetchall()
            event = conn.execute(
                "SELECT * FROM audit_events WHERE event_type = ?",
                ("auth.account.disabled",),
            ).fetchone()
        assert account["disabled_at"]
        assert all(session["revoked_at"] == account["disabled_at"] for session in sessions)
        assert event is not None
        assert event["account_id"] == "test-account"
        assert event["request_id"] == "req-account-disable"
        assert json.loads(event["metadata_json"]) == {"revoked_session_count": 2}
        assert "owner@example.test" not in event["metadata_json"]
        get_settings.cache_clear()

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
                rate_limit_enabled=False,
                rate_limit_window_seconds=60,
                rate_limit_default_per_window=120,
                rate_limit_auth_per_window=20,
                rate_limit_auth_oidc_session_per_window=10,
                rate_limit_exports_per_window=30,
                rate_limit_copilot_per_window=20,
                rate_limit_shared_provider="",
                rate_limit_shared_enforced=False,
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

