# Cost Ingestion Public Beta Plan

AzVision currently exposes cost insights through rule-based inventory analysis and a noop cost ingestion provider. Public beta must keep this distinction clear so users do not confuse directional guidance with billing-grade Cost Management data.

## Current state

- `backend/app/services/cost_ingestion.py` returns `cost_status=unknown-cost-data` through `NoopCostIngestionProvider`.
- Cost pages and reports can rank resources and governance signals, but do not ingest Azure Cost Management amounts.
- Existing smoke coverage confirms cost report and cost insights routes work without configured billing data.

## Public beta requirement

Before public beta, the product must support one of these explicit states:

| State | Meaning | UI/API rule |
| --- | --- | --- |
| `unknown-cost-data` | No real cost provider configured | Never show currency totals as real billing |
| `estimated-cost-data` | Rule/model estimate only | Label as estimate and show assumptions |
| `actual-cost-data` | Cost Management provider configured | Show source, time range, and freshness |

## Provider contract target

A future Azure Cost Management provider should return:

```json
{
  "currency": "CAD",
  "estimated_monthly_cost": 123.45,
  "cost_status": "actual-cost-data",
  "cost_source": "azure-cost-management",
  "cost_ingestion_provider": "azure-cost-management",
  "cost_ingestion_configured": true,
  "matched_resource_count": 42,
  "unmatched_resource_count": 3,
  "time_range": "last-30-days",
  "generated_at": "2026-05-28T00:00:00Z"
}
```

## Safety rules

- Never infer actual billing from inventory metadata alone.
- Never store billing export credentials in frontend code.
- Never pass cost provider credentials into Copilot prompts.
- Always show source and freshness for actual cost data.
- Keep noop provider behavior as the safe fallback.

## Implementation sequence

1. Add provider interface tests that lock the three cost status states.
2. Add API response copy that labels unknown, estimated, and actual cost data.
3. Add Azure Cost Management provider behind backend-only configuration.
4. Add provider health and freshness signal.
5. Add public beta UI labels and report disclaimers.
6. Add live provider smoke as opt-in only.

## Go/no-go

Public beta can proceed without real cost ingestion only if cost outputs remain clearly marked as unknown or estimated. Public beta must not claim real billing visibility until `actual-cost-data` is backed by a provider and freshness checks.
