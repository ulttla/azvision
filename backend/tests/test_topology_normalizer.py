from __future__ import annotations

import json

import pytest

from app.services.topology_normalizer import (
    MAX_TOPOLOGY_ARCHIVE_BYTES,
    TopologyArchiveTooLargeError,
    _edge_signature,
    _edges_differ,
    _is_valid_edge,
    _is_valid_node,
    _node_key,
    _nodes_differ,
    _strip_ui_state,
    normalize_topology,
    topology_diff,
)


# ============================================================
# normalize_topology tests
# ============================================================


class TestNormalizeTopology:
    def test_empty_topology(self):
        result = normalize_topology({"nodes": [], "edges": []})
        assert result["node_count"] == 0
        assert result["edge_count"] == 0
        assert result["topology_hash"] != ""
        assert result["nodes_json"] == "[]"
        assert result["edges_json"] == "[]"

    def test_deterministic_hash(self):
        topology = {
            "nodes": [
                {"node_key": "b", "display_name": "B"},
                {"node_key": "a", "display_name": "A"},
            ],
            "edges": [
                {"source_node_key": "b", "target_node_key": "a", "relation_type": "contains"},
            ],
        }
        result = normalize_topology(topology)
        # Same input should always produce same hash
        result2 = normalize_topology(topology)
        assert result["topology_hash"] == result2["topology_hash"]

    def test_nodes_sorted_by_key(self):
        topology = {
            "nodes": [
                {"node_key": "zzz", "display_name": "Z"},
                {"node_key": "aaa", "display_name": "A"},
                {"node_key": "mmm", "display_name": "M"},
            ],
            "edges": [],
        }
        result = normalize_topology(topology)
        node_keys = [n["node_key"] for n in result["nodes"]]
        assert node_keys == ["aaa", "mmm", "zzz"]

    def test_edges_sorted_by_key(self):
        topology = {
            "nodes": [],
            "edges": [
                {"source_node_key": "b", "target_node_key": "a", "relation_type": "contains", "source": "azure"},
                {"source_node_key": "a", "target_node_key": "c", "relation_type": "contains", "source": "azure"},
                {"source_node_key": "a", "target_node_key": "b", "relation_type": "contains", "source": "azure"},
            ],
        }
        result = normalize_topology(topology)
        edge_keys = [(e["source_node_key"], e["target_node_key"]) for e in result["edges"]]
        assert edge_keys == [("a", "b"), ("a", "c"), ("b", "a")]

    def test_ui_state_stripped(self):
        topology = {
            "nodes": [
                {
                    "node_key": "a",
                    "display_name": "A",
                    "_layout_x": 100,
                    "_layout_y": 200,
                    "_expanded": True,
                    "source": "azure",
                },
            ],
            "edges": [],
        }
        result = normalize_topology(topology)
        node_json = json.loads(result["nodes_json"])
        assert "_layout_x" not in node_json[0]
        assert "_layout_y" not in node_json[0]
        assert "_expanded" not in node_json[0]
        assert "display_name" in node_json[0]
        assert "source" in node_json[0]

    def test_invalid_nodes_filtered(self):
        topology = {
            "nodes": [
                {"node_key": "valid", "display_name": "A"},
                {"display_name": "no_key"},  # missing node_key
                {},  # empty
            ],
            "edges": [],
        }
        result = normalize_topology(topology)
        assert result["node_count"] == 1

    def test_invalid_edges_filtered(self):
        topology = {
            "nodes": [
                {"node_key": "a", "display_name": "A"},
                {"node_key": "b", "display_name": "B"},
            ],
            "edges": [
                {"source_node_key": "a", "target_node_key": "b", "relation_type": "contains"},
                {"source_node_key": "", "target_node_key": "b", "relation_type": "contains"},  # missing source
                {},  # empty
            ],
        }
        result = normalize_topology(topology)
        assert result["edge_count"] == 1

    def test_canonical_json_is_compact(self):
        topology = {
            "nodes": [{"node_key": "a", "display_name": "A"}],
            "edges": [],
        }
        result = normalize_topology(topology)
        # Compact JSON should not contain spaces after separators
        assert ": " not in result["nodes_json"]

    def test_archive_bytes_reported(self):
        result = normalize_topology({"nodes": [{"node_key": "a"}], "edges": []})
        assert result["archive_bytes"] > 0

    def test_archive_size_guard_rejects_oversized_payload(self):
        oversized = "x" * (MAX_TOPOLOGY_ARCHIVE_BYTES + 1)
        with pytest.raises(TopologyArchiveTooLargeError):
            normalize_topology({"nodes": [{"node_key": "a", "display_name": oversized}], "edges": []})


