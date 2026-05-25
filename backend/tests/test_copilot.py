from __future__ import annotations

import requests

from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from app.services.copilot import (
    OllamaCopilotProvider,
    OpenRouterCopilotProvider,
    build_copilot_context,
    build_rule_based_copilot_answer,
    get_default_copilot_provider,
    list_copilot_providers,
    probe_provider_health,
    redact_copilot_value,
)

WORKSPACE = "ws-copilot-test"


def isolated_settings(**overrides) -> Settings:
    return Settings(_env_file=None, **overrides)


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


def test_default_copilot_provider_uses_rule_based_contract(monkeypatch) -> None:
    monkeypatch.setenv("COPILOT_ENABLED", "false")
    monkeypatch.setenv("COPILOT_DEFAULT_PROVIDER", "rule-based")
    monkeypatch.setenv("OLLAMA_MODEL", "")
    monkeypatch.setenv("OPENROUTER_API_KEY", "")
    monkeypatch.setenv("OPENROUTER_MODEL", "")
    get_settings.cache_clear()

    try:
        answer = get_default_copilot_provider().answer("", [])
    finally:
        get_settings.cache_clear()

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


def test_copilot_context_adds_view_specific_guidance() -> None:
    architecture_context = build_copilot_context(
        [],
        workspace_id=WORKSPACE,
        current_view="architecture-view",
        view_context={"selectedNode": {"label": "app", "apiKey": "hidden"}},
    )
    cost_context = build_copilot_context(
        [],
        workspace_id=WORKSPACE,
        current_view="cost-insights",
        view_context={"filters": {"hasSubscriptionFilter": True, "subscriptionKey": "hidden"}},
    )
    topology_context = build_copilot_context(
        [],
        workspace_id=WORKSPACE,
        current_view="topology",
        view_context={"selectedNode": {"name": "vm-app", "sasToken": "hidden"}, "pathAnalysis": {"credentialHint": "hidden"}},
    )
    simulation_context = build_copilot_context(
        [],
        workspace_id=WORKSPACE,
        current_view="simulation",
        view_context={"template": {"format": "bicep", "privateKey": "hidden"}, "selectedSimulation": {"id": "sim-1", "apiToken": "hidden"}},
    )

    assert architecture_context["view_metadata"]["view_kind"] == "architecture"
    assert "topology flows" in architecture_context["view_metadata"]["focus"]
    assert architecture_context["limits"]["view_specific_guidance"]
    assert architecture_context["view_context"]["selectedNode"]["label"] == "app"
    assert architecture_context["view_context"]["selectedNode"]["apiKey"] == "[redacted]"
    assert cost_context["view_metadata"]["view_kind"] == "cost-insights"
    assert cost_context["view_context"]["filters"]["hasSubscriptionFilter"] is True
    assert cost_context["view_context"]["filters"]["subscriptionKey"] == "[redacted]"
    assert topology_context["view_metadata"]["view_kind"] == "topology"
    assert topology_context["view_context"]["selectedNode"]["name"] == "vm-app"
    assert topology_context["view_context"]["selectedNode"]["sasToken"] == "[redacted]"
    assert topology_context["view_context"]["pathAnalysis"]["credentialHint"] == "[redacted]"
    assert simulation_context["view_metadata"]["view_kind"] == "simulation"
    assert "workload planning" in simulation_context["view_metadata"]["focus"]
    assert "IaC warnings" in simulation_context["view_metadata"]["preferred_evidence"]
    assert simulation_context["view_context"]["template"]["format"] == "bicep"
    assert simulation_context["view_context"]["template"]["privateKey"] == "[redacted]"
    assert simulation_context["view_context"]["selectedSimulation"]["apiToken"] == "[redacted]"


def test_copilot_provider_status_never_exposes_openrouter_key() -> None:
    settings = isolated_settings(
        copilot_enabled=True,
        copilot_default_provider="openrouter",
        openrouter_api_key="sk-test-secret",
        openrouter_model="anthropic/example",
    )

    providers = list_copilot_providers(settings)

    assert any(provider["id"] == "openrouter" and provider["configured"] is True for provider in providers)
    assert "sk-test-secret" not in str(providers)


