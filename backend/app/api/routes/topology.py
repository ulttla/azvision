from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app.collectors.azure_inventory import (
    AzureInventoryCollection,
    AzureInventoryError,
    resolve_inventory_collection,
)
from app.core.config import get_settings
from app.repositories.manual_model import ManualModelRepository
from app.services.topology_inference import infer_network_relationship_edges

router = APIRouter(prefix="/workspaces/{workspace_id}/topology", tags=["topology"])


def _projection_mode_label(source_mode: str) -> str:
    return "mock-inventory-projection" if source_mode == "mock" else "live-inventory-projection"


def _canonical(value: str | None) -> str | None:
    if value is None:
        return None
    return value.strip().lower()


def _arm_id_parts(resource_id: str | None) -> list[str]:
    if not resource_id:
        return []
    return [part for part in resource_id.split("/") if part]


def _extract_subscription_id_from_resource_id(resource_id: str | None) -> str | None:
    parts = _arm_id_parts(resource_id)
    try:
        subscriptions_index = parts.index("subscriptions")
        return parts[subscriptions_index + 1]
    except (ValueError, IndexError):
        return None


def _build_resource_group_id(subscription_id: str | None, resource_group_name: str | None) -> str | None:
    if not subscription_id or not resource_group_name:
        return None
    return f"/subscriptions/{subscription_id}/resourceGroups/{resource_group_name}"


def _extract_parent_resource_id(resource_id: str | None) -> str | None:
    parts = _arm_id_parts(resource_id)
    if not parts:
        return None

    try:
        providers_index = parts.index("providers")
    except ValueError:
        return None

    try:
        subscription_id = parts[parts.index("subscriptions") + 1]
        resource_group_name = parts[parts.index("resourceGroups") + 1]
    except (ValueError, IndexError):
        return None

    provider_parts = parts[providers_index + 1 :]
    if len(provider_parts) < 5:
        return None

    namespace = provider_parts[0]
    type_and_name_parts = provider_parts[1:]
    pair_count = len(type_and_name_parts) // 2
    if pair_count < 2:
        return None

    parent_pairs = type_and_name_parts[: (pair_count - 1) * 2]
    return (
        f"/subscriptions/{subscription_id}/resourceGroups/{resource_group_name}"
        f"/providers/{namespace}/{'/'.join(parent_pairs)}"
    )


def _resource_display_name(resource: dict[str, Any]) -> str:
    name = resource.get("name")
    if isinstance(name, str) and name:
        return name.split("/")[-1]
    resource_id = resource.get("id")
    if isinstance(resource_id, str) and resource_id:
        return resource_id.rstrip("/").split("/")[-1]
    return "resource"


def _subscription_node(item: dict[str, Any]) -> dict[str, Any]:
    subscription_id = item.get("subscription_id")
    return {
        "node_key": f"subscription:{subscription_id}",
        "node_type": "subscription",
        "node_ref": subscription_id,
        "display_name": item.get("display_name") or subscription_id,
        "source": item.get("source", "azure"),
        "confidence": 1.0,
        "state": item.get("state"),
        "tenant_id": item.get("tenant_id"),
    }


def _resource_group_node(item: dict[str, Any]) -> dict[str, Any]:
    resource_group_id = item.get("id") or _build_resource_group_id(
        item.get("subscription_id"),
        item.get("name"),
    )
    return {
        "node_key": f"resourcegroup:{resource_group_id}",
        "node_type": "resourcegroup",
        "node_ref": resource_group_id,
        "display_name": item.get("name") or resource_group_id,
        "source": item.get("source", "azure"),
        "confidence": 1.0,
        "subscription_id": item.get("subscription_id"),
        "location": item.get("location"),
        "managed_by": item.get("managed_by"),
        "tags": item.get("tags") or {},
    }


