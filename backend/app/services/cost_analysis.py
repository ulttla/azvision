from __future__ import annotations

from collections import Counter, defaultdict
from typing import Any

_COST_RELEVANT_TAGS = {"costcenter", "cost_center", "environment", "owner", "application", "app"}
_COST_DRIVER_RULES: tuple[tuple[str, str], ...] = (
    ("microsoft.sql/managedinstances", "sql-managed-instance"),
    ("microsoft.sql/servers/databases", "sql-database"),
    ("microsoft.compute/virtualmachines", "compute-runtime"),
    ("microsoft.network/applicationgateways", "network-edge"),
    ("microsoft.network/loadbalancers", "network-edge"),
    ("microsoft.network/publicipaddresses", "network-edge"),
    ("microsoft.network/privateendpoints", "private-connectivity"),
    ("microsoft.network/frontdoors", "global-edge"),
    ("microsoft.storage/storageaccounts", "storage-retention"),
    ("microsoft.synapse/workspaces", "analytics-capacity"),
    ("microsoft.datafactory/factories", "pipeline-orchestration"),
    ("microsoft.recoveryservices/vaults", "backup-retention"),
)


def _resource_id(resource: dict[str, Any]) -> str:
    return str(resource.get("id") or "")


def _resource_type(resource: dict[str, Any]) -> str:
    return str(resource.get("type") or "").lower()


def _resource_name(resource: dict[str, Any]) -> str:
    name = resource.get("name")
    if isinstance(name, str) and name:
        return name.split("/")[-1]
    resource_id = _resource_id(resource)
    return resource_id.rstrip("/").split("/")[-1] if resource_id else "resource"


def _tags(resource: dict[str, Any]) -> dict[str, Any]:
    tags = resource.get("tags")
    return tags if isinstance(tags, dict) else {}


def _has_cost_relevant_tag(resource: dict[str, Any]) -> bool:
    tag_keys = {str(key).lower() for key in _tags(resource)}
    return bool(tag_keys & _COST_RELEVANT_TAGS)


def _cost_driver_labels(resource: dict[str, Any]) -> list[str]:
    resource_type = _resource_type(resource)
    return [label for prefix, label in _COST_DRIVER_RULES if resource_type.startswith(prefix)]


def _recommendation(
    resource: dict[str, Any],
    *,
    rule_id: str,
    category: str,
    severity: str,
    title: str,
    recommendation: str,
    evidence: list[str],
    confidence: float = 0.7,
) -> dict[str, Any]:
    return {
        "rule_id": rule_id,
        "category": category,
        "severity": severity,
        "resource_id": _resource_id(resource),
        "resource_name": _resource_name(resource),
        "resource_type": resource.get("type") or "unknown",
        "title": title,
        "recommendation": recommendation,
        "evidence": evidence,
        "confidence": confidence,
    }