def test_ollama_provider_error_uses_rule_based_fallback(monkeypatch) -> None:
    class BrokenResponse:
        def raise_for_status(self) -> None:
            raise RuntimeError("boom")

    def broken_post(*args, **kwargs):
        raise ValueError("bad json")

    monkeypatch.setattr("app.services.copilot.requests.post", broken_post)
    settings = isolated_settings(copilot_enabled=True, ollama_model="deepseek-v4-pro:cloud")

    answer = OllamaCopilotProvider(settings).answer("network risk", [])

    assert answer["provider"] == "rule-based"
    assert answer["llm_status"] == "ollama_provider_error"
    assert "Ollama" not in str(answer.get("context", {}))


def test_openrouter_provider_error_uses_rule_based_fallback(monkeypatch) -> None:
    def broken_post(*args, **kwargs):
        raise ValueError("bad json")

    monkeypatch.setattr("app.services.copilot.requests.post", broken_post)
    settings = isolated_settings(
        copilot_enabled=True,
        openrouter_api_key="sk-test-secret",
        openrouter_model="anthropic/example",
    )

    answer = OpenRouterCopilotProvider(settings).answer("cost risk", [])

    assert answer["provider"] == "rule-based"
    assert answer["llm_status"] == "openrouter_provider_error"
    assert "sk-test-secret" not in str(answer)


def test_provider_error_fallback_notice_follows_current_language(monkeypatch) -> None:
    def broken_post(*args, **kwargs):
        raise ValueError("timeout")

    monkeypatch.setattr("app.services.copilot.requests.post", broken_post)
    settings = isolated_settings(copilot_enabled=True, ollama_model="deepseek-v4-pro:cloud")

    answer = OllamaCopilotProvider(settings).answer("비용 위험 요약", [], {"current_language": "ko"})

    assert answer["provider"] == "rule-based"
    assert answer["llm_status"] == "ollama_provider_error"
    assert "읽기 전용 규칙 기반 폴백" in answer["answer"]


def test_ollama_error_payload_uses_rule_based_fallback(monkeypatch) -> None:
    class ErrorPayloadResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, object]:
            return {"error": "model unavailable"}

    monkeypatch.setattr("app.services.copilot.requests.post", lambda *args, **kwargs: ErrorPayloadResponse())
    settings = isolated_settings(copilot_enabled=True, ollama_model="deepseek-v4-pro:cloud")

    answer = OllamaCopilotProvider(settings).answer("network risk", [])

    assert answer["provider"] == "rule-based"
    assert answer["llm_status"] == "ollama_provider_error"


def test_openrouter_text_choice_is_normalized(monkeypatch) -> None:
    class TextChoiceResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, object]:
            return {"choices": [{"text": "Plain text completion."}]}

    monkeypatch.setattr("app.services.copilot.requests.post", lambda *args, **kwargs: TextChoiceResponse())
    settings = isolated_settings(
        copilot_enabled=True,
        openrouter_api_key="sk-test-secret",
        openrouter_model="anthropic/example",
    )

    answer = OpenRouterCopilotProvider(settings).answer("cost risk", [])

    assert answer["provider"] == "openrouter"
    assert answer["llm_status"] == "ok"
    assert answer["answer"] == "Plain text completion."
    assert "sk-test-secret" not in str(answer)


def test_ollama_content_parts_are_normalized(monkeypatch) -> None:
    class ContentPartsResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, object]:
            return {"message": {"content": [{"type": "text", "text": "Ollama part one. "}, {"text": "Ollama part two."}]}}

    monkeypatch.setattr("app.services.copilot.requests.post", lambda *args, **kwargs: ContentPartsResponse())
    settings = isolated_settings(copilot_enabled=True, ollama_model="deepseek-v4-pro:cloud")

    answer = OllamaCopilotProvider(settings).answer("network risk", [])

    assert answer["provider"] == "ollama"
    assert answer["llm_status"] == "ok"
    assert answer["answer"] == "Ollama part one. Ollama part two."


