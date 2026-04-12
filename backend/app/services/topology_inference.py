from __future__ import annotations

import re
from typing import Any

_NAME_TOKEN_RE = re.compile(r"[a-z0-9]+")
_IGNORED_NAME_TOKENS = {
    "azure",
    "prod",
    "stage",
    "staging",
    "dev",
    "test",
    "demo",
    "mock",
    "mi",
    "vm",
    "nsg",
    "vnet",
    "subnet",
    "nic",
    "pip",
    "lb",
    "agw",
    "rt",
    "pep",
}

_WORKLOAD_TYPE_PREFIXES = (
    "microsoft.compute/virtualmachines",
    "microsoft.sql/managedinstances",
    "microsoft.sql/servers",
    "microsoft.web/sites",
    "microsoft.synapse/workspaces",
    "microsoft.storage/storageaccounts",
    "microsoft.containerapp/containerapps",
    "microsoft.network/networkinterfaces",
    "microsoft.network/privateendpoints",
    "microsoft.network/loadbalancers",
    "microsoft.network/applicationgateways",
    "microsoft.network/publicipaddresses",
    "microsoft.network/subnets",
)

_RELATION_COMPATIBILITY_PREFIXES: dict[str, tuple[str, ...]] = {
    "connects_to": _WORKLOAD_TYPE_PREFIXES
    + (
        "microsoft.network/virtualnetworks",
    ),
    "secures": _WORKLOAD_TYPE_PREFIXES,
    "routes": _WORKLOAD_TYPE_PREFIXES,
}


def _canonical(value: str | None) -> str | None:
    if value is None:
        return None
    return value.strip().lower()


def _resource_type_lower(item: dict[str, Any]) -> str:
    return str(item.get("type") or "").lower()


def _resource_display_name(resource: dict[str, Any]) -> str:
    name = resource.get("name")
    if isinstance(name, str) and name:
        return name.split("/")[-1]
    resource_id = resource.get("id")
    if isinstance(resource_id, str) and resource_id:
        return resource_id.rstrip("/").split("/")[-1]
    return "resource"


def _normalized_name(value: str | None) -> str:
    if not value:
        return ""
    return "".join(char for char in value.lower() if char.isalnum())


def _name_tokens(value: str | None) -> set[str]:
    if not value:
        return set()

    tokens = {
        token
        for token in _NAME_TOKEN_RE.findall(value.lower())
        if len(token) >= 2 and token not in _IGNORED_NAME_TOKENS
    }
    return tokens


def _network_relation_role(item: dict[str, Any]) -> str | None:
    resource_type = _resource_type_lower(item)
    if resource_type.startswith("microsoft.network/networksecuritygroups"):
        return "secures"
    if resource_type.startswith("microsoft.network/routetables"):
        return "routes"
    if resource_type.startswith(
        (
            "microsoft.network/virtualnetworks",
            "microsoft.network/subnets",
            "microsoft.network/networkinterfaces",
            "microsoft.network/publicipaddresses",
            "microsoft.network/loadbalancers",
            "microsoft.network/applicationgateways",
            "microsoft.network/privateendpoints",
            "microsoft.network/serviceendpointpolicies",
            "microsoft.network/networkintentpolicies",
        )
    ):
        return "connects_to"
    return None


def _is_network_candidate(item: dict[str, Any]) -> bool:
    return _network_relation_role(item) is not None


def _is_compatible_target(item: dict[str, Any], relation_type: str) -> bool:
    resource_type = _resource_type_lower(item)
    prefixes = _RELATION_COMPATIBILITY_PREFIXES.get(relation_type, ())
    return any(resource_type.startswith(prefix) for prefix in prefixes)


def _name_evidence(left: dict[str, Any], right: dict[str, Any]) -> tuple[float, list[str]]:
    evidence: list[str] = []
    score = 0.0

    left_display_name = _resource_display_name(left)
    right_display_name = _resource_display_name(right)
    left_name = _normalized_name(left_display_name)
    right_name = _normalized_name(right_display_name)
    if not left_name or not right_name:
        return 0.0, evidence

    if left_name == right_name:
        evidence.append("exact-name-match")
        score += 0.5
    else:
        shorter, longer = sorted((left_name, right_name), key=len)
        if len(shorter) >= 8 and shorter in longer:
            evidence.append("normalized-name-affinity")
            score += 0.28

    left_tokens = _name_tokens(left_display_name)
    right_tokens = _name_tokens(right_display_name)
    overlap = left_tokens & right_tokens
    if overlap:
        overlap_count = len(overlap)
        if overlap_count >= 3:
            score += 0.48
        elif overlap_count == 2:
            score += 0.36
        else:
            score += 0.22
        evidence.append("token-overlap:" + ",".join(sorted(overlap)))

        left_suffix = left_display_name.lower().split("-")[-1]
        right_suffix = right_display_name.lower().split("-")[-1]
        if left_suffix and left_suffix == right_suffix:
            evidence.append(f"shared-suffix:{left_suffix}")
            score += 0.12

    return score, evidence


def _build_inference_result(
    network_item: dict[str, Any],
    candidate: dict[str, Any],
    *,
    relation_type: str,
) -> dict[str, Any] | None:
    network_id = network_item.get("id")
    candidate_id = candidate.get("id")
    if not network_id or not candidate_id or network_id == candidate_id:
        return None

    score = 0.0
    evidence: list[str] = []

    if not _is_compatible_target(candidate, relation_type):
        return None

    if _canonical(network_item.get("resource_group")) == _canonical(candidate.get("resource_group")):
        evidence.append("same-resource-group")
        score += 0.12

    evidence.append("compatible-resource-type")
    score += 0.18

    name_score, name_evidence = _name_evidence(network_item, candidate)
    score += name_score
    evidence.extend(name_evidence)

    has_name_signal = name_score > 0
    threshold = 0.52 if relation_type in {"secures", "routes"} else 0.48
    if not has_name_signal or score < threshold:
        return None

    confidence = min(0.92, round(score, 2))
    return {
        "source_node_key": f"resource:{network_id}",
        "target_node_key": f"resource:{candidate_id}",
        "relation_type": relation_type,
        "source": "azure",
        "confidence": confidence,
        "resolver": "network-heuristic-v2",
        "evidence": evidence,
    }


def infer_network_relationship_edges(resources: list[dict[str, Any]]) -> list[dict[str, Any]]:
    resources_by_group: dict[tuple[str | None, str | None], list[dict[str, Any]]] = {}
    for resource in resources:
        key = (resource.get("subscription_id"), _canonical(resource.get("resource_group")))
        resources_by_group.setdefault(key, []).append(resource)

    inferred_edges: list[dict[str, Any]] = []
    for grouped_resources in resources_by_group.values():
        network_items = [item for item in grouped_resources if _is_network_candidate(item)]
        related_candidates = [
            item
            for item in grouped_resources
            if _is_network_candidate(item) or any(
                _resource_type_lower(item).startswith(prefix) for prefix in _WORKLOAD_TYPE_PREFIXES
            )
        ]

        for network_item in network_items:
            relation_type = _network_relation_role(network_item)
            if not relation_type:
                continue

            for candidate in related_candidates:
                inferred_edge = _build_inference_result(
                    network_item,
                    candidate,
                    relation_type=relation_type,
                )
                if inferred_edge is not None:
                    inferred_edges.append(inferred_edge)

    return inferred_edges
