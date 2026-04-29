from __future__ import annotations

import hashlib
import json
from typing import Any


def normalize_topology(topology: dict[str, Any]) -> dict[str, Any]:
    """Normalize topology data for archival.

    Applies deterministic sorting, strips UI-only layout state,
    keeps only diff-relevant attributes, and produces canonical JSON.

    Args:
        topology: Raw topology dict with 'nodes' and 'edges' lists.

    Returns:
        Normalized topology dict with sorted nodes/edges and canonical JSON strings.
    """
    nodes = topology.get("nodes", [])
    edges = topology.get("edges", [])

    # Strip UI-only layout state from nodes
    clean_nodes = [_strip_ui_state(node) for node in nodes if _is_valid_node(node)]

    # Sort nodes by node_key for deterministic ordering
    sorted_nodes = sorted(clean_nodes, key=lambda n: _node_key(n))

    # Strip UI-only state from edges and normalize
    clean_edges = [_strip_ui_state(edge) for edge in edges if _is_valid_edge(edge)]

    # Sort edges by (source_node_key, target_node_key, relation_type, source)
    sorted_edges = sorted(
        clean_edges,
        key=lambda e: (
            _edge_source_key(e),
            _edge_target_key(e),
            e.get("relation_type", ""),
            e.get("source", "azure"),
        ),
    )

    # Compute canonical JSON (compact, no whitespace, deterministic key order)
    nodes_canonical = json.dumps(sorted_nodes, separators=(",", ":"), sort_keys=True, ensure_ascii=False)
    edges_canonical = json.dumps(sorted_edges, separators=(",", ":"), sort_keys=True, ensure_ascii=False)

    # Compute deterministic hash of the canonical representation
    hash_input = f"{nodes_canonical}|{edges_canonical}"
    topology_hash = hashlib.sha256(hash_input.encode("utf-8")).hexdigest()

    return {
        "nodes_json": nodes_canonical,
        "edges_json": edges_canonical,
        "topology_hash": topology_hash,
        "node_count": len(sorted_nodes),
        "edge_count": len(sorted_edges),
        "nodes": sorted_nodes,
        "edges": sorted_edges,
    }


def _node_key(node: dict[str, Any]) -> str:
    """Extract a deterministic key for a node."""
    return (
        node.get("node_key", node.get("resource_id", node.get("id", "")))
        or node.get("manual_ref", "")
    )


def _edge_source_key(edge: dict[str, Any]) -> str:
    return edge.get("source_node_key", "")


def _edge_target_key(edge: dict[str, Any]) -> str:
    return edge.get("target_node_key", "")


def _strip_ui_state(item: dict[str, Any]) -> dict[str, Any]:
    """Remove UI-only fields that are not relevant for diffing."""
    UI_EXCLUDE = {"_layout_x", "_layout_y", "_layout_width", "_layout_height", "_expanded", "_collapsed", "_selected"}
    return {k: v for k, v in item.items() if k not in UI_EXCLUDE}


def _is_valid_node(node: dict[str, Any]) -> bool:
    """Check if a node has a valid key."""
    key = _node_key(node)
    return bool(key)


def _is_valid_edge(edge: dict[str, Any]) -> bool:
    """Check if an edge has valid source and target keys."""
    src = _edge_source_key(edge)
    tgt = _edge_target_key(edge)
    return bool(src) and bool(tgt)


def topology_diff(
    base_archive: dict[str, Any],
    target_archive: dict[str, Any],
    *,
    max_items: int = 100,
) -> dict[str, Any]:
    """Compute a diff between two topology archives.

    Returns node and edge deltas (added, removed, changed) with bounded list limits.

    Args:
        base_archive: Base archive dict with 'nodes_json' and 'edges_json'.
        target_archive: Target archive dict with 'nodes_json' and 'edges_json'.
        max_items: Maximum items to return per delta category.

    Returns:
        Diff result dict with node_delta, edge_delta, and summary.
    """
    try:
        base_nodes = json.loads(base_archive["nodes_json"])
        base_edges = json.loads(base_archive["edges_json"])
    except (json.JSONDecodeError, KeyError):
        base_nodes, base_edges = [], []

    try:
        target_nodes = json.loads(target_archive["nodes_json"])
        target_edges = json.loads(target_archive["edges_json"])
    except (json.JSONDecodeError, KeyError):
        target_nodes, target_edges = [], []

    # Build lookup maps
    base_node_map = {_node_key(n): n for n in base_nodes}
    target_node_map = {_node_key(n): n for n in target_nodes}

    base_edge_set = {_edge_signature(e): e for e in base_edges}
    target_edge_set = {_edge_signature(e): e for e in target_edges}

    # Node diff
    base_keys = set(base_node_map.keys())
    target_keys = set(target_node_map.keys())

    added_nodes = [target_node_map[k] for k in sorted(target_keys - base_keys)][:max_items]
    removed_nodes = [base_node_map[k] for k in sorted(base_keys - target_keys)][:max_items]

    # Changed nodes (present in both, but different)
    changed_nodes = []
    for k in sorted(base_keys & target_keys):
        if _nodes_differ(base_node_map[k], target_node_map[k]):
            changed_nodes.append({
                "node_key": k,
                "base": base_node_map[k],
                "target": target_node_map[k],
            })[:max_items] if len(changed_nodes) < max_items else None
    changed_nodes = changed_nodes[:max_items]

    # Edge diff
    base_edge_keys = set(base_edge_set.keys())
    target_edge_keys = set(target_edge_set.keys())

    added_edges = [target_edge_set[k] for k in sorted(target_edge_keys - base_edge_keys)][:max_items]
    removed_edges = [base_edge_set[k] for k in sorted(base_edge_keys - target_edge_keys)][:max_items]

    # Compute summary
    summary = []
    if added_nodes:
        summary.append(f"+{len(added_nodes)} node(s) added")
    if removed_nodes:
        summary.append(f"-{len(removed_nodes)} node(s) removed")
    if changed_nodes:
        summary.append(f"~{len(changed_nodes)} node(s) changed")
    if added_edges:
        summary.append(f"+{len(added_edges)} edge(s) added")
    if removed_edges:
        summary.append(f"-{len(removed_edges)} edge(s) removed")

    return {
        "node_delta": {
            "added": added_nodes,
            "removed": removed_nodes,
            "changed": changed_nodes,
        },
        "edge_delta": {
            "added": added_edges,
            "removed": removed_edges,
            "changed": [],
        },
        "summary": summary,
    }


def _edge_signature(edge: dict[str, Any]) -> str:
    """Create a deterministic key for an edge."""
    return f"{_edge_source_key(edge)}->{_edge_target_key(edge)}:{edge.get('relation_type', '')}:{edge.get('source', 'azure')}"


def _nodes_differ(a: dict[str, Any], b: dict[str, Any]) -> bool:
    """Check if two nodes differ in their diff-relevant attributes."""
    # Compare canonical JSON of stripped attributes
    def _diff_key(node: dict[str, Any]) -> str:
        return json.dumps({
            "node_key": node.get("node_key", ""),
            "node_type": node.get("node_type", ""),
            "display_name": node.get("display_name", ""),
            "source": node.get("source", ""),
            "resource_type": node.get("resource_type", ""),
            "location": node.get("location", ""),
            "tags": node.get("tags", {}),
        }, sort_keys=True, ensure_ascii=False)

    return _diff_key(a) != _diff_key(b)