def test_openrouter_content_parts_are_normalized(monkeypatch) -> None:
    class ContentPartsResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, object]:
            return {"choices": [{"message": {"content": [{"type": "text", "text": "Part one. "}, {"text": "Part two."}]}}]}

    monkeypatch.setattr("app.services.copilot.requests.post", lambda *args, **kwargs: ContentPartsResponse())
    settings = isolated_settings(
        copilot_enabled=True,
        openrouter_api_key="sk-test-secret",
        openrouter_model="anthropic/example",
    )

    answer = OpenRouterCopilotProvider(settings).answer("cost risk", [])

    assert answer["provider"] == "openrouter"
    assert answer["llm_status"] == "ok"
    assert answer["answer"] == "Part one. Part two."
    assert "sk-test-secret" not in str(answer)


def test_openrouter_raw_string_content_parts_are_normalized(monkeypatch) -> None:
    class RawStringPartsResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, object]:
            return {"choices": [{"message": {"content": ["Raw part one. ", {"text": "Raw part two."}]}}]}

    monkeypatch.setattr("app.services.copilot.requests.post", lambda *args, **kwargs: RawStringPartsResponse())
    settings = isolated_settings(
        copilot_enabled=True,
        openrouter_api_key="sk-test-secret",
        openrouter_model="anthropic/example",
    )

    answer = OpenRouterCopilotProvider(settings).answer("cost risk", [])

    assert answer["provider"] == "openrouter"
    assert answer["llm_status"] == "ok"
    assert answer["answer"] == "Raw part one. Raw part two."
    assert "sk-test-secret" not in str(answer)


def test_openrouter_chat_includes_optional_app_attribution_headers(monkeypatch) -> None:
    captured_headers: dict[str, str] = {}

    class OpenRouterResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, object]:
            return {"choices": [{"message": {"content": "Hosted provider response."}}]}

    def capture_post(*args, **kwargs):
        captured_headers.update(kwargs.get("headers") or {})
        return OpenRouterResponse()

    monkeypatch.setattr("app.services.copilot.requests.post", capture_post)
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-test-secret")
    monkeypatch.setenv("AZVISION_OPENROUTER_API_KEY", "sk-test-secret")
    settings = isolated_settings(
        copilot_enabled=True,
        openrouter_api_key="sk-test-secret",
        openrouter_model="anthropic/example",
        openrouter_http_referer="https://azvision.example",
        openrouter_app_title="AzVision Personal Use",
    )

    answer = OpenRouterCopilotProvider(settings).answer("cost risk", [])

    assert answer["provider"] == "openrouter"
    assert answer["llm_status"] == "ok"
    assert captured_headers["Authorization"] == "Bearer sk-test-secret"
    assert captured_headers["Content-Type"] == "application/json"
    assert captured_headers["HTTP-Referer"] == "https://azvision.example"
    assert captured_headers["X-Title"] == "AzVision Personal Use"
    assert "sk-test-secret" not in str(answer)


def test_openrouter_health_probe_uses_optional_attribution_headers(monkeypatch) -> None:
    captured_headers: dict[str, str] = {}

    class ReachableResponse:
        def raise_for_status(self) -> None:
            return None

    def capture_get(*args, **kwargs):
        captured_headers.update(kwargs.get("headers") or {})
        return ReachableResponse()

    monkeypatch.setattr("app.services.copilot.requests.get", capture_get)
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-test-secret")
    monkeypatch.setenv("AZVISION_OPENROUTER_API_KEY", "sk-test-secret")
    settings = isolated_settings(
        openrouter_api_key="sk-test-secret",
        openrouter_model="anthropic/example",
        openrouter_http_referer="https://azvision.example",
        openrouter_app_title="AzVision Personal Use",
    )

    result = probe_provider_health(settings)

    assert result["openrouter"]["reachable"] is True
    assert captured_headers["Authorization"] == "Bearer sk-test-secret"
    assert captured_headers["HTTP-Referer"] == "https://azvision.example"
    assert captured_headers["X-Title"] == "AzVision Personal Use"
    assert "sk-test-secret" not in str(result)


