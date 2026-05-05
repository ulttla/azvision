from __future__ import annotations

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.services.copilot import (
    build_copilot_context,
    build_rule_based_copilot_answer,
    get_default_copilot_provider,
    list_copilot_providers,
    redact_copilot_value,
)

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


def test_rule_based_copilot_path_question_mentions_path_analysis_endpoint() -> None:
    answer = build_rule_based_copilot_answer("Is VM traffic blocked by NSG or route table?", [])

    assert any("path-analysis" in suggestion for suggestion in answer["suggestions"])


def test_copilot_context_redacts_secret_like_fields() -> None:
    redacted = redact_copilot_value(
        {
            "name": "vm-app",
            "api_key": "should-not-render",
            "nested": {"clientSecret": "should-not-render"},
        }
    )

    assert redacted["name"] == "vm-app"
    assert redacted["api_key"] == "[redacted]"
    assert redacted["nested"]["clientSecret"] == "[redacted]"


def test_copilot_context_summarizes_selected_resource_without_secret_dump() -> None:
    resources = [
        {
            "id": "/subscriptions/sub/resourceGroups/rg-app/providers/Microsoft.Compute/virtualMachines/vm-app",
            "name": "vm-app",
            "type": "Microsoft.Compute/virtualMachines",
            "location": "canadacentral",
            "tags": {"owner": "platform", "secretToken": "hidden"},
        }
    ]

    context = build_copilot_context(resources, workspace_id=WORKSPACE, current_view="topology", selected_resource_id=resources[0]["id"])

    assert context["workspace_id"] == WORKSPACE
    assert context["limits"]["read_only"] is True
    assert context["selected_resource"]["name"] == "vm-app"
    assert context["selected_resource"]["tags"]["secretToken"] == "[redacted]"


def test_copilot_provider_status_never_exposes_openrouter_key() -> None:
    settings = Settings(
        copilot_enabled=True,
        copilot_default_provider="openrouter",
        openrouter_api_key="sk-test-secret",
        openrouter_model="anthropic/example",
    )

    providers = list_copilot_providers(settings)

    assert any(provider["id"] == "openrouter" and provider["configured"] is True for provider in providers)
    assert "sk-test-secret" not in str(providers)


def test_copilot_providers_route_returns_read_only_status(client: TestClient) -> None:
    response = client.get("/api/v1/copilot/providers")

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["read_only"] is True
    assert any(provider["id"] == "rule-based" for provider in body["providers"])


def test_provider_aware_copilot_chat_route_keeps_rule_based_fallback(client: TestClient) -> None:
    response = client.post(
        "/api/v1/copilot/chat",
        json={"workspace_id": WORKSPACE, "message": "Explain network and cost risks", "provider": "ollama"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["workspace_id"] == WORKSPACE
    assert body["mode"] in {"mock", "live"}
    assert body["read_only"] is True
    assert body["copilot_mode"] == "rule-based"
    assert body["answer"]
    assert body["suggestions"]
    assert body["context"]["resource_count"] >= 1


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
