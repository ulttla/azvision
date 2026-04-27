"""Tests for the path analysis API endpoint.

Uses the mock inventory (TOPOLOGY_MODE=mock) set by the conftest client fixture.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

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

    def test_hop_structure_when_path_found(self, client: TestClient):
        """When a path is found, hops have the expected structure."""
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