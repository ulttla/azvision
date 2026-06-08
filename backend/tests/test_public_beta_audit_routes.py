from __future__ import annotations

import json
import sqlite3
from typing import Any

from fastapi.testclient import TestClient

from app.collectors.azure_inventory import AzureInventoryCollection


def _audit_event(db_path, event_type: str) -> sqlite3.Row:
    with sqlite3.connect(str(db_path)) as conn:
        conn.row_factory = sqlite3.Row
        event = conn.execute(
            "SELECT * FROM audit_events WHERE event_type = ? ORDER BY created_at DESC LIMIT 1",
            (event_type,),
        ).fetchone()
    assert event is not None, f"missing audit event: {event_type}"
    return event


def _metadata(event: sqlite3.Row) -> dict[str, Any]:
    return json.loads(event["metadata_json"])


def test_copilot_chat_writes_non_secret_audit_event(client: TestClient, db_path) -> None:
    response = client.post(
        "/api/v1/workspaces/ws-copilot-test/chat",
        headers={"X-Request-Id": "req-copilot-audit"},
        json={
            "message": "Summarize network risks without logging this prompt secret-token",
            "provider": "rule-based",
            "current_language": "en",
        },
    )

    assert response.status_code == 200
    event = _audit_event(db_path, "copilot.chat.requested")
    assert event["workspace_id"] == "ws-copilot-test"
    assert event["account_id"] == "test-account"
    assert event["request_id"] == "req-copilot-audit"
    metadata = _metadata(event)
    assert metadata == {
        "model_present": False,
        "prompt_chars": 64,
        "provider": "rule-based",
        "provider_override_present": True,
    }
    assert "secret-token" not in event["metadata_json"]


def test_scan_start_writes_hashed_subscription_audit_event(client: TestClient, db_path, monkeypatch) -> None:
    import app.api.routes.scans as scan_routes

    def fake_collect_inventory(*_args, **_kwargs):
        return AzureInventoryCollection(
            subscriptions=[{"subscription_id": "sub-secret-001"}],
            resource_groups=[{"name": "rg-a"}],
            resources=[{"id": "resource-a"}],
        )

    monkeypatch.setattr(scan_routes, "collect_inventory", fake_collect_inventory)

    response = client.post(
        "/api/v1/workspaces/local-demo/scans?subscription_id=sub-secret-001&resource_group_limit=7&resource_limit=9",
        headers={"X-Request-Id": "req-scan-audit"},
    )

    assert response.status_code == 200
    event = _audit_event(db_path, "scan.started")
    assert event["workspace_id"] == "local-demo"
    assert event["request_id"] == "req-scan-audit"
    metadata = _metadata(event)
    assert metadata["scan_id"].startswith("scan_")
    assert metadata["subscription_hash"]
    assert metadata["resource_group_limit"] == 7
    assert metadata["resource_limit"] == 9
    assert metadata["resource_count"] == 1
    assert "sub-secret-001" not in event["metadata_json"]


def test_manual_topology_writes_non_secret_audit_events(client: TestClient, db_path) -> None:
    workspace = "ws-manual-test"
    created_node = client.post(
        f"/api/v1/workspaces/{workspace}/topology/manual-nodes",
        headers={"X-Request-Id": "req-manual-node-create"},
        json={"display_name": "Secret Firewall Name", "manual_type": "firewall"},
    )
    assert created_node.status_code == 200
    node_ref = created_node.json()["manual_ref"]
    node_key = created_node.json()["node_key"]

    node_event = _audit_event(db_path, "manual_node.created")
    assert node_event["request_id"] == "req-manual-node-create"
    assert _metadata(node_event) == {"fields": ["display_name", "manual_type"], "manual_ref": node_ref}
    assert "Secret Firewall Name" not in node_event["metadata_json"]

    updated_node = client.patch(
        f"/api/v1/workspaces/{workspace}/topology/manual-nodes/{node_ref}",
        headers={"X-Request-Id": "req-manual-node-update"},
        json={"display_name": "New Secret Name"},
    )
    assert updated_node.status_code == 200
    update_event = _audit_event(db_path, "manual_node.updated")
    assert update_event["request_id"] == "req-manual-node-update"
    assert _metadata(update_event) == {"fields": ["display_name"], "manual_ref": node_ref}
    assert "New Secret Name" not in update_event["metadata_json"]

    other_node = client.post(
        f"/api/v1/workspaces/{workspace}/topology/manual-nodes",
        json={"display_name": "Target", "manual_type": "external-system"},
    ).json()
    created_edge = client.post(
        f"/api/v1/workspaces/{workspace}/topology/manual-edges",
        headers={"X-Request-Id": "req-manual-edge-create"},
        json={"source_node_key": node_key, "target_node_key": other_node["node_key"], "relation_type": "connects_to"},
    )
    assert created_edge.status_code == 200
    edge_ref = created_edge.json()["manual_edge_ref"]
    edge_event = _audit_event(db_path, "manual_edge.created")
    assert edge_event["request_id"] == "req-manual-edge-create"
    assert _metadata(edge_event) == {
        "fields": ["relation_type", "source_node_key", "target_node_key"],
        "manual_edge_ref": edge_ref,
        "relation_type": "connects_to",
    }
    assert node_key not in edge_event["metadata_json"]

    updated_edge = client.patch(
        f"/api/v1/workspaces/{workspace}/topology/manual-edges/{edge_ref}",
        headers={"X-Request-Id": "req-manual-edge-update"},
        json={"relation_type": "secures"},
    )
    assert updated_edge.status_code == 200
    assert _metadata(_audit_event(db_path, "manual_edge.updated")) == {
        "fields": ["relation_type"],
        "manual_edge_ref": edge_ref,
    }

    deleted_edge = client.delete(
        f"/api/v1/workspaces/{workspace}/topology/manual-edges/{edge_ref}",
        headers={"X-Request-Id": "req-manual-edge-delete"},
    )
    assert deleted_edge.status_code == 200
    assert _metadata(_audit_event(db_path, "manual_edge.deleted")) == {"manual_edge_ref": edge_ref}

    deleted_node = client.delete(
        f"/api/v1/workspaces/{workspace}/topology/manual-nodes/{node_ref}",
        headers={"X-Request-Id": "req-manual-node-delete"},
    )
    assert deleted_node.status_code == 200
    assert _metadata(_audit_event(db_path, "manual_node.deleted")) == {"manual_ref": node_ref}


def test_simulation_create_delete_writes_non_secret_audit_events(client: TestClient, db_path) -> None:
    workspace = "ws-simulation-test"
    response = client.post(
        f"/api/v1/workspaces/{workspace}/simulations",
        headers={"X-Request-Id": "req-simulation-create"},
        json={
            "workload_name": "private-api",
            "environment": "dev",
            "description": "private api with database and secret design note",
        },
    )

    assert response.status_code == 200
    simulation_id = response.json()["simulation_id"]
    create_event = _audit_event(db_path, "simulation.created")
    assert create_event["request_id"] == "req-simulation-create"
    assert _metadata(create_event) == {
        "description_chars": 48,
        "environment": "dev",
        "simulation_id": simulation_id,
        "workload_name_present": True,
    }
    assert "secret design note" not in create_event["metadata_json"]

    delete_response = client.delete(
        f"/api/v1/workspaces/{workspace}/simulations/{simulation_id}",
        headers={"X-Request-Id": "req-simulation-delete"},
    )
    assert delete_response.status_code == 200
    delete_event = _audit_event(db_path, "simulation.deleted")
    assert delete_event["request_id"] == "req-simulation-delete"
    assert _metadata(delete_event) == {"simulation_id": simulation_id}
