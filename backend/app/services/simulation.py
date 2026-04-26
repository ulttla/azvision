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


def _build_simulation_insights(resource_types: set[str], token_set: set[str], environment: str) -> dict[str, list[str]]:
    architecture_notes = [
        "Start from the required resources, then treat recommended and optional resources as review candidates.",
        "Keep observability in the first design iteration so cost, reliability, and support signals are available from day one.",
    ]
    cost_considerations = [
        "Set budgets and alerts before deployment; this simulation does not call Azure pricing APIs yet.",
        "Use tags for workload, environment, owner, and cost center on all generated resources.",
    ]
    security_considerations = [
        "Use managed identity and least-privilege RBAC instead of embedding secrets in app settings.",
        "Review public exposure, inbound rules, and diagnostic log retention before production release.",
    ]
    next_actions = [
        "Confirm region, data residency, expected traffic, and availability requirements.",
        "Convert the accepted resources into an IaC module or deployment template after sizing is validated.",
    ]

    if "Microsoft.Network/virtualNetworks" in resource_types:
        architecture_notes.append("Model subnet boundaries, private endpoints, and DNS dependencies before app deployment.")
        security_considerations.append("Attach NSGs to subnets and document allowed traffic flows for private resources.")
    if "Microsoft.Sql/servers/databases" in resource_types:
        cost_considerations.append("Choose SQL tier after estimating DTU/vCore, storage, backup retention, and failover needs.")
        security_considerations.append("Plan private access, auditing, encryption, and admin break-glass controls for SQL.")
    if "Microsoft.Network/frontDoors" in resource_types:
        cost_considerations.append("Review ingress, WAF, rules engine, and egress patterns because global edge services can add variable cost.")
        security_considerations.append("Enable WAF policy and TLS governance before exposing the app publicly.")
    if "Microsoft.Synapse/workspaces" in resource_types or "Microsoft.DataFactory/factories" in resource_types:
        cost_considerations.append("Separate always-on analytics capacity from scheduled pipeline workloads to avoid idle spend.")
        next_actions.append("Define data sources, refresh cadence, retention, and reporting SLAs before selecting analytics SKUs.")
    if "Microsoft.RecoveryServices/vaults" in resource_types or {"dr", "disaster", "ha", "backup"} & token_set:
        architecture_notes.append("Document RPO/RTO targets and choose paired-region or backup-only design explicitly.")
        cost_considerations.append("Include backup storage, retention, cross-region replication, and test restore cost in the estimate.")
    if environment.lower() in {"prod", "production"}:
        next_actions.append("Run a production readiness review covering identity, monitoring, backup, scaling, and incident response.")

    return {
        "architecture_notes": architecture_notes,
        "cost_considerations": cost_considerations,
        "security_considerations": security_considerations,
        "next_actions": next_actions,
    }


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

    insights = _build_simulation_insights(seen_types, token_set, environment)

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
        "architecture_notes": insights["architecture_notes"],
        "cost_considerations": insights["cost_considerations"],
        "security_considerations": insights["security_considerations"],
        "next_actions": insights["next_actions"],
        "assumptions": [
            "This is a first-pass architecture simulation, not a deployment template.",
            "Validate sizing, region, data residency, identity, and network constraints before build.",
            "Cost estimates require Azure Cost Management/pricing integration in a later pass.",
        ],
    }