# ============================================================
# topology_diff tests
# ============================================================


class TestTopologyDiff:
    def _make_archive(self, nodes, edges):
        return {"nodes_json": json.dumps(nodes, sort_keys=True), "edges_json": json.dumps(edges, sort_keys=True)}

    def test_no_changes(self):
        nodes = [{"node_key": "a", "display_name": "A"}]
        edges = [{"source_node_key": "a", "target_node_key": "a", "relation_type": "self"}]
        base = self._make_archive(nodes, edges)
        target = self._make_archive(nodes, edges)
        result = topology_diff(base, target)
        assert result["node_delta"]["added"] == []
        assert result["node_delta"]["removed"] == []
        assert result["node_delta"]["changed"] == []
        assert result["edge_delta"]["added"] == []
        assert result["edge_delta"]["removed"] == []

    def test_node_added(self):
        base = self._make_archive([{"node_key": "a"}], [])
        target = self._make_archive([{"node_key": "a"}, {"node_key": "b"}], [])
        result = topology_diff(base, target)
        assert len(result["node_delta"]["added"]) == 1
        assert result["node_delta"]["added"][0]["node_key"] == "b"

    def test_node_removed(self):
        base = self._make_archive([{"node_key": "a"}, {"node_key": "b"}], [])
        target = self._make_archive([{"node_key": "a"}], [])
        result = topology_diff(base, target)
        assert len(result["node_delta"]["removed"]) == 1
        assert result["node_delta"]["removed"][0]["node_key"] == "b"

    def test_node_changed(self):
        base = self._make_archive([{"node_key": "a", "display_name": "A-old"}], [])
        target = self._make_archive([{"node_key": "a", "display_name": "A-new"}], [])
        result = topology_diff(base, target)
        assert len(result["node_delta"]["changed"]) == 1
        assert result["node_delta"]["changed"][0]["node_key"] == "a"

    def test_edge_added(self):
        nodes = [{"node_key": "a"}, {"node_key": "b"}]
        base = self._make_archive(nodes, [])
        target = self._make_archive(nodes, [{"source_node_key": "a", "target_node_key": "b", "relation_type": "contains"}])
        result = topology_diff(base, target)
        assert len(result["edge_delta"]["added"]) == 1

    def test_edge_removed(self):
        nodes = [{"node_key": "a"}, {"node_key": "b"}]
        edge = {"source_node_key": "a", "target_node_key": "b", "relation_type": "contains"}
        base = self._make_archive(nodes, [edge])
        target = self._make_archive(nodes, [])
        result = topology_diff(base, target)
        assert len(result["edge_delta"]["removed"]) == 1

    def test_edge_changed_non_identity_attribute(self):
        nodes = [{"node_key": "a"}, {"node_key": "b"}]
        base_edge = {
            "source_node_key": "a",
            "target_node_key": "b",
            "relation_type": "routes",
            "source": "azure",
            "confidence": "low",
        }
        target_edge = {**base_edge, "confidence": "high"}
        base = self._make_archive(nodes, [base_edge])
        target = self._make_archive(nodes, [target_edge])
        result = topology_diff(base, target)
        assert result["edge_delta"]["added"] == []
        assert result["edge_delta"]["removed"] == []
        assert len(result["edge_delta"]["changed"]) == 1
        assert result["edge_delta"]["changed"][0]["edge_key"] == "a->b:routes:azure"
        assert any("edge(s) changed" in item for item in result["summary"])

    def test_missing_archive(self):
        base = {"nodes_json": "[]", "edges_json": "[]"}
        target = {"nodes_json": "invalid json", "edges_json": "[]"}
        result = topology_diff(base, target)
        # Should handle gracefully — invalid JSON parsed as empty
        assert result["node_delta"]["added"] == []
        assert result["edge_delta"]["added"] == []
        # Summary may be empty when both sides effectively have no data
        assert isinstance(result["summary"], list)

    def test_max_items_bound(self):
        base = self._make_archive([{"node_key": f"a{i}"} for i in range(10)], [])
        target = self._make_archive([{"node_key": f"a{i}"} for i in range(5, 15)], [])
        result = topology_diff(base, target, max_items=3)
        assert len(result["node_delta"]["added"]) <= 3
        assert len(result["node_delta"]["removed"]) <= 3

    def test_summary_contains_delta_info(self):
        base = self._make_archive([{"node_key": "a"}], [])
        target = self._make_archive([{"node_key": "a"}, {"node_key": "b"}], [])
        result = topology_diff(base, target)
        assert any("+1" in s for s in result["summary"])