def _resource_node(
    item: dict[str, Any],
    *,
    child_summary: dict[str, Any] | None = None,
    is_expanded: bool = False,
) -> dict[str, Any]:
    resource_id = item.get("id")
    parent_resource_id = _extract_parent_resource_id(resource_id)
    return {
        "node_key": f"resource:{resource_id}",
        "node_type": "resource",
        "node_ref": resource_id,
        "display_name": _resource_display_name(item),
        "source": item.get("source", "azure"),
        "confidence": 1.0,
        "subscription_id": item.get("subscription_id") or _extract_subscription_id_from_resource_id(resource_id),
        "resource_group": item.get("resource_group"),
        "resource_type": item.get("type"),
        "kind": item.get("kind"),
        "location": item.get("location"),
        "tags": item.get("tags") or {},
        "parent_resource_id": parent_resource_id,
        "child_summary": child_summary,
        "is_expanded": is_expanded,
    }


def _resource_type_lower(item: dict[str, Any]) -> str:
    return str(item.get("type") or "").lower()


def _is_managed_instance(item: dict[str, Any]) -> bool:
    return _resource_type_lower(item) == "microsoft.sql/managedinstances"


def _is_managed_instance_child(item: dict[str, Any]) -> bool:
    return _resource_type_lower(item).startswith("microsoft.sql/managedinstances/")


def _build_child_summary(children: list[dict[str, Any]], *, expanded: bool = False) -> dict[str, Any] | None:
    if not children:
        return None

    type_counts: dict[str, int] = {}
    sample_names: list[str] = []
    for child in children:
        child_type = _resource_type_lower(child).split("/")[-1] or "child"
        type_counts[child_type] = type_counts.get(child_type, 0) + 1
        if len(sample_names) < 5:
            sample_names.append(_resource_display_name(child))

    return {
        "total": len(children),
        "type_counts": type_counts,
        "sample_names": sample_names,
        "collapsed": not expanded,
        "expanded": expanded,
    }


def _relation_category(relation_type: str) -> str:
    if relation_type in {"contains", "manages"}:
        return "structural"
    if relation_type in {"connects_to", "secures", "routes"}:
        return "network"
    return "other"


def _edge_key(edge: dict[str, Any]) -> tuple[str, str, str, str]:
    return (
        edge["source_node_key"],
        edge["target_node_key"],
        edge["relation_type"],
        edge["source"],
    )


def _add_node(nodes_by_key: dict[str, dict[str, Any]], node: dict[str, Any]) -> None:
    node_key = node.get("node_key")
    if not node_key:
        return
    nodes_by_key.setdefault(node_key, node)


def _add_edge(edges_by_key: dict[tuple[str, str, str, str], dict[str, Any]], edge: dict[str, Any]) -> None:
    source_node_key = edge.get("source_node_key")
    target_node_key = edge.get("target_node_key")
    relation_type = edge.get("relation_type")
    source = edge.get("source")
    if not source_node_key or not target_node_key or not relation_type or not source:
        return

    edge.setdefault("relation_category", _relation_category(str(relation_type)))
    edges_by_key.setdefault(_edge_key(edge), edge)


