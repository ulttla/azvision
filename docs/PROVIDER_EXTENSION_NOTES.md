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

    def answer(self, message: str, resources: list[dict[str, Any]]) -> dict[str, Any]: ...
```

Future LLM provider should preserve the route response shape:
- `copilot_mode`
- `provider`
- `llm_status`
- `answer`
- `suggestions[]`
- `context`

Guardrail:
- LLM/BYOK integration must not become required for core topology, cost triage, or simulation features.
- If no LLM is configured, rule-based copilot remains the fallback.

## Current MVP stance
- Cost Intelligence is a triage layer, not spend reporting.
- Copilot is deterministic rule-based guidance, not an LLM answer.
- Simulation templates/reports are planning artifacts, not deployable infrastructure.
