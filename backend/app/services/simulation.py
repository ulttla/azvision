from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4


_BASELINE_RESOURCES = [
    {
        "resource_type": "Microsoft.Resources/resourceGroups",
        "name_hint": "rg-<workload>-<env>",
        "reason": "Keep workload resources grouped for lifecycle and cost ownership.",
        "priority": "required",
    },
    {
        "resource_type": "Microsoft.Insights/components",
        "name_hint": "appi-<workload>-<env>",
        "reason": "Application telemetry is required for troubleshooting and later optimization.",
        "priority": "recommended",
    },
    {
        "resource_type": "Microsoft.OperationalInsights/workspaces",
        "name_hint": "log-<workload>-<env>",
        "reason": "Central logs support diagnostics, security review, and cost analysis.",
        "priority": "recommended",
    },
]

_RULES = [
    {
        "keywords": {"web", "website", "api", "frontend", "portal", "app"},
        "resources": [
            {
                "resource_type": "Microsoft.Web/sites",
                "name_hint": "app-<workload>-<env>",
                "reason": "Host the web/API workload with managed runtime and deployment slots.",
                "priority": "required",
            },
            {
                "resource_type": "Microsoft.Network/frontDoors",
                "name_hint": "afd-<workload>-<env>",
                "reason": "Add global ingress, TLS, WAF option, and caching when public exposure is needed.",
                "priority": "optional",
            },
        ],
    },
    {
        "keywords": {"database", "sql", "data", "transaction"},
        "resources": [
            {
                "resource_type": "Microsoft.Sql/servers/databases",
                "name_hint": "sqldb-<workload>-<env>",
                "reason": "Use managed relational storage for transactional data.",
                "priority": "required",
            },
            {
                "resource_type": "Microsoft.Storage/storageAccounts",
                "name_hint": "st<workload><env>",
                "reason": "Store backups, exports, static assets, or operational files with lifecycle policy.",
                "priority": "recommended",
            },
        ],
    },
    {
        "keywords": {"private", "internal", "secure", "network", "vnet"},
        "resources": [
            {
                "resource_type": "Microsoft.Network/virtualNetworks",
                "name_hint": "vnet-<workload>-<env>",
                "reason": "Provide private address space and subnet boundaries.",
                "priority": "required",
            },
            {
                "resource_type": "Microsoft.Network/privateEndpoints",
                "name_hint": "pep-<service>-<env>",
                "reason": "Keep PaaS access on private network paths where supported.",
                "priority": "recommended",
            },
            {
                "resource_type": "Microsoft.Network/networkSecurityGroups",
                "name_hint": "nsg-<subnet>-<env>",
                "reason": "Control subnet or NIC-level inbound/outbound traffic.",
                "priority": "required",
            },
        ],
    },
    {
        "keywords": {"analytics", "warehouse", "bi", "reporting"},
        "resources": [
            {
                "resource_type": "Microsoft.Synapse/workspaces",
                "name_hint": "synw-<workload>-<env>",
                "reason": "Provide analytics workspace for data processing and reporting workloads.",
                "priority": "optional",
            },
            {
                "resource_type": "Microsoft.DataFactory/factories",
                "name_hint": "adf-<workload>-<env>",
                "reason": "Orchestrate ingestion and transformation pipelines.",
                "priority": "optional",
            },
        ],
    },
    {
        "keywords": {"dr", "disaster", "high availability", "ha", "backup"},
        "resources": [
            {
                "resource_type": "Microsoft.RecoveryServices/vaults",
                "name_hint": "rsv-<workload>-<env>",
                "reason": "Support backup, recovery, and retention planning.",
                "priority": "recommended",
            },
            {
                "resource_type": "Microsoft.Resources/deployments",
                "name_hint": "paired-region-design",
                "reason": "Model paired-region deployment, failover, and data replication requirements before build.",
                "priority": "recommended",
            },
        ],
    },
]


def _tokens(text: str) -> set[str]:
    normalized = "".join(char.lower() if char.isalnum() else " " for char in text)
    return {token for token in normalized.split() if token}


def build_simulation(payload: dict[str, Any]) -> dict[str, Any]:
    description = str(payload.get("description") or payload.get("message") or "").strip()
    workload_name = str(payload.get("workload_name") or "workload").strip() or "workload"
    environment = str(payload.get("environment") or "dev").strip() or "dev"
    token_set = _tokens(description)

    recommendations = [dict(item) for item in _BASELINE_RESOURCES]
    matched_rules: list[str] = []
    seen_types = {item["resource_type"] for item in recommendations}

    for rule in _RULES:
        if token_set & rule["keywords"]:
            matched_rules.append("/".join(sorted(rule["keywords"])))
            for item in rule["resources"]:
                if item["resource_type"] in seen_types:
                    continue
                seen_types.add(item["resource_type"])
                recommendations.append(dict(item))

    if not matched_rules:
        matched_rules.append("baseline")

    normalized_items = []
    for item in recommendations:
        normalized = dict(item)
        normalized["name_hint"] = normalized["name_hint"].replace("<workload>", workload_name).replace("<env>", environment)
        normalized_items.append(normalized)

    return {
        "simulation_id": f"sim_{uuid4().hex[:12]}",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": "generated",
        "mode": "rule-based",
        "workload_name": workload_name,
        "environment": environment,
        "description": description,
        "matched_rules": matched_rules,
        "recommended_resources": normalized_items,
        "assumptions": [
            "This is a first-pass architecture simulation, not a deployment template.",
            "Validate sizing, region, data residency, identity, and network constraints before build.",
            "Cost estimates require Azure Cost Management/pricing integration in a later pass.",
        ],
    }
