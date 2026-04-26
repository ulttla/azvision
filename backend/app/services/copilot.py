from __future__ import annotations

from collections import Counter
from typing import Any

from app.services.cost_analysis import build_cost_recommendations


def _resource_type(resource: dict[str, Any]) -> str:
    return str(resource.get("type") or "unknown")


def _resource_name(resource: dict[str, Any]) -> str:
    name = resource.get("name")
    if isinstance(name, str) and name:
        return name.split("/")[-1]
    resource_id = str(resource.get("id") or "")
    return resource_id.rstrip("/").split("/")[-1] if resource_id else "resource"


def _top_resource_types(resources: list[dict[str, Any]], limit: int = 5) -> list[str]:
    counts = Counter(_resource_type(resource) for resource in resources)
    return [f"{resource_type}: {count}" for resource_type, count in counts.most_common(limit)]


def build_rule_based_copilot_answer(message: str, resources: list[dict[str, Any]]) -> dict[str, Any]:
    normalized = message.strip().lower()
    recommendations = build_cost_recommendations(resources)
    top_types = _top_resource_types(resources)

    if not normalized:
        normalized = "overview"

    cost_like = any(token in normalized for token in ("cost", "save", "saving", "cheap", "spend", "money", "비용", "절감"))
    network_like = any(token in normalized for token in ("network", "vnet", "subnet", "nsg", "route", "private", "네트워크"))
    project_like = any(token in normalized for token in ("project", "add", "design", "resource", "구성", "추가", "프로젝트"))

    answer_lines = [
        "Rule-based copilot first pass. LLM provider integration is not configured in this build yet.",
        f"Current scope has {len(resources)} resources.",
    ]
    if top_types:
        answer_lines.append("Top resource types: " + "; ".join(top_types))

    suggestions: list[str] = []
    if cost_like:
        high_or_medium = [item for item in recommendations if item.get("severity") in {"high", "medium"}]
        answer_lines.append(f"Cost triage found {len(recommendations)} rule-based recommendations.")
        for item in high_or_medium[:5]:
            suggestions.append(f"{item['resource_name']}: {item['title']}")

    if network_like:
        suggestions.extend(
            [
                "Turn on network inference only as a supplement; prefer azure-explicit edges when present.",
                "Check NSG, route table, NIC, subnet, private endpoint, and VM edge evidence before trusting the diagram.",
            ]
        )

    if project_like:
        suggestions.extend(
            [
                "Start with a target workload type, expected users/traffic, data sensitivity, and availability target.",
                "Then map required network, identity, compute, data, monitoring, and backup resources before estimating cost.",
            ]
        )

    if not suggestions:
        suggestions.extend(
            [
                "Review the topology and Cost Insights tabs first, then ask a narrower cost, network, or project-design question.",
                "Use explicit edge evidence for infrastructure understanding; use cost recommendations as triage prompts until Cost Management ingestion is added.",
            ]
        )

    return {
        "copilot_mode": "rule-based",
        "llm_status": "not_configured",
        "answer": "\n".join(answer_lines),
        "suggestions": suggestions[:8],
        "context": {
            "resource_count": len(resources),
            "recommendation_count": len(recommendations),
            "top_resource_types": top_types,
        },
    }