def _project_live_topology(
    workspace_id: str,
    collection: AzureInventoryCollection,
    *,
    projection_mode: str = "live-inventory-projection",
    include_network_inference: bool = False,
    collapse_managed_instance_children: bool = True,
    expanded_node_ref: str | None = None,
    resource_group_name: str | None = None,
) -> dict[str, Any]:
    nodes_by_key: dict[str, dict[str, Any]] = {}
    edges_by_key: dict[tuple[str, str, str, str], dict[str, Any]] = {}

    expanded_node_ref_canonical = _canonical(expanded_node_ref)
    subscriptions_by_id = {
        item["subscription_id"]: item
        for item in collection.subscriptions
        if item.get("subscription_id")
    }
    resource_groups_by_key = {
        (
            item.get("subscription_id"),
            _canonical(item.get("name")),
        ): item
        for item in collection.resource_groups
        if item.get("subscription_id") and item.get("name")
    }
    all_resources_by_id = {
        _canonical(item.get("id")): item
        for item in collection.resources
        if item.get("id")
    }

    managed_instance_children_by_parent: dict[str, list[dict[str, Any]]] = {}
    projected_resources: list[dict[str, Any]] = []
    hidden_resource_count = 0

    for resource in collection.resources:
        resource_id = resource.get("id")
        canonical_resource_id = _canonical(resource_id)
        if _is_managed_instance_child(resource):
            parent_resource_id = _extract_parent_resource_id(resource_id)
            canonical_parent_id = _canonical(parent_resource_id)
            if canonical_parent_id:
                managed_instance_children_by_parent.setdefault(canonical_parent_id, []).append(resource)

            if (
                collapse_managed_instance_children
                and canonical_parent_id
                and canonical_parent_id in all_resources_by_id
                and _is_managed_instance(all_resources_by_id[canonical_parent_id])
                and canonical_parent_id != expanded_node_ref_canonical
            ):
                hidden_resource_count += 1
                continue

        projected_resources.append(resource)

    resources_by_id = {
        _canonical(item.get("id")): item
        for item in projected_resources
        if item.get("id")
    }

    for subscription in collection.subscriptions:
        _add_node(nodes_by_key, _subscription_node(subscription))

    for resource_group in collection.resource_groups:
        resource_group_id = resource_group.get("id") or _build_resource_group_id(
            resource_group.get("subscription_id"),
            resource_group.get("name"),
        )
        if not resource_group_id:
            continue

        _add_node(nodes_by_key, _resource_group_node(resource_group))

        subscription_id = resource_group.get("subscription_id")
        if subscription_id and subscription_id in subscriptions_by_id:
            _add_edge(
                edges_by_key,
                {
                    "source_node_key": f"subscription:{subscription_id}",
                    "target_node_key": f"resourcegroup:{resource_group_id}",
                    "relation_type": "contains",
                    "source": "azure",
                    "confidence": 1.0,
                },
            )

    for resource in projected_resources:
        resource_id = resource.get("id")
        if not resource_id:
            continue

        child_summary = None
        is_expanded = False
        canonical_resource_id = _canonical(resource_id)
        if _is_managed_instance(resource):
            is_expanded = canonical_resource_id == expanded_node_ref_canonical
            child_summary = _build_child_summary(
                managed_instance_children_by_parent.get(canonical_resource_id, []),
                expanded=is_expanded,
            )

        _add_node(
            nodes_by_key,
            _resource_node(
                resource,
                child_summary=child_summary,
                is_expanded=is_expanded,
            ),
        )

    for resource in projected_resources:
        resource_id = resource.get("id")
        if not resource_id:
            continue

        resource_node_key = f"resource:{resource_id}"
        parent_resource_id = _extract_parent_resource_id(resource_id)
        parent_resource = resources_by_id.get(_canonical(parent_resource_id)) if parent_resource_id else None

        if parent_resource and parent_resource.get("id"):
            _add_edge(
                edges_by_key,
                {
                    "source_node_key": f"resource:{parent_resource['id']}",
                    "target_node_key": resource_node_key,
                    "relation_type": "contains",
                    "source": "azure",
                    "confidence": 0.98,
                },
            )
            continue

        subscription_id = resource.get("subscription_id") or _extract_subscription_id_from_resource_id(resource_id)
        resource_group_name_value = resource.get("resource_group")
        resource_group = resource_groups_by_key.get((subscription_id, _canonical(resource_group_name_value)))
        resource_group_id = None
        if resource_group:
            resource_group_id = resource_group.get("id") or _build_resource_group_id(
                resource_group.get("subscription_id"),
                resource_group.get("name"),
            )

        if resource_group_id:
            _add_edge(
                edges_by_key,
                {
                    "source_node_key": f"resourcegroup:{resource_group_id}",
                    "target_node_key": resource_node_key,
                    "relation_type": "contains",
                    "source": "azure",
                    "confidence": 1.0,
                },
            )
        elif subscription_id and subscription_id in subscriptions_by_id:
            _add_edge(
                edges_by_key,
                {
                    "source_node_key": f"subscription:{subscription_id}",
                    "target_node_key": resource_node_key,
                    "relation_type": "contains",
                    "source": "azure",
                    "confidence": 0.7,
                },
            )

    for resource_group in collection.resource_groups:
        managed_by_id = resource_group.get("managed_by")
        if not managed_by_id:
            continue

        manager_resource = resources_by_id.get(_canonical(managed_by_id))
        resource_group_id = resource_group.get("id") or _build_resource_group_id(
            resource_group.get("subscription_id"),
            resource_group.get("name"),
        )
        if not manager_resource or not resource_group_id:
            continue

        _add_edge(
            edges_by_key,
            {
                "source_node_key": f"resource:{manager_resource['id']}",
                "target_node_key": f"resourcegroup:{resource_group_id}",
                "relation_type": "manages",
                "source": "azure",
                "confidence": 0.95,
            },
        )

    if include_network_inference:
        for inferred_edge in infer_network_relationship_edges(projected_resources):
            _add_edge(edges_by_key, inferred_edge)

    # Merge manual nodes and edges from DB
    manual_repo = ManualModelRepository()
    for manual_node in manual_repo.get_manual_nodes_as_topology_nodes(workspace_id):
        _add_node(nodes_by_key, manual_node)
    for manual_edge in manual_repo.get_manual_edges_as_topology_edges(workspace_id):
        _add_edge(edges_by_key, manual_edge)

    nodes = sorted(
        nodes_by_key.values(),
        key=lambda node: (
            node.get("node_type", ""),
            str(node.get("display_name", "")).lower(),
            node.get("node_key", ""),
        ),
    )
    edges = sorted(
        edges_by_key.values(),
        key=lambda edge: (
            edge.get("source_node_key", ""),
            edge.get("relation_type", ""),
            edge.get("target_node_key", ""),
        ),
    )

    relation_counts: dict[str, int] = {}
    for edge in edges:
        relation_type = str(edge.get("relation_type") or "unknown")
        relation_counts[relation_type] = relation_counts.get(relation_type, 0) + 1

    return {
        "ok": True,
        "workspace_id": workspace_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": projection_mode,
        "options": {
            "include_network_inference": include_network_inference,
            "collapse_managed_instance_children": collapse_managed_instance_children,
            "expanded_node_ref": expanded_node_ref,
            "resource_group_name": resource_group_name,
        },
        "summary": {
            "subscription_count": len(collection.subscriptions),
            "resource_group_count": len(collection.resource_groups),
            "resource_count": len(projected_resources),
            "hidden_resource_count": hidden_resource_count,
            "node_count": len(nodes),
            "edge_count": len(edges),
            "relation_counts": relation_counts,
        },
        "nodes": nodes,
        "edges": edges,
    }


