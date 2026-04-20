"""Tests for manual node and edge CRUD API endpoints."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

WORKSPACE = "ws-manual-test"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _create_node(client: TestClient, workspace: str = WORKSPACE, **kwargs) -> dict:
    defaults = {"display_name": "Test Node", "manual_type": "external-system"}
    defaults.update(kwargs)
    resp = client.post(
        f"/api/v1/workspaces/{workspace}/topology/manual-nodes",
        json=defaults,
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()


def _create_edge(
    client: TestClient,
    source_key: str,
    target_key: str,
    workspace: str = WORKSPACE,
    **kwargs,
) -> dict:
    payload = {
        "source_node_key": source_key,
        "target_node_key": target_key,
        "relation_type": kwargs.get("relation_type", "connects_to"),
        **{k: v for k, v in kwargs.items() if k != "relation_type"},
    }
    resp = client.post(
        f"/api/v1/workspaces/{workspace}/topology/manual-edges",
        json=payload,
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()


# ===========================================================================
# Manual Node tests
# ===========================================================================

class TestManualNodeCreate:
    def test_create_returns_ok_with_node_fields(self, client: TestClient):
        resp = client.post(
            f"/api/v1/workspaces/{WORKSPACE}/topology/manual-nodes",
            json={"display_name": "My Firewall", "manual_type": "firewall"},
        )
        assert resp.status_code in (200, 201)
        body = resp.json()
        assert body["ok"] is True
        assert body["status"] == "created"
        assert body["display_name"] == "My Firewall"
        assert body["manual_type"] == "firewall"
        assert "manual_ref" in body
        assert body["manual_ref"] != ""
        assert body["source"] == "manual"
        assert body["confidence"] == 1.0

    def test_node_key_format(self, client: TestClient):
        body = _create_node(client)
        assert body["node_key"] == f"manual:{body['manual_ref']}"

    def test_create_sets_node_type_manual(self, client: TestClient):
        body = _create_node(client)
        assert body["node_type"] == "manual"

    def test_create_multiple_nodes_get_unique_refs(self, client: TestClient):
        a = _create_node(client, display_name="Node A")
        b = _create_node(client, display_name="Node B")
        assert a["manual_ref"] != b["manual_ref"]


class TestManualNodeList:
    def test_list_returns_created_nodes(self, client: TestClient):
        _create_node(client, display_name="Alpha")
        _create_node(client, display_name="Beta")
        resp = client.get(f"/api/v1/workspaces/{WORKSPACE}/topology/manual-nodes")
        assert resp.status_code == 200
        body = resp.json()
        assert body["ok"] is True
        assert body["workspace_id"] == WORKSPACE
        names = [item["display_name"] for item in body["items"]]
        assert "Alpha" in names
        assert "Beta" in names

    def test_list_different_workspace_isolated(self, client: TestClient):
        _create_node(client, workspace="ws-other", display_name="Other Node")
        resp = client.get(f"/api/v1/workspaces/{WORKSPACE}/topology/manual-nodes")
        items = resp.json()["items"]
        names = [i["display_name"] for i in items]
        assert "Other Node" not in names

    def test_list_empty_workspace_returns_empty_items(self, client: TestClient):
        resp = client.get("/api/v1/workspaces/no-such-ws/topology/manual-nodes")
        assert resp.status_code == 200
        assert resp.json()["items"] == []


class TestManualNodeUpdate:
    def test_update_display_name(self, client: TestClient):
        node = _create_node(client, display_name="Old Name")
        manual_ref = node["manual_ref"]
        resp = client.patch(
            f"/api/v1/workspaces/{WORKSPACE}/topology/manual-nodes/{manual_ref}",
            json={"display_name": "New Name"},
        )
        assert resp.status_code == 200
        assert resp.json()["display_name"] == "New Name"

    def test_update_manual_type(self, client: TestClient):
        node = _create_node(client, manual_type="firewall")
        resp = client.patch(
            f"/api/v1/workspaces/{WORKSPACE}/topology/manual-nodes/{node['manual_ref']}",
            json={"manual_type": "on-prem-server"},
        )
        assert resp.json()["manual_type"] == "on-prem-server"

    def test_update_nonexistent_returns_404(self, client: TestClient):
        resp = client.patch(
            f"/api/v1/workspaces/{WORKSPACE}/topology/manual-nodes/mn_nonexistent",
            json={"display_name": "X"},
        )
        assert resp.status_code == 404
        body = resp.json()
        assert body["ok"] is False
        assert body["status"] == "http-404"


class TestManualNodeDelete:
    def test_delete_returns_deleted_status(self, client: TestClient):
        node = _create_node(client)
        resp = client.delete(
            f"/api/v1/workspaces/{WORKSPACE}/topology/manual-nodes/{node['manual_ref']}"
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["ok"] is True
        assert body["status"] == "deleted"

    def test_delete_removes_node_from_list(self, client: TestClient):
        node = _create_node(client, display_name="ToDelete")
        client.delete(
            f"/api/v1/workspaces/{WORKSPACE}/topology/manual-nodes/{node['manual_ref']}"
        )
        resp = client.get(f"/api/v1/workspaces/{WORKSPACE}/topology/manual-nodes")
        names = [i["display_name"] for i in resp.json()["items"]]
        assert "ToDelete" not in names

    def test_delete_nonexistent_returns_404(self, client: TestClient):
        resp = client.delete(
            f"/api/v1/workspaces/{WORKSPACE}/topology/manual-nodes/mn_gone"
        )
        assert resp.status_code == 404
        assert resp.json()["status"] == "http-404"


# ===========================================================================
# Manual Edge tests
# ===========================================================================

class TestManualEdgeCreate:
    def test_create_edge_between_two_manual_nodes(self, client: TestClient):
        src = _create_node(client, display_name="Src")
        tgt = _create_node(client, display_name="Tgt")
        edge = _create_edge(client, src["node_key"], tgt["node_key"])

        assert edge["ok"] is True
        assert edge["status"] == "created"
        assert edge["source_node_key"] == src["node_key"]
        assert edge["target_node_key"] == tgt["node_key"]
        assert edge["source"] == "manual"
        assert edge["confidence"] == 1.0
        assert "manual_edge_ref" in edge

    def test_create_edge_with_custom_relation_type(self, client: TestClient):
        src = _create_node(client, display_name="Src")
        tgt = _create_node(client, display_name="Tgt")
        resp = client.post(
            f"/api/v1/workspaces/{WORKSPACE}/topology/manual-edges",
            json={
                "source_node_key": src["node_key"],
                "target_node_key": tgt["node_key"],
                "relation_type": "secures",
            },
        )
        assert resp.status_code in (200, 201)
        assert resp.json()["relation_type"] == "secures"

    def test_create_edge_unknown_node_key_returns_400(self, client: TestClient):
        src = _create_node(client, display_name="Src")
        resp = client.post(
            f"/api/v1/workspaces/{WORKSPACE}/topology/manual-edges",
            json={
                "source_node_key": src["node_key"],
                "target_node_key": "manual:mn_does_not_exist",
                "relation_type": "connects_to",
            },
        )
        assert resp.status_code == 400
        body = resp.json()
        assert body["ok"] is False

    def test_create_edge_missing_source_returns_400(self, client: TestClient):
        tgt = _create_node(client, display_name="Tgt")
        resp = client.post(
            f"/api/v1/workspaces/{WORKSPACE}/topology/manual-edges",
            json={
                "target_node_key": tgt["node_key"],
                "relation_type": "connects_to",
            },
        )
        assert resp.status_code == 400


class TestManualEdgeList:
    def test_list_returns_created_edges(self, client: TestClient):
        src = _create_node(client, display_name="S")
        tgt = _create_node(client, display_name="T")
        _create_edge(client, src["node_key"], tgt["node_key"])

        resp = client.get(f"/api/v1/workspaces/{WORKSPACE}/topology/manual-edges")
        assert resp.status_code == 200
        body = resp.json()
        assert body["ok"] is True
        assert len(body["items"]) == 1
        item = body["items"][0]
        assert item["source_node_key"] == src["node_key"]
        assert item["target_node_key"] == tgt["node_key"]


class TestManualEdgeUpdate:
    def test_update_relation_type(self, client: TestClient):
        src = _create_node(client, display_name="S")
        tgt = _create_node(client, display_name="T")
        edge = _create_edge(client, src["node_key"], tgt["node_key"])

        resp = client.patch(
            f"/api/v1/workspaces/{WORKSPACE}/topology/manual-edges/{edge['manual_edge_ref']}",
            json={"relation_type": "routes"},
        )
        assert resp.status_code == 200
        assert resp.json()["relation_type"] == "routes"

    def test_update_nonexistent_edge_returns_404(self, client: TestClient):
        resp = client.patch(
            f"/api/v1/workspaces/{WORKSPACE}/topology/manual-edges/me_gone",
            json={"relation_type": "connects_to"},
        )
        assert resp.status_code == 404
        assert resp.json()["status"] == "http-404"


class TestManualEdgeDelete:
    def test_delete_removes_edge(self, client: TestClient):
        src = _create_node(client, display_name="S")
        tgt = _create_node(client, display_name="T")
        edge = _create_edge(client, src["node_key"], tgt["node_key"])

        resp = client.delete(
            f"/api/v1/workspaces/{WORKSPACE}/topology/manual-edges/{edge['manual_edge_ref']}"
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "deleted"

        list_resp = client.get(f"/api/v1/workspaces/{WORKSPACE}/topology/manual-edges")
        assert list_resp.json()["items"] == []

    def test_delete_nonexistent_edge_returns_404(self, client: TestClient):
        resp = client.delete(
            f"/api/v1/workspaces/{WORKSPACE}/topology/manual-edges/me_gone"
        )
        assert resp.status_code == 404
        assert resp.json()["status"] == "http-404"
