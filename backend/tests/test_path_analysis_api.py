"""Tests for the path analysis API endpoint.

Uses the mock inventory (TOPOLOGY_MODE=mock) set by the conftest client fixture.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.collectors.azure_inventory import AzureInventoryCollection, InventoryResolution
import app.api.routes.path_analysis as path_analysis_routes

WORKSPACE = "ws-path-analysis-test"


class TestPathAnalysisGet:
    def test_returns_200_with_verdict(self, client: TestClient):
        """Path analysis endpoint returns valid structure for known resources."""
        # First, get the topology to find resource IDs from mock data
        topo = client.get(f"/api/v1/workspaces/{WORKSPACE}/topology").json()
        resource_nodes = [n for n in topo["nodes"] if n["node_type"] == "resource"]
        if len(resource_nodes) < 2:
            pytest.skip("Not enough mock resources for path analysis test")

        source_id = resource_nodes[0]["node_ref"]
        dest_id = resource_nodes[1]["node_ref"]

        resp = client.get(
            f"/api/v1/workspaces/{WORKSPACE}/path-analysis",
            params={
                "source_resource_id": source_id,
                "destination_resource_id": dest_id,
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["ok"] is True
        assert "overall_verdict" in body
        assert "path_candidates" in body
        assert "warnings" in body
        assert body["source_resource_id"] == source_id
        assert body["destination_resource_id"] == dest_id

    def test_unknown_resources_returns_unknown_verdict(self, client: TestClient):
        """Path analysis with non-existent resources returns UNKNOWN."""
        resp = client.get(
            f"/api/v1/workspaces/{WORKSPACE}/path-analysis",
            params={
                "source_resource_id": "/subscriptions/missing/vms/test",
                "destination_resource_id": "/subscriptions/missing/storage/test",
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["overall_verdict"] == "unknown"
        assert len(body["path_candidates"]) == 0

    def test_verdict_is_valid_enum_value(self, client: TestClient):
        """Overall verdict is one of the allowed enum values."""
        topo = client.get(f"/api/v1/workspaces/{WORKSPACE}/topology").json()
        resource_nodes = [n for n in topo["nodes"] if n["node_type"] == "resource"]
        if len(resource_nodes) < 2:
            pytest.skip("Not enough mock resources")

        source_id = resource_nodes[0]["node_ref"]
        dest_id = resource_nodes[1]["node_ref"]

        resp = client.get(
            f"/api/v1/workspaces/{WORKSPACE}/path-analysis",
            params={
                "source_resource_id": source_id,
                "destination_resource_id": dest_id,
            },
        )
        body = resp.json()
        assert body["overall_verdict"] in ("allowed", "blocked", "unknown")

    def test_protocol_and_port_query_params_are_accepted(self, client: TestClient):
        """Optional protocol/source/destination port filters are part of the API contract."""
        topo = client.get(f"/api/v1/workspaces/{WORKSPACE}/topology").json()
        resource_nodes = [n for n in topo["nodes"] if n["node_type"] == "resource"]
        if len(resource_nodes) < 2:
            pytest.skip("Not enough mock resources")

        resp = client.get(
            f"/api/v1/workspaces/{WORKSPACE}/path-analysis",
            params={
                "source_resource_id": resource_nodes[0]["node_ref"],
                "destination_resource_id": resource_nodes[1]["node_ref"],
                "protocol": "Tcp",
                "source_address_prefix": "10.0.0.4/32",
                "destination_address_prefix": "10.1.0.5/32",
                "source_port": "50000",
                "destination_port": "443",
            },
        )
        assert resp.status_code == 200
        assert resp.json()["overall_verdict"] in ("allowed", "blocked", "unknown")

    def test_hop_structure_when_path_found(self, client: TestClient):
        """When a path is found, hops have the expected structure including outbound fields."""
        topo = client.get(f"/api/v1/workspaces/{WORKSPACE}/topology").json()
        resource_nodes = [n for n in topo["nodes"] if n["node_type"] == "resource"]
        if len(resource_nodes) < 2:
            pytest.skip("Not enough mock resources")

        source_id = resource_nodes[0]["node_ref"]
        dest_id = resource_nodes[1]["node_ref"]

        resp = client.get(
            f"/api/v1/workspaces/{WORKSPACE}/path-analysis",
            params={
                "source_resource_id": source_id,
                "destination_resource_id": dest_id,
            },
        )
        body = resp.json()
        if body["path_candidates"]:
            candidate = body["path_candidates"][0]
            assert "verdict" in candidate
            assert "hops" in candidate
            assert "reason" in candidate
            if candidate["hops"]:
                hop = candidate["hops"][0]
                assert "resource_id" in hop
                assert "hop_type" in hop
                assert "display_name" in hop
                # New outbound NSG fields should be present (may be null)
                # The API should not break with new fields
                assert isinstance(hop.get("nsg_direction"), (str, type(None)))
                assert isinstance(hop.get("nsg_outbound_verdict"), (str, type(None)))
                assert isinstance(hop.get("route_next_hop_type"), (str, type(None)))
                assert isinstance(hop.get("route_next_hop_ip"), (str, type(None)))

    def test_source_port_param_accepted(self, client: TestClient):
        """Source port parameter is accepted and doesn't break the API."""
        topo = client.get(f"/api/v1/workspaces/{WORKSPACE}/topology").json()
        resource_nodes = [n for n in topo["nodes"] if n["node_type"] == "resource"]
        if len(resource_nodes) < 2:
            pytest.skip("Not enough mock resources")

        resp = client.get(
            f"/api/v1/workspaces/{WORKSPACE}/path-analysis",
            params={
                "source_resource_id": resource_nodes[0]["node_ref"],
                "destination_resource_id": resource_nodes[1]["node_ref"],
                "source_port": "50000",
                "destination_port": "443",
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["ok"] is True
        assert body["overall_verdict"] in ("allowed", "blocked", "unknown")

def _api_resource(resource_id: str, resource_type: str, properties: dict | None = None) -> dict:
    return {
        "subscription_id": "00000000-0000-0000-0000-000000000001",
        "resource_group": "rg-network",
        "name": resource_id.rstrip("/").split("/")[-1],
        "type": resource_type,
        "id": resource_id,
        "properties": properties or {},
        "source": "azure",
    }


def test_source_port_changes_verdict_round_trip(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    """API-level source_port should flow through to NSG verdict calculation."""
    base = "/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/rg-network/providers"
    vnet_id = f"{base}/Microsoft.Network/virtualNetworks/vnet-app"
    subnet_id = f"{vnet_id}/subnets/snet-app"
    nsg_id = f"{base}/Microsoft.Network/networkSecurityGroups/nsg-app"
    nic_id = f"{base}/Microsoft.Network/networkInterfaces/nic-app"
    vm_id = f"{base}/Microsoft.Compute/virtualMachines/vm-app"
    resources = [
        _api_resource(vnet_id, "Microsoft.Network/virtualNetworks", {"subnets": [{"id": subnet_id}]}),
        _api_resource(subnet_id, "Microsoft.Network/virtualNetworks/subnets", {"networkSecurityGroup": {"id": nsg_id}}),
        _api_resource(
            nsg_id,
            "Microsoft.Network/networkSecurityGroups",
            {
                "securityRules": [
                    {
                        "name": "deny-admin-source",
                        "properties": {
                            "direction": "Inbound",
                            "access": "Deny",
                            "priority": 100,
                            "sourceAddressPrefix": "*",
                            "destinationAddressPrefix": "*",
                            "sourcePortRange": "12345",
                            "destinationPortRange": "443",
                            "protocol": "Tcp",
                        },
                    },
                    {
                        "name": "allow-ephemeral-source",
                        "properties": {
                            "direction": "Inbound",
                            "access": "Allow",
                            "priority": 200,
                            "sourceAddressPrefix": "*",
                            "destinationAddressPrefix": "*",
                            "sourcePortRange": "49152-65535",
                            "destinationPortRange": "443",
                            "protocol": "Tcp",
                        },
                    },
                ],
                "subnets": [{"id": subnet_id}],
            },
        ),
        _api_resource(
            nic_id,
            "Microsoft.Network/networkInterfaces",
            {"ipConfigurations": [{"name": "ipconfig1", "properties": {"subnet": {"id": subnet_id}}}]},
        ),
        _api_resource(vm_id, "Microsoft.Compute/virtualMachines", {"networkProfile": {"networkInterfaces": [{"id": nic_id}]}}),
    ]

    def fake_resolution(*args, **kwargs):
        return InventoryResolution(AzureInventoryCollection([], [], resources), mode="test")

    monkeypatch.setattr(path_analysis_routes, "resolve_inventory_collection", fake_resolution)

    blocked_resp = client.get(
        f"/api/v1/workspaces/{WORKSPACE}/path-analysis",
        params={
            "source_resource_id": vm_id,
            "destination_resource_id": subnet_id,
            "protocol": "Tcp",
            "source_port": "12345",
            "destination_port": "443",
        },
    )
    allowed_resp = client.get(
        f"/api/v1/workspaces/{WORKSPACE}/path-analysis",
        params={
            "source_resource_id": vm_id,
            "destination_resource_id": subnet_id,
            "protocol": "Tcp",
            "source_port": "50000",
            "destination_port": "443",
        },
    )

    assert blocked_resp.status_code == 200
    assert blocked_resp.json()["overall_verdict"] == "blocked"
    assert allowed_resp.status_code == 200
    assert allowed_resp.json()["overall_verdict"] == "allowed"


def test_peering_metadata_serializes_round_trip(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    """API response should expose peering metadata from path analysis candidates and hops."""
    base = "/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/rg-network/providers"
    local_vnet_id = f"{base}/Microsoft.Network/virtualNetworks/vnet-local"
    local_subnet_id = f"{local_vnet_id}/subnets/snet-local"
    remote_vnet_id = f"{base}/Microsoft.Network/virtualNetworks/vnet-remote"
    remote_subnet_id = f"{remote_vnet_id}/subnets/snet-remote"
    remote_nic_id = f"{base}/Microsoft.Network/networkInterfaces/nic-remote"
    remote_vm_id = f"{base}/Microsoft.Compute/virtualMachines/vm-remote"

    local_peering = {
        "remoteVirtualNetwork": {"id": remote_vnet_id},
        "peeringState": "Connected",
        "allowForwardedTraffic": False,
    }
    remote_peering = {
        "remoteVirtualNetwork": {"id": local_vnet_id},
        "peeringState": "Connected",
        "allowForwardedTraffic": False,
    }
    resources = [
        _api_resource(
            local_vnet_id,
            "Microsoft.Network/virtualNetworks",
            {"subnets": [{"id": local_subnet_id}], "virtualNetworkPeerings": [{"properties": local_peering}]},
        ),
        _api_resource(local_subnet_id, "Microsoft.Network/virtualNetworks/subnets", {}),
        _api_resource(
            remote_vnet_id,
            "Microsoft.Network/virtualNetworks",
            {"subnets": [{"id": remote_subnet_id}], "virtualNetworkPeerings": [{"properties": remote_peering}]},
        ),
        _api_resource(remote_subnet_id, "Microsoft.Network/virtualNetworks/subnets", {}),
        _api_resource(
            remote_nic_id,
            "Microsoft.Network/networkInterfaces",
            {"ipConfigurations": [{"name": "ipconfig1", "properties": {"subnet": {"id": remote_subnet_id}}}]},
        ),
        _api_resource(
            remote_vm_id,
            "Microsoft.Compute/virtualMachines",
            {"networkProfile": {"networkInterfaces": [{"id": remote_nic_id}]}},
        ),
    ]

    def fake_resolution(*args, **kwargs):
        return InventoryResolution(AzureInventoryCollection([], [], resources), mode="test")

    monkeypatch.setattr(path_analysis_routes, "resolve_inventory_collection", fake_resolution)

    resp = client.get(
        f"/api/v1/workspaces/{WORKSPACE}/path-analysis",
        params={
            "source_resource_id": remote_vm_id,
            "destination_resource_id": local_subnet_id,
        },
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["overall_verdict"] in ("allowed", "blocked", "unknown")
    assert body["path_candidates"]
    candidate = body["path_candidates"][0]
    assert candidate["peering_hop_count"] == 1
    assert candidate["is_forwarded_traffic"] is False
    assert candidate["hops"]
    assert all("is_peering_boundary" in hop for hop in candidate["hops"])
    assert any(hop["is_peering_boundary"] is True for hop in candidate["hops"])