def _manual_node_detail(workspace_id: str, node_ref: str) -> dict[str, Any]:
    repo = _manual_repo()
    manual_node = repo.get_manual_node(workspace_id, node_ref)
    if manual_node is None:
        raise HTTPException(status_code=404, detail="Requested manual node was not found in workspace storage.")

    return {
        "ok": True,
        "workspace_id": workspace_id,
        "node_key": f"manual:{manual_node['manual_ref']}",
        "node_type": "manual",
        "node_ref": manual_node["manual_ref"],
        "display_name": manual_node["display_name"],
        "source": "manual",
        "confidence": manual_node.get("confidence", 1.0),
        "details": {
            "mode": "manual-db",
            "manual_type": manual_node.get("manual_type"),
            "vendor": manual_node.get("vendor"),
            "environment": manual_node.get("environment"),
            "notes": manual_node.get("notes"),
        },
    }


def _subscription_detail(
    workspace_id: str,
    item: dict[str, Any],
    *,
    projection_mode: str,
    subscription_id: str | None = None,
    resource_group_name: str | None = None,
) -> dict[str, Any]:
    subscription_id = item.get("subscription_id")
    return {
        "ok": True,
        "workspace_id": workspace_id,
        "node_key": f"subscription:{subscription_id}",
        "node_type": "subscription",
        "node_ref": subscription_id,
        "display_name": item.get("display_name") or subscription_id,
        "source": item.get("source", "azure"),
        "confidence": 1.0,
        "details": {
            "mode": projection_mode,
            "subscription_id": subscription_id,
            "display_name": item.get("display_name"),
            "state": item.get("state"),
            "tenant_id": item.get("tenant_id"),
            "scope": {
                "subscription_id": subscription_id,
                "resource_group_name": resource_group_name,
            },
        },
    }


