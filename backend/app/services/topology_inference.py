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

_NETWORK_NAME_PREFIX_TOKENS = {
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

_GENERIC_WORKLOAD_PREFIX_TOKENS = {
    "sql",
    "sqlmi",
    "synapse",
    "synw",
    "web",
    "app",
    "api",
    "func",
    "function",
    "vm",
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

_NETWORK_CHILD_SEGMENTS = {
    "subnets",
    "ipconfigurations",
    "backendaddresspools",
    "frontendipconfigurations",
    "privateendpointconnections",
}

_WORKLOAD_FAMILY_RESOURCE_TYPE_PREFIXES: dict[str, tuple[str, ...]] = {
    "sql-managed-instance": ("microsoft.sql/managedinstances",),
    "synapse-workspace": ("microsoft.synapse/workspaces",),
    "web-app": ("microsoft.web/sites", "microsoft.containerapp/containerapps"),
    "virtual-machine": ("microsoft.compute/virtualmachines",),
    "storage-account": ("microsoft.storage/storageaccounts",),
}

_WORKLOAD_FAMILY_NAME_HINTS: dict[str, tuple[str, ...]] = {
    "sql-managed-instance": ("sqlmi",),
    "synapse-workspace": ("synw", "synapse"),
    "web-app": ("web", "app", "api"),
    "virtual-machine": ("vm",),
    "storage-account": ("st", "storage", "sa"),
}


def _canonical(value: str | None) -> str | None:
    if value is None:
        return None
    return value.strip().lower()


def _resource_type_lower(item: dict[str, Any]) -> str:
    return str(item.get("type") or "").lower()


def _resource_id(item: dict[str, Any]) -> str | None:
    resource_id = item.get("id")
    return resource_id if isinstance(resource_id, str) and resource_id else None


def _canonical_resource_id(value: str | None) -> str | None:
    if value is None:
        return None
    return value.rstrip("/").lower()


def _resource_ids_by_canonical(resources: list[dict[str, Any]]) -> dict[str, str]:
    ids: dict[str, str] = {}
    for item in resources:
        resource_id = _resource_id(item)
        canonical_id = _canonical_resource_id(resource_id)
        if canonical_id and resource_id:
            ids[canonical_id] = resource_id
    return ids


def _properties(item: dict[str, Any]) -> dict[str, Any]:
    properties = item.get("properties")
    return properties if isinstance(properties, dict) else {}


def _iter_dicts(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def _id_from_ref(value: Any) -> str | None:
    if isinstance(value, dict):
        candidate = value.get("id")
        return candidate if isinstance(candidate, str) and candidate else None
    if isinstance(value, str) and value:
        return value
    return None


def _properties_from_ref(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {}
    properties = value.get("properties")
    return properties if isinstance(properties, dict) else {}


def _strip_child_resource_id(resource_id: str | None) -> str | None:
    if not resource_id:
        return None

    parts = [part for part in resource_id.rstrip("/").split("/") if part]
    lowered = [part.lower() for part in parts]
    for segment in _NETWORK_CHILD_SEGMENTS:
        if segment in lowered:
            index = lowered.index(segment)
            return "/" + "/".join(parts[:index])
    return resource_id


def _resolve_existing_resource_id(raw_id: str | None, resource_ids: dict[str, str]) -> str | None:
    if not raw_id:
        return None

    for candidate in (raw_id, _strip_child_resource_id(raw_id)):
        canonical_id = _canonical_resource_id(candidate)
        if canonical_id and canonical_id in resource_ids:
            return resource_ids[canonical_id]
    return None


def _explicit_edge(
    source_id: str | None,
    target_id: str | None,
    *,
    relation_type: str,
    evidence: str,
) -> dict[str, Any] | None:
    if not source_id or not target_id or _canonical_resource_id(source_id) == _canonical_resource_id(target_id):
        return None

    return {
        "source_node_key": f"resource:{source_id}",
        "target_node_key": f"resource:{target_id}",
        "relation_type": relation_type,
        "source": "azure-explicit",
        "confidence": 1.0,
        "resolver": "network-explicit-v1",
        "evidence": [evidence],
    }


def _add_explicit_edge(edges: list[dict[str, Any]], edge: dict[str, Any] | None) -> None:
    if edge is not None:
        edges.append(edge)


def infer_explicit_network_relationship_edges(resources: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Build high-confidence network edges from ARM resource IDs in resource properties.

    This resolver is intentionally conservative: it only emits edges when both
    endpoints are present in the current topology resource set and the relation
    comes from an explicit ARM ID reference, not naming affinity.
    """
    resource_ids = _resource_ids_by_canonical(resources)
    edges: list[dict[str, Any]] = []

    for resource in resources:
        current_id = _resource_id(resource)
        if not current_id:
            continue

        resource_type = _resource_type_lower(resource)
        properties = _properties(resource)

        if resource_type == "microsoft.compute/virtualmachines":
            network_profile = properties.get("networkProfile")
            network_profile = network_profile if isinstance(network_profile, dict) else {}
            for nic_ref in _iter_dicts(network_profile.get("networkInterfaces")):
                nic_id = _resolve_existing_resource_id(_id_from_ref(nic_ref), resource_ids)
                _add_explicit_edge(
                    edges,
                    _explicit_edge(nic_id, current_id, relation_type="connects_to", evidence="vm.networkProfile.networkInterfaces[].id"),
                )

        if resource_type == "microsoft.network/networkinterfaces":
            nsg_id = _resolve_existing_resource_id(_id_from_ref(properties.get("networkSecurityGroup")), resource_ids)
            _add_explicit_edge(
                edges,
                _explicit_edge(nsg_id, current_id, relation_type="secures", evidence="networkInterface.networkSecurityGroup.id"),
            )

            for ip_config in _iter_dicts(properties.get("ipConfigurations")):
                ip_props = ip_config.get("properties")
                ip_props = ip_props if isinstance(ip_props, dict) else {}
                subnet_id = _resolve_existing_resource_id(_id_from_ref(ip_props.get("subnet")), resource_ids)
                public_ip_id = _resolve_existing_resource_id(_id_from_ref(ip_props.get("publicIPAddress")), resource_ids)
                _add_explicit_edge(
                    edges,
                    _explicit_edge(subnet_id, current_id, relation_type="connects_to", evidence="networkInterface.ipConfigurations[].subnet.id"),
                )
                _add_explicit_edge(
                    edges,
                    _explicit_edge(public_ip_id, current_id, relation_type="connects_to", evidence="networkInterface.ipConfigurations[].publicIPAddress.id"),
                )

        if resource_type == "microsoft.network/virtualnetworks":
            for subnet_ref in _iter_dicts(properties.get("subnets")):
                subnet_id = _resolve_existing_resource_id(_id_from_ref(subnet_ref), resource_ids)
                _add_explicit_edge(
                    edges,
                    _explicit_edge(current_id, subnet_id, relation_type="connects_to", evidence="vnet.subnets[].id"),
                )

            for peering in _iter_dicts(properties.get("virtualNetworkPeerings")):
                peering_props = _properties_from_ref(peering)
                remote_vnet_id = _resolve_existing_resource_id(
                    _id_from_ref(peering_props.get("remoteVirtualNetwork")),
                    resource_ids,
                )
                _add_explicit_edge(
                    edges,
                    _explicit_edge(
                        current_id,
                        remote_vnet_id,
                        relation_type="connects_to",
                        evidence="vnet.virtualNetworkPeerings[].remoteVirtualNetwork.id",
                    ),
                )

        if resource_type == "microsoft.network/networksecuritygroups":
            for subnet_ref in _iter_dicts(properties.get("subnets")):
                subnet_id = _resolve_existing_resource_id(_id_from_ref(subnet_ref), resource_ids)
                _add_explicit_edge(
                    edges,
                    _explicit_edge(current_id, subnet_id, relation_type="secures", evidence="nsg.subnets[].id"),
                )
            for nic_ref in _iter_dicts(properties.get("networkInterfaces")):
                nic_id = _resolve_existing_resource_id(_id_from_ref(nic_ref), resource_ids)
                _add_explicit_edge(
                    edges,
                    _explicit_edge(current_id, nic_id, relation_type="secures", evidence="nsg.networkInterfaces[].id"),
                )

        if resource_type == "microsoft.network/routetables":
            for subnet_ref in _iter_dicts(properties.get("subnets")):
                subnet_id = _resolve_existing_resource_id(_id_from_ref(subnet_ref), resource_ids)
                _add_explicit_edge(
                    edges,
                    _explicit_edge(current_id, subnet_id, relation_type="routes", evidence="routeTable.subnets[].id"),
                )

        if resource_type == "microsoft.network/virtualnetworks/subnets":
            nsg_id = _resolve_existing_resource_id(_id_from_ref(properties.get("networkSecurityGroup")), resource_ids)
            route_table_id = _resolve_existing_resource_id(_id_from_ref(properties.get("routeTable")), resource_ids)
            _add_explicit_edge(
                edges,
                _explicit_edge(nsg_id, current_id, relation_type="secures", evidence="subnet.networkSecurityGroup.id"),
            )
            _add_explicit_edge(
                edges,
                _explicit_edge(route_table_id, current_id, relation_type="routes", evidence="subnet.routeTable.id"),
            )

        if resource_type == "microsoft.network/privateendpoints":
            subnet_id = _resolve_existing_resource_id(_id_from_ref(properties.get("subnet")), resource_ids)
            _add_explicit_edge(
                edges,
                _explicit_edge(subnet_id, current_id, relation_type="connects_to", evidence="privateEndpoint.subnet.id"),
            )
            for connection in _iter_dicts(properties.get("privateLinkServiceConnections")):
                connection_props = connection.get("properties")
                connection_props = connection_props if isinstance(connection_props, dict) else {}
                target_id = _resolve_existing_resource_id(
                    connection_props.get("privateLinkServiceId"),
                    resource_ids,
                )
                _add_explicit_edge(
                    edges,
                    _explicit_edge(current_id, target_id, relation_type="connects_to", evidence="privateEndpoint.privateLinkServiceConnections[].privateLinkServiceId"),
                )

        if resource_type == "microsoft.network/publicipaddresses":
            ip_config_id = _resolve_existing_resource_id(_id_from_ref(properties.get("ipConfiguration")), resource_ids)
            _add_explicit_edge(
                edges,
                _explicit_edge(current_id, ip_config_id, relation_type="connects_to", evidence="publicIPAddress.ipConfiguration.id"),
            )

        if resource_type in {"microsoft.network/loadbalancers", "microsoft.network/applicationgateways"}:
            for pool in _iter_dicts(properties.get("backendAddressPools")):
                pool_props = _properties_from_ref(pool)
                for ip_config in _iter_dicts(pool_props.get("backendIPConfigurations")):
                    backend_id = _resolve_existing_resource_id(_id_from_ref(ip_config), resource_ids)
                    _add_explicit_edge(
                        edges,
                        _explicit_edge(current_id, backend_id, relation_type="connects_to", evidence="backendAddressPools[].backendIPConfigurations[].id"),
                    )

            for frontend_ip in _iter_dicts(properties.get("frontendIPConfigurations")):
                frontend_props = _properties_from_ref(frontend_ip)
                subnet_id = _resolve_existing_resource_id(_id_from_ref(frontend_props.get("subnet")), resource_ids)
                public_ip_id = _resolve_existing_resource_id(
                    _id_from_ref(frontend_props.get("publicIPAddress")),
                    resource_ids,
                )
                _add_explicit_edge(
                    edges,
                    _explicit_edge(subnet_id, current_id, relation_type="connects_to", evidence="frontendIPConfigurations[].subnet.id"),
                )
                _add_explicit_edge(
                    edges,
                    _explicit_edge(public_ip_id, current_id, relation_type="connects_to", evidence="frontendIPConfigurations[].publicIPAddress.id"),
                )

    deduped: dict[tuple[str, str, str, str], dict[str, Any]] = {}
    for edge in edges:
        key = (
            edge["source_node_key"],
            edge["target_node_key"],
            edge["relation_type"],
            edge["source"],
        )
        existing = deduped.get(key)
        if existing is None:
            deduped[key] = edge
            continue

        existing_evidence = existing.setdefault("evidence", [])
        for evidence in edge.get("evidence", []):
            if evidence not in existing_evidence:
                existing_evidence.append(evidence)
    return list(deduped.values())


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


def _anchor_token(value: str | None) -> str | None:
    if not value:
        return None

    raw_tokens = [token for token in value.lower().split("-") if token]
    if not raw_tokens:
        return None

    while raw_tokens and raw_tokens[0] in _NETWORK_NAME_PREFIX_TOKENS:
        raw_tokens.pop(0)

    while raw_tokens and raw_tokens[0] in _GENERIC_WORKLOAD_PREFIX_TOKENS:
        raw_tokens.pop(0)

    if not raw_tokens:
        return None

    anchor = raw_tokens[0]
    return anchor if len(anchor) >= 2 else None


def _resource_type_matches_prefixes(item: dict[str, Any], prefixes: tuple[str, ...]) -> bool:
    resource_type = _resource_type_lower(item)
    return any(resource_type.startswith(prefix) for prefix in prefixes)


def _workload_family_from_name(value: str | None) -> str | None:
    if not value:
        return None

    raw_tokens = [token for token in value.lower().split("-") if token]
    while raw_tokens and raw_tokens[0] in _NETWORK_NAME_PREFIX_TOKENS:
        raw_tokens.pop(0)

    if not raw_tokens:
        return None

    primary_token = raw_tokens[0]
    for family, hints in _WORKLOAD_FAMILY_NAME_HINTS.items():
        if primary_token in hints:
            return family

    return None


def _family_matches_candidate(network_item: dict[str, Any], candidate: dict[str, Any]) -> tuple[bool, str | None]:
    family = _workload_family_from_name(_resource_display_name(network_item))
    if not family:
        return True, None

    prefixes = _WORKLOAD_FAMILY_RESOURCE_TYPE_PREFIXES.get(family)
    if not prefixes:
        return True, None

    if _resource_type_matches_prefixes(candidate, prefixes):
        return True, family

    return False, family


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

    left_anchor = _anchor_token(left_display_name)
    right_anchor = _anchor_token(right_display_name)
    if left_anchor and right_anchor and left_anchor == right_anchor:
        evidence.append(f"anchor-prefix-match:{left_anchor}")
        score += 0.24

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

    family_ok, workload_family = _family_matches_candidate(network_item, candidate)
    if not family_ok:
        return None

    if _canonical(network_item.get("resource_group")) == _canonical(candidate.get("resource_group")):
        evidence.append("same-resource-group")
        score += 0.12

    evidence.append("compatible-resource-type")
    score += 0.18
    if workload_family:
        evidence.append(f"workload-family:{workload_family}")
        score += 0.08

    name_score, name_evidence = _name_evidence(network_item, candidate)
    score += name_score
    evidence.extend(name_evidence)

    strong_name_signal = any(
        item.startswith(("exact-name-match", "normalized-name-affinity", "anchor-prefix-match"))
        for item in name_evidence
    )
    threshold = 0.52 if relation_type in {"secures", "routes"} else 0.48
    if not strong_name_signal or score < threshold:
        return None

    confidence = min(0.92, round(score, 2))
    return {
        "source_node_key": f"resource:{network_id}",
        "target_node_key": f"resource:{candidate_id}",
        "relation_type": relation_type,
        "source": "azure",
        "confidence": confidence,
        "resolver": "network-heuristic-v3",
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
            if _is_network_candidate(item) or _resource_type_matches_prefixes(item, _WORKLOAD_TYPE_PREFIXES)
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
