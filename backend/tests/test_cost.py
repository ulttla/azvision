from __future__ import annotations

from fastapi.testclient import TestClient

from app.services.cost_analysis import build_cost_recommendations, build_cost_summary
from app.services.cost_ingestion import get_default_cost_ingestion_provider

WORKSPACE = "ws-cost-test"


def test_cost_recommendations_flag_high_cost_resource_types() -> None:
    resources = [
        {
            "id": "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Sql/managedInstances/mi-app",
            "name": "mi-app",
            "type": "Microsoft.Sql/managedInstances",
            "tags": {"environment": "prod"},
        },
        {
            "id": "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Storage/storageAccounts/stapp",
            "name": "stapp",
            "type": "Microsoft.Storage/storageAccounts",
            "tags": {},
        },
    ]

    recommendations = build_cost_recommendations(resources)
    rule_ids = {item["rule_id"] for item in recommendations}

    assert "sql-mi-rightsize-reservation-review" in rule_ids
    assert "storage-lifecycle-review" in rule_ids
    assert "tag-cost-ownership" in rule_ids


def test_cost_summary_does_not_claim_actual_spend_without_cost_ingestion() -> None:
    resources = [
        {
            "id": "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Compute/virtualMachines/vm-app",
            "name": "vm-app",
            "type": "Microsoft.Compute/virtualMachines",
            "tags": {},
        }
    ]
    recommendations = build_cost_recommendations(resources)
    cost_snapshot = get_default_cost_ingestion_provider().get_cost_snapshot(resources)

    summary = build_cost_summary(resources, recommendations, cost_snapshot)

    assert summary["estimated_monthly_cost"] is None
    assert summary["currency"] is None
    assert summary["cost_status"] == "unknown-cost-data"
    assert summary["cost_ingestion_provider"] == "noop"
    assert summary["cost_ingestion_configured"] is False
    assert summary["recommendation_count"] == len(recommendations)
    assert summary["cost_driver_counts"] == {"compute-runtime": 1}
    assert summary["governance_gap_count"] == 1


def test_cost_summary_route_returns_rule_based_payload(client: TestClient) -> None:
    response = client.get(f"/api/v1/workspaces/{WORKSPACE}/cost/summary")

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["workspace_id"] == WORKSPACE
    assert body["summary"]["source"] == "rule-based-resource-inventory"
    assert body["summary"]["estimated_monthly_cost"] is None
    assert body["summary"]["recommendation_count"] >= 1
    assert "cost_driver_counts" in body["summary"]
    assert "governance_gap_count" in body["summary"]
    assert body["summary"]["cost_ingestion_provider"] == "noop"
    assert body["summary"]["cost_ingestion_configured"] is False


def test_cost_recommendations_route_returns_items(client: TestClient) -> None:
    response = client.post(f"/api/v1/workspaces/{WORKSPACE}/cost/recommendations")

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert isinstance(body["items"], list)
    assert body["items"]
    assert {"rule_id", "category", "severity", "recommendation"} <= body["items"][0].keys()


def test_cost_resources_route_returns_unknown_cost_rows(client: TestClient) -> None:
    response = client.get(f"/api/v1/workspaces/{WORKSPACE}/cost/resources")

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["items"]
    assert body["items"][0]["cost_status"] == "unknown-cost-data"
    assert "cost_driver_labels" in body["items"][0]
