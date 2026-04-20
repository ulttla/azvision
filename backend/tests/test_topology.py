"""Tests for the topology GET endpoint using mock inventory.

The TOPOLOGY_MODE=mock env var is set by the `client` fixture, so no
Azure credentials are required.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

WORKSPACE = "ws-topology-test"


class TestTopologyGet:
    def test_returns_200_with_nodes_and_edges(self, client: TestClient):
        resp = client.get(f"/api/v1/workspaces/{WORKSPACE}/topology")
        assert resp.status_code == 200
        body = resp.json()
        assert "nodes" in body
        assert "edges" in body
        assert isinstance(body["nodes"], list)
        assert isinstance(body["edges"], list)

    def test_nodes_have_required_fields(self, client: TestClient):
        resp = client.get(f"/api/v1/workspaces/{WORKSPACE}/topology")
        nodes = resp.json()["nodes"]
        assert len(nodes) > 0
        required_fields = {"node_key", "node_type", "node_ref", "display_name", "source", "confidence"}
        for node in nodes:
            missing = required_fields - node.keys()
            assert not missing, f"Node missing fields: {missing}"

    def test_edges_have_required_fields(self, client: TestClient):
        resp = client.get(f"/api/v1/workspaces/{WORKSPACE}/topology")
        edges = resp.json()["edges"]
        assert len(edges) > 0
        required_fields = {"source_node_key", "target_node_key", "relation_type", "source", "confidence"}
        for edge in edges:
            missing = required_fields - edge.keys()
            assert not missing, f"Edge missing fields: {missing}"

    def test_response_shape_has_workspace_id_and_generated_at(self, client: TestClient):
        resp = client.get(f"/api/v1/workspaces/{WORKSPACE}/topology")
        body = resp.json()
        assert "workspace_id" in body
        assert "generated_at" in body

    def test_summary_counts_are_present(self, client: TestClient):
        resp = client.get(f"/api/v1/workspaces/{WORKSPACE}/topology")
        body = resp.json()
        summary = body.get("summary")
        assert summary is not None
        assert "node_count" in summary
        assert "edge_count" in summary
        assert summary["node_count"] == len(body["nodes"])
        assert summary["edge_count"] == len(body["edges"])

    def test_mock_mode_label_in_response(self, client: TestClient):
        resp = client.get(f"/api/v1/workspaces/{WORKSPACE}/topology")
        body = resp.json()
        # Mock mode should be reflected in the mode label
        assert "mock" in body.get("mode", "").lower()

    def test_node_key_format(self, client: TestClient):
        resp = client.get(f"/api/v1/workspaces/{WORKSPACE}/topology")
        nodes = resp.json()["nodes"]
        for node in nodes:
            node_key = node["node_key"]
            node_type = node["node_type"]
            # node_key must start with node_type:
            assert node_key.startswith(f"{node_type}:"), (
                f"node_key '{node_key}' does not start with '{node_type}:'"
            )


class TestTopologyWithManualNodes:
    """Verify that manually added nodes appear in the topology response."""

    def test_manual_node_appears_in_topology(self, client: TestClient):
        # Create a manual node
        create_resp = client.post(
            f"/api/v1/workspaces/{WORKSPACE}/topology/manual-nodes",
            json={"display_name": "My Firewall", "manual_type": "firewall"},
        )
        assert create_resp.status_code in (200, 201), create_resp.text
        manual_node = create_resp.json()
        manual_ref = manual_node["manual_ref"]

        # Fetch topology
        resp = client.get(f"/api/v1/workspaces/{WORKSPACE}/topology")
        node_refs = [n["node_ref"] for n in resp.json()["nodes"]]
        assert manual_ref in node_refs

    def test_manual_node_has_source_manual(self, client: TestClient):
        client.post(
            f"/api/v1/workspaces/{WORKSPACE}/topology/manual-nodes",
            json={"display_name": "External SaaS", "manual_type": "saas"},
        )
        resp = client.get(f"/api/v1/workspaces/{WORKSPACE}/topology")
        manual_nodes = [n for n in resp.json()["nodes"] if n["node_type"] == "manual"]
        assert len(manual_nodes) >= 1
        for n in manual_nodes:
            assert n["source"] == "manual"
            assert n["confidence"] == 1.0


class TestTopologyNetworkInference:
    def test_network_inference_off_by_default(self, client: TestClient):
        resp = client.get(f"/api/v1/workspaces/{WORKSPACE}/topology")
        assert resp.json()["options"]["include_network_inference"] is False

    def test_network_inference_can_be_toggled_on(self, client: TestClient):
        resp = client.get(
            f"/api/v1/workspaces/{WORKSPACE}/topology",
            params={"include_network_inference": "true"},
        )
        assert resp.status_code == 200
        assert resp.json()["options"]["include_network_inference"] is True


class TestTopologyNodeDetail:
    def test_subscription_detail_returns_node_fields(self, client: TestClient):
        # Get a subscription node_ref from the topology
        topo = client.get(f"/api/v1/workspaces/{WORKSPACE}/topology").json()
        sub_nodes = [n for n in topo["nodes"] if n["node_type"] == "subscription"]
        assert sub_nodes, "No subscription nodes in mock topology"
        node_ref = sub_nodes[0]["node_ref"]

        resp = client.get(
            f"/api/v1/workspaces/{WORKSPACE}/topology/node-detail",
            params={"node_type": "subscription", "node_ref": node_ref},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["node_type"] == "subscription"
        assert body["node_ref"] == node_ref
        assert "details" in body

    def test_unknown_node_ref_returns_404(self, client: TestClient):
        resp = client.get(
            f"/api/v1/workspaces/{WORKSPACE}/topology/node-detail",
            params={"node_type": "resource", "node_ref": "/no/such/resource"},
        )
        assert resp.status_code == 404
        body = resp.json()
        assert body["ok"] is False
        assert body["status"] == "http-404"
