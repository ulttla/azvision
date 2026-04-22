from __future__ import annotations

import requests
import pytest
from fastapi.testclient import TestClient

from app.collectors import azure_inventory
from app.collectors.azure_inventory import AzureInventoryError
from app.core.config import Settings

WORKSPACE = "ws-inventory-test"


def _http_error(detail: str) -> requests.HTTPError:
    response = requests.Response()
    response.status_code = 502
    response._content = detail.encode()
    return requests.HTTPError(detail, response=response)


def _raise(exc: Exception):
    raise exc


class TestInventoryResolvers:
    def test_auto_mode_falls_back_to_mock_on_http_error(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setenv("TOPOLOGY_MODE", "auto")
        settings = Settings()
        monkeypatch.setattr(
            azure_inventory,
            "list_accessible_subscriptions",
            lambda settings: _raise(_http_error("azure upstream exploded")),
        )

        resolution = azure_inventory.resolve_subscription_items(settings)

        assert resolution.mode == "mock"
        assert resolution.items
        assert resolution.warning is not None
        assert "azure upstream exploded" in resolution.warning

    def test_live_mode_wraps_http_error_as_inventory_error(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setenv("TOPOLOGY_MODE", "live")
        settings = Settings()
        monkeypatch.setattr(
            azure_inventory,
            "list_accessible_subscriptions",
            lambda settings: _raise(_http_error("azure upstream exploded")),
        )

        with pytest.raises(AzureInventoryError, match="azure upstream exploded"):
            azure_inventory.resolve_subscription_items(settings)


class TestInventoryRoutes:
    def test_subscriptions_route_uses_global_azure_error_envelope(
        self,
        client: TestClient,
        monkeypatch: pytest.MonkeyPatch,
    ):
        import app.api.routes.inventory as inventory_routes

        monkeypatch.setattr(
            inventory_routes,
            "resolve_subscription_items",
            lambda settings: _raise(AzureInventoryError("inventory route boom")),
        )

        response = client.get(f"/api/v1/workspaces/{WORKSPACE}/subscriptions")

        assert response.status_code == 502
        assert response.json() == {
            "ok": False,
            "status": "azure-error",
            "message": "inventory route boom",
        }

    def test_resource_groups_route_uses_global_azure_error_envelope(
        self,
        client: TestClient,
        monkeypatch: pytest.MonkeyPatch,
    ):
        import app.api.routes.inventory as inventory_routes

        monkeypatch.setattr(
            inventory_routes,
            "resolve_resource_group_items",
            lambda settings, subscription_id=None, limit=200: _raise(
                AzureInventoryError("resource groups route boom")
            ),
        )

        response = client.get(f"/api/v1/workspaces/{WORKSPACE}/resource-groups")

        assert response.status_code == 502
        assert response.json() == {
            "ok": False,
            "status": "azure-error",
            "message": "resource groups route boom",
        }

    def test_resources_route_uses_global_azure_error_envelope(
        self,
        client: TestClient,
        monkeypatch: pytest.MonkeyPatch,
    ):
        import app.api.routes.inventory as inventory_routes

        monkeypatch.setattr(
            inventory_routes,
            "resolve_resource_items",
            lambda settings, subscription_id=None, resource_group_name=None, limit=200: _raise(
                AzureInventoryError("resources route boom")
            ),
        )

        response = client.get(f"/api/v1/workspaces/{WORKSPACE}/resources")

        assert response.status_code == 502
        assert response.json() == {
            "ok": False,
            "status": "azure-error",
            "message": "resources route boom",
        }

    def test_inventory_summary_route_uses_global_azure_error_envelope(
        self,
        client: TestClient,
        monkeypatch: pytest.MonkeyPatch,
    ):
        import app.api.routes.inventory as inventory_routes

        monkeypatch.setattr(
            inventory_routes,
            "resolve_inventory_collection",
            lambda settings, subscription_id=None, resource_group_name=None, resource_group_limit=200, resource_limit=200: _raise(
                AzureInventoryError("inventory summary route boom")
            ),
        )

        response = client.get(f"/api/v1/workspaces/{WORKSPACE}/inventory-summary")

        assert response.status_code == 502
        assert response.json() == {
            "ok": False,
            "status": "azure-error",
            "message": "inventory summary route boom",
        }