# ============================================================
# Helper function tests
# ============================================================


class TestHelpers:
    def test_node_key(self):
        assert _node_key({"node_key": "abc"}) == "abc"
        assert _node_key({"resource_id": "xyz"}) == "xyz"
        assert _node_key({"id": "123"}) == "123"

    def test_strip_ui_state(self):
        item = {"node_key": "a", "display_name": "A", "_layout_x": 100, "_expanded": True}
        result = _strip_ui_state(item)
        assert "node_key" in result
        assert "_layout_x" not in result
        assert "_expanded" not in result

    def test_edge_signature(self):
        edge = {"source_node_key": "a", "target_node_key": "b", "relation_type": "contains", "source": "azure"}
        assert _edge_signature(edge) == "a->b:contains:azure"

    def test_is_valid_node(self):
        assert _is_valid_node({"node_key": "a"}) is True
        assert _is_valid_node({}) is False

    def test_is_valid_edge(self):
        assert _is_valid_edge({"source_node_key": "a", "target_node_key": "b"}) is True
        assert _is_valid_edge({"source_node_key": ""}) is False

    def test_edges_differ_ignores_identity_fields(self):
        a = {"source_node_key": "a", "target_node_key": "b", "relation_type": "routes", "source": "azure", "confidence": "low"}
        b = {"source_node_key": "a", "target_node_key": "b", "relation_type": "routes", "source": "azure", "confidence": "low"}
        c = {"source_node_key": "a", "target_node_key": "b", "relation_type": "routes", "source": "azure", "confidence": "high"}
        d = {"source_node_key": "x", "target_node_key": "y", "relation_type": "contains", "source": "manual", "confidence": "low"}
        assert _edges_differ(a, b) is False
        assert _edges_differ(a, c) is True
        assert _edges_differ(a, d) is False

    def test_nodes_differ(self):
        a = {"node_key": "a", "display_name": "A", "source": "azure", "resource_type": "vm", "location": "canadacentral", "tags": {"env": "prod"}}
        b = {"node_key": "a", "display_name": "A", "source": "azure", "resource_type": "vm", "location": "canadacentral", "tags": {"env": "prod"}}
        c = {"node_key": "a", "display_name": "A", "source": "azure", "resource_type": "vm", "location": "eastus", "tags": {"env": "prod"}}
        assert _nodes_differ(a, b) is False
        assert _nodes_differ(a, c) is True
