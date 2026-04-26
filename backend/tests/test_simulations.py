from __future__ import annotations

from fastapi.testclient import TestClient

from app.services.simulation import build_simulation

WORKSPACE = "ws-simulation-test"


def test_build_simulation_uses_message_when_description_is_empty() -> None:
    simulation = build_simulation(
        {
            "workload_name": "api",
            "environment": "dev",
            "description": "",
            "message": "private api with database",
        }
    )
    resource_types = {item["resource_type"] for item in simulation["recommended_resources"]}

    assert "Microsoft.Web/sites" in resource_types
    assert "Microsoft.Sql/servers/databases" in resource_types
    assert "Microsoft.Network/virtualNetworks" in resource_types
    assert simulation["description"] == "private api with database"


def test_build_simulation_empty_description_returns_baseline() -> None:
    simulation = build_simulation({"description": ""})

    assert simulation["matched_rules"] == ["baseline"]
    assert {item["priority"] for item in simulation["recommended_resources"]} >= {"required", "recommended"}


def test_build_simulation_recommends_resources_from_description() -> None:
    simulation = build_simulation(
        {
            "workload_name": "portal",
            "environment": "prod",
            "description": "private web app with SQL database and DR backup",
        }
    )
    resource_types = {item["resource_type"] for item in simulation["recommended_resources"]}

    assert "Microsoft.Web/sites" in resource_types
    assert "Microsoft.Sql/servers/databases" in resource_types
    assert "Microsoft.Network/virtualNetworks" in resource_types
    assert "Microsoft.RecoveryServices/vaults" in resource_types
    assert simulation["mode"] == "rule-based"
    assert any("SQL" in item for item in simulation["cost_considerations"])
    assert any("production readiness" in item for item in simulation["next_actions"])


def test_simulation_routes_create_list_and_get(client: TestClient) -> None:
    create_response = client.post(
        f"/api/v1/workspaces/{WORKSPACE}/simulations",
        json={
            "workload_name": "analytics",
            "environment": "dev",
            "description": "analytics reporting app with private network",
        },
    )

    assert create_response.status_code == 200
    created = create_response.json()
    assert created["ok"] is True
    assert created["simulation_id"].startswith("sim_")
    assert created["recommended_resources"]
    assert created["architecture_notes"]
    assert created["cost_considerations"]
    assert created["security_considerations"]
    assert created["next_actions"]

    list_response = client.get(f"/api/v1/workspaces/{WORKSPACE}/simulations")
    assert list_response.status_code == 200
    assert list_response.json()["items"][0]["simulation_id"] == created["simulation_id"]

    get_response = client.get(f"/api/v1/workspaces/{WORKSPACE}/simulations/{created['simulation_id']}")
    assert get_response.status_code == 200
    assert get_response.json()["simulation_id"] == created["simulation_id"]

    template_response = client.get(f"/api/v1/workspaces/{WORKSPACE}/simulations/{created['simulation_id']}/template")
    assert template_response.status_code == 200
    template = template_response.json()
    assert template["deployable"] is False
    assert template["format"] == "bicep-outline"
    assert "not a deployable template" in template["content"]
    assert template["resources"]

    report_response = client.get(f"/api/v1/workspaces/{WORKSPACE}/simulations/{created['simulation_id']}/report")
    assert report_response.status_code == 200
    report = report_response.json()
    assert report["report_type"] == "markdown"
    assert "Recommended resources" in report["content"]
    assert report["warnings"]

    fit_response = client.get(f"/api/v1/workspaces/{WORKSPACE}/simulations/{created['simulation_id']}/fit")
    assert fit_response.status_code == 200
    fit = fit_response.json()
    assert fit["inventory_resource_count"] >= 1
    assert fit["items"]
    assert "covered_count" in fit
    assert "missing_required_count" in fit


def test_unknown_simulation_returns_404_envelope(client: TestClient) -> None:
    response = client.get(f"/api/v1/workspaces/{WORKSPACE}/simulations/nope")

    assert response.status_code == 404
    assert response.json()["ok"] is False