def _resource_group_detail(
    workspace_id: str,
    item: dict[str, Any],
    *,
    projection_mode: str,
    subscription_id: str | None = None,
    resource_group_name: str | None = None,
) -> dict[str, Any]:
    resource_group_id = item.get("id") or _build_resource_group_id(
        item.get("subscription_id"),
        item.get("name"),
    )
    return {
        "ok": True,
        "workspace_id": workspace_id,
        "node_key": f"resourcegroup:{resource_group_id}",
        "node_type": "resourcegroup",
        "node_ref": resource_group_id,
        "display_name": item.get("name") or resource_group_id,
        "source": item.get("source", "azure"),
        "confidence": 1.0,
        "details": {
            "mode": projection_mode,
            "subscription_id": item.get("subscription_id"),
            "resource_group_name": item.get("name"),
            "location": item.get("location"),
            "managed_by": item.get("managed_by"),
            "tags": item.get("tags") or {},
            "scope": {
                "subscription_id": subscription_id,
                "resource_group_name": resource_group_name,
            },
        },
    }


def _resource_detail(
    workspace_id: str,
    item: dict[str, Any],
    *,
    projection_mode: str,
    subscription_id: str | None = None,
    resource_group_name: str | None = None,
    child_summary: dict[str, Any] | None = None,
) -> dict[str, Any]:
    resource_id = item.get("id")
    return {
        "ok": True,
        "workspace_id": workspace_id,
        "node_key": f"resource:{resource_id}",
        "node_type": "resource",
        "node_ref": resource_id,
        "display_name": _resource_display_name(item),
        "source": item.get("source", "azure"),
        "confidence": 1.0,
        "details": {
            "mode": projection_mode,
            "subscription_id": item.get("subscription_id") or _extract_subscription_id_from_resource_id(resource_id),
            "resource_group": item.get("resource_group"),
            "resource_type": item.get("type"),
            "kind": item.get("kind"),
            "location": item.get("location"),
            "tags": item.get("tags") or {},
            "parent_resource_id": _extract_parent_resource_id(resource_id),
            "child_summary": child_summary,
            "scope": {
                "subscription_id": subscription_id,
                "resource_group_name": resource_group_name,
            },
        },
    }


@router.get("")
def get_topology(
    workspace_id: str,
    subscription_id: str | None = Query(default=None),
    resource_group_name: str | None = Query(default=None),
    resource_group_limit: int = Query(default=200, ge=1, le=500),
    resource_limit: int = Query(default=200, ge=1, le=500),
    include_network_inference: bool = Query(default=False),
    collapse_managed_instance_children: bool = Query(default=True),
    expanded_node_ref: str | None = Query(default=None),
) -> dict[str, Any]:
    settings = get_settings()
    # AzureInventoryError (subclass of AzureClientError) propagates to global 502 handler.
    resolution = resolve_inventory_collection(
        settings,
        subscription_id=subscription_id,
        resource_group_name=resource_group_name,
        resource_group_limit=resource_group_limit,
        resource_limit=resource_limit,
    )
    return _project_live_topology(
        workspace_id,
        resolution.collection,
        projection_mode=_projection_mode_label(resolution.mode),
        include_network_inference=include_network_inference,
        collapse_managed_instance_children=collapse_managed_instance_children,
        expanded_node_ref=expanded_node_ref,
        resource_group_name=resource_group_name,
    )


