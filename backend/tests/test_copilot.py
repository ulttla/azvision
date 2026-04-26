from __future__ import annotations

from fastapi.testclient import TestClient

from app.services.copilot import build_rule_based_copilot_answer, get_default_copilot_provider

WORKSPACE = "ws-copilot-test"


def test_rule_based_copilot_cost_question_mentions_not_configured_llm() -> None:
    resources = [
        {
            "id": "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Sql/managedInstances/mi-app",
            "name": "mi-app",
            "type": "Microsoft.Sql/managedInstances",
            "tags": {},
        }
    ]

    answer = build_rule_based_copilot_answer("How can I save cost?", resources)

    assert answer["copilot_mode"] == "rule-based"
    assert answer["provider"] == "rule-based"
    assert answer["llm_status"] == "not_configured"
    assert answer["context"]["recommendation_count"] >= 1
    assert answer["suggestions"]


def test_default_copilot_provider_uses_rule_based_contract() -> None:
    answer = get_default_copilot_provider().answer("", [])

    assert answer["provider"] == "rule-based"
    assert answer["llm_status"] == "not_configured"
    assert answer["context"]["resource_count"] == 0
    assert answer["suggestions"]


def test_rule_based_copilot_network_question_returns_network_guidance() -> None:
    answer = build_rule_based_copilot_answer("Explain private subnet and NSG design", [])

    assert any("NSG" in suggestion or "network" in suggestion for suggestion in answer["suggestions"])


def test_copilot_chat_route_returns_contextual_answer(client: TestClient) -> None:
    response = client.post(
        f"/api/v1/workspaces/{WORKSPACE}/chat",
        json={"message": "Explain network and cost risks"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["workspace_id"] == WORKSPACE
    assert body["mode"] in {"mock", "live"}
    assert body["copilot_mode"] == "rule-based"
    assert body["llm_status"] == "not_configured"
    assert body["answer"]
    assert body["suggestions"]
    assert body["context"]["resource_count"] >= 1