def test_openrouter_error_payload_uses_rule_based_fallback(monkeypatch) -> None:
    class ErrorPayloadResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, object]:
            return {"error": {"message": "quota exceeded"}}

    monkeypatch.setattr("app.services.copilot.requests.post", lambda *args, **kwargs: ErrorPayloadResponse())
    settings = isolated_settings(
        copilot_enabled=True,
        openrouter_api_key="sk-test-secret",
        openrouter_model="anthropic/example",
    )

    answer = OpenRouterCopilotProvider(settings).answer("cost risk", [])

    assert answer["provider"] == "rule-based"
    assert answer["llm_status"] == "openrouter_provider_error"
    assert "sk-test-secret" not in str(answer)


def assert_openrouter_safe_fallback(answer: dict[str, object], secret: str = "sk-test-secret") -> None:
    assert answer["provider"] == "rule-based"
    assert answer["llm_status"] == "openrouter_provider_error"
    assert secret not in str(answer)
    assert "Bearer" not in str(answer)
    assert "OPENROUTER_API_KEY" not in str(answer)


def test_openrouter_http_401_unauthorized_fallback_never_exposes_key(monkeypatch) -> None:
    class UnauthorizedResponse:
        def raise_for_status(self) -> None:
            raise requests.HTTPError("401 unauthorized for OpenRouter")

        def json(self) -> dict[str, object]:
            return {"error": {"message": "unauthorized"}}

    monkeypatch.setattr("app.services.copilot.requests.post", lambda *args, **kwargs: UnauthorizedResponse())
    settings = isolated_settings(
        copilot_enabled=True,
        openrouter_api_key="sk-test-secret",
        openrouter_model="anthropic/example",
    )

    answer = OpenRouterCopilotProvider(settings).answer("cost risk", [])

    assert_openrouter_safe_fallback(answer)


def test_openrouter_http_429_rate_limited_fallback_never_exposes_key(monkeypatch) -> None:
    class RateLimitedResponse:
        def raise_for_status(self) -> None:
            raise requests.HTTPError("429 rate limited")

        def json(self) -> dict[str, object]:
            return {"error": {"message": "rate limited"}}

    monkeypatch.setattr("app.services.copilot.requests.post", lambda *args, **kwargs: RateLimitedResponse())
    settings = isolated_settings(
        copilot_enabled=True,
        openrouter_api_key="sk-test-secret",
        openrouter_model="anthropic/example",
    )

    answer = OpenRouterCopilotProvider(settings).answer("cost risk", [])

    assert_openrouter_safe_fallback(answer)


def test_openrouter_http_502_bad_gateway_fallback_never_exposes_key(monkeypatch) -> None:
    class BadGatewayResponse:
        def raise_for_status(self) -> None:
            raise requests.HTTPError("502 bad gateway")

        def json(self) -> dict[str, object]:
            return {"error": {"message": "bad gateway"}}

    monkeypatch.setattr("app.services.copilot.requests.post", lambda *args, **kwargs: BadGatewayResponse())
    settings = isolated_settings(
        copilot_enabled=True,
        openrouter_api_key="sk-test-secret",
        openrouter_model="anthropic/example",
    )

    answer = OpenRouterCopilotProvider(settings).answer("cost risk", [])

    assert_openrouter_safe_fallback(answer)


def test_openrouter_non_json_response_fallback_never_exposes_key(monkeypatch) -> None:
    class NonJsonResponse:
        text = "<html>not json</html>"

        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, object]:
            raise ValueError("response was not json")

    monkeypatch.setattr("app.services.copilot.requests.post", lambda *args, **kwargs: NonJsonResponse())
    settings = isolated_settings(
        copilot_enabled=True,
        openrouter_api_key="sk-test-secret",
        openrouter_model="anthropic/example",
    )

    answer = OpenRouterCopilotProvider(settings).answer("cost risk", [])

    assert_openrouter_safe_fallback(answer)
    assert "not json" not in str(answer)


def test_openrouter_empty_choices_array_fallback_never_exposes_key(monkeypatch) -> None:
    class EmptyChoicesResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, object]:
            return {"choices": []}

    monkeypatch.setattr("app.services.copilot.requests.post", lambda *args, **kwargs: EmptyChoicesResponse())
    settings = isolated_settings(
        copilot_enabled=True,
        openrouter_api_key="sk-test-secret",
        openrouter_model="anthropic/example",
    )

    answer = OpenRouterCopilotProvider(settings).answer("cost risk", [])

    assert_openrouter_safe_fallback(answer)