@router.get("/node-detail")
def get_node_detail(
    workspace_id: str,
    node_type: str = Query(...),
    node_ref: str = Query(...),
    subscription_id: str | None = Query(default=None),
    resource_group_name: str | None = Query(default=None),
    resource_group_limit: int = Query(default=200, ge=1, le=500),
    resource_limit: int = Query(default=500, ge=1, le=1000),
) -> dict[str, Any]:
    if node_type == "manual":
        return _manual_node_detail(workspace_id, node_ref)

    settings = get_settings()
    # AzureInventoryError (subclass of AzureClientError) propagates to global 502 handler.
    resolution = resolve_inventory_collection(
        settings,
        subscription_id=subscription_id,
        resource_group_name=resource_group_name,
        resource_group_limit=resource_group_limit,
        resource_limit=resource_limit,
    )
    collection = resolution.collection
    projection_mode = _projection_mode_label(resolution.mode)

    if node_type == "subscription":
        item = next(
            (subscription for subscription in collection.subscriptions if subscription.get("subscription_id") == node_ref),
            None,
        )
        if item:
            return _subscription_detail(
                workspace_id,
                item,
                projection_mode=projection_mode,
                subscription_id=subscription_id,
                resource_group_name=resource_group_name,
            )

    if node_type == "resourcegroup":
        item = next(
            (
                resource_group
                for resource_group in collection.resource_groups
                if _canonical(resource_group.get("id")) == _canonical(node_ref)
            ),
            None,
        )
        if item:
            return _resource_group_detail(
                workspace_id,
                item,
                projection_mode=projection_mode,
                subscription_id=subscription_id,
                resource_group_name=resource_group_name,
            )

    if node_type == "resource":
        item = next(
            (
                resource
                for resource in collection.resources
                if _canonical(resource.get("id")) == _canonical(node_ref)
            ),
            None,
        )
        if item:
            child_summary = None
            if _is_managed_instance(item):
                child_resources = [
                    resource
                    for resource in collection.resources
                    if _is_managed_instance_child(resource)
                    and _canonical(_extract_parent_resource_id(resource.get("id"))) == _canonical(node_ref)
                ]
                child_summary = _build_child_summary(child_resources)

            return _resource_detail(
                workspace_id,
                item,
                projection_mode=projection_mode,
                subscription_id=subscription_id,
                resource_group_name=resource_group_name,
                child_summary=child_summary,
            )

    raise HTTPException(status_code=404, detail="Requested node was not found within the current scoped live inventory window.")


def _manual_repo() -> ManualModelRepository:
    return ManualModelRepository()


def _available_node_keys_for_manual_edges(workspace_id: str) -> set[str]:
    node_keys = {
        node["node_key"] for node in _manual_repo().get_manual_nodes_as_topology_nodes(workspace_id)
    }

    settings = get_settings()
    try:
        resolution = resolve_inventory_collection(
            settings,
            resource_group_limit=500,
            resource_limit=1000,
        )
        projected = _project_live_topology(
            workspace_id,
            resolution.collection,
            projection_mode=_projection_mode_label(resolution.mode),
            include_network_inference=False,
            collapse_managed_instance_children=False,
        )
        node_keys.update(node["node_key"] for node in projected.get("nodes", []))
    except AzureInventoryError:
        pass

    return node_keys


