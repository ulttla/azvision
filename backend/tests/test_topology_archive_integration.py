"""End-to-end topology archive route coverage.

These tests bridge snapshot creation, automatic topology archive storage, and
archive-aware compare through the FastAPI route layer.
"""
from __future__ import annotations

from fastapi.testclient import TestClient


WORKSPACE = "local-demo"


def _snapshot_payload(name: str, topology: dict) -> dict:
    return {
        "preset_version": 1,
        "name": name,
        "note": "archive integration smoke",
        "compare_refs": [],
        "cluster_children": True,
        "scope": "visible",
        "query": "",
        "selected_subscription_id": "",
        "resource_group_name": "",
        "topology_generated_at": "2026-04-30T00:00:00Z",
        "visible_node_count": len(topology["nodes"]),
        "loaded_node_count": len(topology["nodes"]),
        "edge_count": len(topology["edges"]),
        "thumbnail_data_url": "",
        "topology": topology,
    }


def test_snapshot_create_auto_archives_and_compare_uses_raw_topology(client: TestClient):
    base_topology = {
        "nodes": [
            {
                "node_key": "resource:web",
                "display_name": "web-app",
                "source": "azure",
                "resource_type": "Microsoft.Web/sites",
                "location": "canadacentral",
            }
        ],
        "edges": [],
    }
    target_topology = {
        "nodes": [
            {
                "node_key": "resource:web",
                "display_name": "web-app-v2",
                "source": "azure",
                "resource_type": "Microsoft.Web/sites",
                "location": "canadacentral",
            },
            {
                "node_key": "resource:sql",
                "display_name": "sql-db",
                "source": "azure",
                "resource_type": "Microsoft.Sql/servers",
                "location": "canadacentral",
            },
        ],
        "edges": [
            {
                "source_node_key": "resource:web",
                "target_node_key": "resource:sql",
                "relation_type": "connects_to",
                "source": "azure",
            }
        ],
    }

    base = client.post(
        f"/api/v1/workspaces/{WORKSPACE}/snapshots",
        json=_snapshot_payload("AutoArchiveBase", base_topology),
    )
    target = client.post(
        f"/api/v1/workspaces/{WORKSPACE}/snapshots",
        json=_snapshot_payload("AutoArchiveTarget", target_topology),
    )

    assert base.status_code == 200
    assert target.status_code == 200

    resp = client.post(
        f"/api/v1/workspaces/{WORKSPACE}/snapshots/compare/topology",
        json={
            "base_snapshot_id": base.json()["id"],
            "target_snapshot_id": target.json()["id"],
        },
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["archive_status"] == "available"
    assert [node["node_key"] for node in body["node_delta"]["added"]] == ["resource:sql"]
    assert [node["node_key"] for node in body["node_delta"]["changed"]] == ["resource:web"]
    assert body["edge_delta"]["added"] == [target_topology["edges"][0]]
    assert body["metadata_delta"] is None