def test_openrouter_error_response_never_exposes_api_key(monkeypatch) -> None:
    secret = "sk-test-secret"

    class SecretAdjacentResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, object]:
            return {"error": {"message": "provider rejected the request"}, "debug": secret}

    monkeypatch.setattr("app.services.copilot.requests.post", lambda *args, **kwargs: SecretAdjacentResponse())
    settings = isolated_settings(
        copilot_enabled=True,
        openrouter_api_key=secret,
        openrouter_model="anthropic/example",
    )

    answer = OpenRouterCopilotProvider(settings).answer("cost risk", [])

    assert_openrouter_safe_fallback(answer, secret=secret)
    for field in ("answer", "context", "suggestions", "provider", "model"):
        assert secret not in str(answer.get(field))


def test_openrouter_non_text_content_parts_use_safe_fallback(monkeypatch) -> None:
    class NonTextContentPartsResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, object]:
            return {"choices": [{"message": {"content": [{"type": "image_url", "image_url": {"url": "https://example.invalid/image.png"}}]}}]}

    monkeypatch.setattr("app.services.copilot.requests.post", lambda *args, **kwargs: NonTextContentPartsResponse())
    settings = isolated_settings(
        copilot_enabled=True,
        openrouter_api_key="sk-test-secret",
        openrouter_model="anthropic/example",
    )

    answer = OpenRouterCopilotProvider(settings).answer("cost risk", [])

    assert answer["provider"] == "rule-based"
    assert answer["llm_status"] == "openrouter_provider_error"
    assert "sk-test-secret" not in str(answer)
    assert "image.png" not in str(answer)


def test_ollama_non_text_content_parts_use_safe_fallback(monkeypatch) -> None:
    class NonTextContentPartsResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, object]:
            return {"message": {"content": [{"type": "image", "source": "local-test-image"}]}}

    monkeypatch.setattr("app.services.copilot.requests.post", lambda *args, **kwargs: NonTextContentPartsResponse())
    settings = isolated_settings(copilot_enabled=True, ollama_model="deepseek-v4-pro:cloud")

    answer = OllamaCopilotProvider(settings).answer("network risk", [])

    assert answer["provider"] == "rule-based"
    assert answer["llm_status"] == "ollama_provider_error"
    assert "local-test-image" not in str(answer)


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