def _validate_manual_edge_payload(workspace_id: str, payload: dict[str, Any]) -> None:
    source_node_key = str(payload.get("source_node_key") or "").strip()
    target_node_key = str(payload.get("target_node_key") or "").strip()
    if not source_node_key or not target_node_key:
        raise HTTPException(status_code=400, detail="source_node_key and target_node_key are required")

    available_node_keys = _available_node_keys_for_manual_edges(workspace_id)
    missing = [
        node_key
        for node_key in (source_node_key, target_node_key)
        if node_key not in available_node_keys
    ]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown node_key reference(s): {', '.join(missing)}",
        )


def _serialize_manual_node(node: dict[str, Any]) -> dict[str, Any]:
    return {
        **node,
        "node_key": f"manual:{node['manual_ref']}",
        "node_type": "manual",
        "node_ref": node["manual_ref"],
    }


@router.post("/manual-nodes")
def create_manual_node(workspace_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    repo = _manual_repo()
    created = repo.create_manual_node(workspace_id, payload)
    return {
        "ok": True,
        "status": "created",
        **_serialize_manual_node(created),
    }


@router.post("/manual-edges")
def create_manual_edge(workspace_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    _validate_manual_edge_payload(workspace_id, payload)
    repo = _manual_repo()
    created = repo.create_manual_edge(workspace_id, payload)
    return {
        "ok": True,
        "status": "created",
        **created,
    }


@router.get("/manual-nodes")
def list_manual_nodes(workspace_id: str) -> dict[str, Any]:
    repo = _manual_repo()
    nodes = repo.list_manual_nodes(workspace_id)
    return {
        "ok": True,
        "workspace_id": workspace_id,
        "items": [_serialize_manual_node(node) for node in nodes],
    }


@router.get("/manual-edges")
def list_manual_edges(workspace_id: str) -> dict[str, Any]:
    repo = _manual_repo()
    return {
        "ok": True,
        "workspace_id": workspace_id,
        "items": repo.list_manual_edges(workspace_id),
    }


@router.patch("/manual-nodes/{manual_node_ref}")
def update_manual_node(
    workspace_id: str,
    manual_node_ref: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    repo = _manual_repo()
    updated = repo.update_manual_node(workspace_id, manual_node_ref, payload)
    if updated is None:
        raise HTTPException(status_code=404, detail="Requested manual node was not found.")
    return {
        "ok": True,
        "status": "updated",
        **_serialize_manual_node(updated),
    }


@router.patch("/manual-edges/{manual_edge_ref}")
def update_manual_edge(
    workspace_id: str,
    manual_edge_ref: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    repo = _manual_repo()
    current = repo.get_manual_edge(workspace_id, manual_edge_ref)
    if current is None:
        raise HTTPException(status_code=404, detail="Requested manual edge was not found.")

    merged_payload = {**current, **payload}
    _validate_manual_edge_payload(workspace_id, merged_payload)
    updated = repo.update_manual_edge(workspace_id, manual_edge_ref, payload)
    if updated is None:
        raise HTTPException(status_code=404, detail="Requested manual edge was not found.")
    return {"ok": True, "status": "updated", **updated}


@router.delete("/manual-nodes/{manual_node_ref}")
def delete_manual_node(workspace_id: str, manual_node_ref: str) -> dict[str, Any]:
    repo = _manual_repo()
    deleted = repo.delete_manual_node(workspace_id, manual_node_ref)
    if deleted:
        return {
            "ok": True,
            "workspace_id": workspace_id,
            "manual_ref": manual_node_ref,
            "status": "deleted",
        }
    raise HTTPException(status_code=404, detail="Requested manual node was not found.")


@router.delete("/manual-edges/{manual_edge_ref}")
def delete_manual_edge(workspace_id: str, manual_edge_ref: str) -> dict[str, Any]:
    repo = _manual_repo()
    deleted = repo.delete_manual_edge(workspace_id, manual_edge_ref)
    if deleted:
        return {
            "ok": True,
            "workspace_id": workspace_id,
            "manual_edge_ref": manual_edge_ref,
            "status": "deleted",
        }
    raise HTTPException(status_code=404, detail="Requested manual edge was not found.")