def build_cost_recommendations(resources: list[dict[str, Any]]) -> list[dict[str, Any]]:
    recommendations: list[dict[str, Any]] = []

    for resource in resources:
        resource_type = _resource_type(resource)
        if not _resource_id(resource):
            continue

        if not _has_cost_relevant_tag(resource):
            recommendations.append(
                _recommendation(
                    resource,
                    rule_id="tag-cost-ownership",
                    category="governance",
                    severity="low",
                    title="Add cost ownership tags",
                    recommendation=(
                        "Add costCenter/owner/application/environment tags so later cost reports "
                        "can group and explain spend by owner and workload."
                    ),
                    evidence=["missing cost-relevant tags"],
                    confidence=0.8,
                )
            )

        if resource_type.startswith("microsoft.sql/managedinstances"):
            recommendations.append(
                _recommendation(
                    resource,
                    rule_id="sql-mi-rightsize-reservation-review",
                    category="optimization",
                    severity="high",
                    title="Review SQL Managed Instance sizing and reservation coverage",
                    recommendation=(
                        "Validate vCore/storage utilization, business critical/general purpose tier, "
                        "and reserved capacity coverage before accepting this as steady-state spend."
                    ),
                    evidence=["SQL Managed Instance is commonly a high-cost Azure resource"],
                    confidence=0.72,
                )
            )

        if resource_type.startswith("microsoft.compute/virtualmachines"):
            recommendations.append(
                _recommendation(
                    resource,
                    rule_id="vm-rightsize-shutdown-review",
                    category="optimization",
                    severity="medium",
                    title="Review VM rightsizing, schedule, and reservation fit",
                    recommendation=(
                        "Check CPU/memory utilization, dev/test shutdown schedule, and reserved/savings plan fit."
                    ),
                    evidence=["VM spend depends heavily on size and runtime hours"],
                    confidence=0.68,
                )
            )

        if resource_type.startswith("microsoft.storage/storageaccounts"):
            recommendations.append(
                _recommendation(
                    resource,
                    rule_id="storage-lifecycle-review",
                    category="optimization",
                    severity="medium",
                    title="Review storage lifecycle and redundancy tier",
                    recommendation=(
                        "Check blob lifecycle policies, access tiers, soft-delete retention, and redundancy level."
                    ),
                    evidence=["Storage cost often accumulates through retention, transactions, and redundancy"],
                    confidence=0.66,
                )
            )

        if resource_type.startswith(
            (
                "microsoft.network/applicationgateways",
                "microsoft.network/loadbalancers",
                "microsoft.network/publicipaddresses",
                "microsoft.network/privateendpoints",
            )
        ):
            recommendations.append(
                _recommendation(
                    resource,
                    rule_id="network-idle-frontdoor-review",
                    category="optimization",
                    severity="medium",
                    title="Review network edge resource utilization",
                    recommendation=(
                        "Check whether this network edge component is still attached, receiving traffic, "
                        "and using the intended SKU before treating it as permanent baseline spend."
                    ),
                    evidence=["network edge resources can create steady monthly cost even when idle"],
                    confidence=0.64,
                )
            )

    return recommendations


def build_cost_resource_rows(resources: list[dict[str, Any]], recommendations: list[dict[str, Any]]) -> list[dict[str, Any]]:
    recommendation_counts: dict[str, int] = defaultdict(int)
    for item in recommendations:
        recommendation_counts[str(item.get("resource_id") or "")] += 1

    return [
        {
            "resource_id": _resource_id(resource),
            "resource_name": _resource_name(resource),
            "resource_type": resource.get("type") or "unknown",
            "resource_group": resource.get("resource_group"),
            "location": resource.get("location"),
            "currency": None,
            "estimated_monthly_cost": None,
            "cost_status": "unknown-cost-data",
            "cost_driver_labels": _cost_driver_labels(resource),
            "recommendation_count": recommendation_counts[_resource_id(resource)],
        }
        for resource in resources
        if _resource_id(resource)
    ]


def build_cost_summary(resources: list[dict[str, Any]], recommendations: list[dict[str, Any]]) -> dict[str, Any]:
    severity_counts = Counter(str(item.get("severity") or "unknown") for item in recommendations)
    category_counts = Counter(str(item.get("category") or "unknown") for item in recommendations)
    resource_type_counts = Counter(str(resource.get("type") or "unknown") for resource in resources)
    cost_driver_counts = Counter(
        label
        for resource in resources
        for label in _cost_driver_labels(resource)
    )
    governance_gap_count = len([resource for resource in resources if _resource_id(resource) and not _has_cost_relevant_tag(resource)])

    return {
        "currency": None,
        "estimated_monthly_cost": None,
        "cost_status": "unknown-cost-data",
        "source": "rule-based-resource-inventory",
        "resource_count": len(resources),
        "analyzed_resource_count": len([resource for resource in resources if _resource_id(resource)]),
        "recommendation_count": len(recommendations),
        "severity_counts": dict(severity_counts),
        "category_counts": dict(category_counts),
        "top_resource_types": dict(resource_type_counts.most_common(10)),
        "cost_driver_counts": dict(cost_driver_counts.most_common()),
        "governance_gap_count": governance_gap_count,
        "notes": [
            "This is a rule-based first pass. It does not yet call Azure Cost Management or emit dollar amounts.",
            "Cost drivers identify resources that commonly need pricing/utilization review; they are not spend estimates.",
            "Use recommendations as triage prompts until actual cost ingestion is added.",
        ],
    }