def test_copilot_chat_route_preserves_current_language(client: TestClient) -> None:
    response = client.post(
        f"/api/v1/workspaces/{WORKSPACE}/chat",
        json={"message": "Summarize risks", "current_language": "ko"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["context"]["current_language"] == "ko"


def test_provider_aware_copilot_chat_route_preserves_view_context_and_redaction(client: TestClient) -> None:
    response = client.post(
        "/api/v1/copilot/chat",
        json={
            "workspace_id": WORKSPACE,
            "message": "Summarize cost risks",
            "provider": "rule-based",
            "current_view": "cost-insights",
            "current_language": "ko",
            "view_context": {"filters": {"hasSubscriptionFilter": True, "subscriptionToken": "secret-value"}},
        },
    )

    assert response.status_code == 200
    body = response.json()
    context = body["context"]
    assert body["workspace_id"] == WORKSPACE
    assert context["current_view"] == "cost-insights"
    assert context["current_language"] == "ko"
    assert context["view_metadata"]["view_kind"] == "cost-insights"
    assert context["view_context"]["filters"]["hasSubscriptionFilter"] is True
    assert context["view_context"]["filters"]["subscriptionToken"] == "[redacted]"
    assert "secret-value" not in str(body)


def test_provider_health_ollama_not_configured_without_settings() -> None:
    settings = isolated_settings(ollama_base_url="", ollama_model="")
    result = probe_provider_health(settings)
    assert result["ollama"]["configured"] is False
    assert result["ollama"]["reachable"] is False
    assert result["ollama"]["detail"] == "not_configured"


def test_provider_health_openrouter_not_configured_without_key() -> None:
    settings = isolated_settings(openrouter_api_key="", openrouter_model="")
    result = probe_provider_health(settings)
    assert result["openrouter"]["configured"] is False
    assert result["openrouter"]["reachable"] is False
    assert result["openrouter"]["detail"] == "not_configured"


def test_provider_health_ollama_unreachable_when_down(monkeypatch) -> None:
    def broken_get(*args, **kwargs):
        raise ValueError("timeout")

    monkeypatch.setattr("app.services.copilot.requests.get", broken_get)
    settings = isolated_settings(ollama_base_url="http://127.0.0.1:11434", ollama_model="test-model")
    result = probe_provider_health(settings)
    assert result["ollama"]["configured"] is True
    assert result["ollama"]["reachable"] is False
    assert result["ollama"]["detail"] == "unreachable"


def test_provider_health_openrouter_unreachable_when_down(monkeypatch) -> None:
    def broken_get(*args, **kwargs):
        raise ValueError("timeout")

    monkeypatch.setattr("app.services.copilot.requests.get", broken_get)
    settings = isolated_settings(
        openrouter_api_key="sk-test-secret",
        openrouter_model="anthropic/example",
    )
    result = probe_provider_health(settings)
    assert result["openrouter"]["configured"] is True
    assert result["openrouter"]["reachable"] is False
    assert result["openrouter"]["detail"] == "unreachable"
    assert "sk-test-secret" not in str(result)


def test_provider_health_ollama_reachable_when_up(monkeypatch) -> None:
    class ReachableResponse:
        def raise_for_status(self) -> None:
            pass

    def reachable_get(*args, **kwargs):
        return ReachableResponse()

    monkeypatch.setattr("app.services.copilot.requests.get", reachable_get)
    settings = isolated_settings(ollama_base_url="http://127.0.0.1:11434", ollama_model="test-model")
    result = probe_provider_health(settings)
    assert result["ollama"]["configured"] is True
    assert result["ollama"]["reachable"] is True
    assert result["ollama"]["detail"] == "reachable"


def test_provider_health_openrouter_reachable_when_up(monkeypatch) -> None:
    class ReachableResponse:
        def raise_for_status(self) -> None:
            pass

    def reachable_get(*args, **kwargs):
        return ReachableResponse()

    monkeypatch.setattr("app.services.copilot.requests.get", reachable_get)
    settings = isolated_settings(
        openrouter_api_key="sk-test-secret",
        openrouter_model="anthropic/example",
    )
    result = probe_provider_health(settings)
    assert result["openrouter"]["configured"] is True
    assert result["openrouter"]["reachable"] is True
    assert result["openrouter"]["detail"] == "reachable"
    assert "sk-test-secret" not in str(result)


def test_copilot_providers_route_health_smoke_no_probe_without_flag(client: TestClient) -> None:
    response = client.get("/api/v1/copilot/providers")
    body = response.json()
    assert "provider_health" not in body


def test_copilot_providers_route_health_smoke_returns_probe_with_flag(client: TestClient) -> None:
    response = client.get("/api/v1/copilot/providers?health_smoke=true")
    assert response.status_code == 200
    body = response.json()
    assert "provider_health" in body
    assert "ollama" in body["provider_health"]
    assert "openrouter" in body["provider_health"]


def test_copilot_providers_route_health_smoke_never_exposes_provider_secret(
    client: TestClient,
    monkeypatch,
) -> None:
    secret = "sk-test-secret"

    def broken_get(*args, **kwargs):
        raise ValueError("upstream timeout near secret")

    monkeypatch.setenv("COPILOT_ENABLED", "true")
    monkeypatch.setenv("COPILOT_DEFAULT_PROVIDER", "openrouter")
    monkeypatch.setenv("OPENROUTER_API_KEY", secret)
    monkeypatch.setenv("OPENROUTER_MODEL", "anthropic/example")
    get_settings.cache_clear()
    monkeypatch.setattr("app.services.copilot.requests.get", broken_get)

    try:
        response = client.get("/api/v1/copilot/providers?health_smoke=true")
    finally:
        get_settings.cache_clear()

    assert response.status_code == 200
    body = response.json()
    assert body["provider_health"]["openrouter"]["configured"] is True
    assert body["provider_health"]["openrouter"]["reachable"] is False
    assert body["provider_health"]["openrouter"]["detail"] == "unreachable"
    assert secret not in str(body)
    assert "OPENROUTER_API_KEY" not in str(body)
    assert "Bearer" not in str(body)
