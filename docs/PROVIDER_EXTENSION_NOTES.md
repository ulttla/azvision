# AzVision Provider Extension Notes

## Purpose
AzVision keeps the MVP useful without external AI or cost APIs, while leaving explicit replacement points for later integrations.

## Cost ingestion provider
Current implementation:
- File: `backend/app/services/cost_ingestion.py`
- Default provider: `NoopCostIngestionProvider`
- Current status fields:
  - `cost_status=unknown-cost-data`
  - `cost_source=not_configured`
  - `cost_ingestion_provider=noop`
  - `cost_ingestion_configured=false`

Contract shape:
```python
class CostIngestionProvider(Protocol):
    provider_name: str

    def get_cost_snapshot(self, resources: list[dict[str, Any]]) -> dict[str, Any]: ...
```

Future Azure Cost Management provider should return normalized facts such as:
- `currency`
- `estimated_monthly_cost`
- `cost_status`
- `cost_source`
- `matched_resource_count`
- `unmatched_resource_count`

Guardrail:
- Do not populate dollar amounts unless they come from a real cost source.
- Until then, keep `estimated_monthly_cost=None` and `cost_status=unknown-cost-data`.

## Copilot provider
Current implementation:
- File: `backend/app/services/copilot.py`
- Default provider: `RuleBasedCopilotProvider`
- Current response fields:
  - `copilot_mode=rule-based`
  - `provider=rule-based`
  - `llm_status=not_configured`

Contract shape:
```python
class CopilotProvider(Protocol):
    provider_name: str

    def answer(
        self,
        message: str,
        resources: list[dict[str, Any]],
        context: dict[str, Any] | None = None,
    ) -> dict[str, Any]: ...
```

Read-only LLM provider skeleton work is documented in `docs/COPILOT_LLM_MVP_PLAN.md`.

Provider targets:
- `RuleBasedCopilotProvider`: always-available fallback.
- `OllamaCopilotProvider`: local Ollama API, including Ollama Cloud subscription models through local Ollama.
- `OpenRouterCopilotProvider`: OpenRouter API-key path for local or hosted deployments.
  - Optional non-secret app attribution headers can be set with `OPENROUTER_HTTP_REFERER` and `OPENROUTER_APP_TITLE`.
  - These headers are sent only from the backend provider adapter; API key/token values remain backend-only and are never included in provider status or chat responses.

LLM providers should preserve or extend the route response shape without breaking existing clients. `suggestions[]` may be empty for a successful LLM response until structured answer sections are added:
- `copilot_mode`
- `provider`
- `llm_status`
- `answer`
- `suggestions[]`
- `context`
- optional `model`, `confidence`, and `read_only=true`

Guardrail:
- LLM/BYOK integration must not become required for core topology, cost triage, or simulation features.
- If no LLM is configured, rule-based copilot remains the fallback.
- Provider credentials stay backend-only; frontend must never receive API keys or tokens.
- First LLM slice is read-only only: no Azure write/remediation, no deployment action, and no product-grade shared chat history.

## Current MVP stance
- Cost Intelligence is a triage layer, not spend reporting.
- Copilot has a deterministic rule-based fallback plus a read-only personal LLM provider skeleton for Ollama and OpenRouter adapters. If provider config is missing or provider calls fail, the route falls back to rule-based guidance.
- Simulation templates/reports are planning artifacts, not deployable infrastructure.
