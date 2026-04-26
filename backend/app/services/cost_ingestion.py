from __future__ import annotations

from typing import Any, Protocol


class CostIngestionProvider(Protocol):
    """Provider contract for future Azure Cost Management ingestion."""

    provider_name: str

    def get_cost_snapshot(self, resources: list[dict[str, Any]]) -> dict[str, Any]:
        """Return normalized cost facts for the current resource scope."""


class NoopCostIngestionProvider:
    provider_name = "noop"

    def get_cost_snapshot(self, resources: list[dict[str, Any]]) -> dict[str, Any]:
        return {
            "currency": None,
            "estimated_monthly_cost": None,
            "cost_status": "unknown-cost-data",
            "cost_source": "not_configured",
            "cost_ingestion_provider": self.provider_name,
            "cost_ingestion_configured": False,
            "matched_resource_count": 0,
            "unmatched_resource_count": len([resource for resource in resources if resource.get("id")]),
        }


def get_default_cost_ingestion_provider() -> CostIngestionProvider:
    return NoopCostIngestionProvider()
