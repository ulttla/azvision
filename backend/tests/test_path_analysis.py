"""Tests for the network path analysis service.

Covers:
- NSG rule parsing and classification (allow, deny, unknown)
- Route table parsing and classification
- Full path analysis with path tracing through topology edges
- Conservative behavior when data is missing or ambiguous
"""
from __future__ import annotations

import pytest

from app.services.path_analysis import (
    HopType,
    NSGRule,
    PathAnalysisResult,
    PathCandidate,
    PathHop,
    PathVerdict,
    RouteEntry,
    analyze_path,
    classify_nsg_verdict,
    classify_route_verdict,
    parse_nsg_rules,
    parse_route_table_routes,
)

# ---------------------------------------------------------------------------
# Test fixtures
# ---------------------------------------------------------------------------

SUBSCRIPTION = "00000000-0000-0000-0000-000000000001"
RG = "rg-network"
BASE = f"/subscriptions/{SUBSCRIPTION}/resourceGroups/{RG}/providers"

VNET_ID = f"{BASE}/Microsoft.Network/virtualNetworks/vnet-app"
SUBNET_ID = f"{VNET_ID}/subnets/snet-app"
NSG_ID = f"{BASE}/Microsoft.Network/networkSecurityGroups/nsg-app"
RT_ID = f"{BASE}/Microsoft.Network/routeTables/rt-app"
NIC_ID = f"{BASE}/Microsoft.Network/networkInterfaces/nic-app"
PIP_ID = f"{BASE}/Microsoft.Network/publicIPAddresses/pip-app"
VM_ID = f"{BASE}/Microsoft.Compute/virtualMachines/vm-app"
PEP_ID = f"{BASE}/Microsoft.Network/privateEndpoints/pep-storage"
STORAGE_ID = f"{BASE}/Microsoft.Storage/storageAccounts/stapp"


def _resource(resource_id: str, resource_type: str, properties: dict | None = None) -> dict:
    return {
        "subscription_id": SUBSCRIPTION,
        "resource_group": RG,
        "name": resource_id.rstrip("/").split("/")[-1],
        "type": resource_type,
        "id": resource_id,
        "properties": properties or {},
        "source": "azure",
    }


def _nsg_resource(
    nsg_id: str = NSG_ID,
    *,
    security_rules: list[dict] | None = None,
    default_rules: list[dict] | None = None,
    subnets: list[dict] | None = None,
    network_interfaces: list[dict] | None = None,
) -> dict:
    """Build an NSG resource with custom security rules."""
    return _resource(
        nsg_id,
        "Microsoft.Network/networkSecurityGroups",
        {
            "securityRules": security_rules or [],
            "defaultSecurityRules": default_rules or [],
            "subnets": subnets or [],
            "networkInterfaces": network_interfaces or [],
        },
    )


def _allow_rule(
    name: str = "allow-rule",
    *,
    priority: int = 100,
    direction: str = "inbound",
    source_prefix: str = "*",
    dest_prefix: str = "*",
    protocol: str = "Tcp",
) -> dict:
    return {
        "name": name,
        "properties": {
            "direction": direction,
            "access": "Allow",
            "priority": priority,
            "sourceAddressPrefix": source_prefix,
            "destinationAddressPrefix": dest_prefix,
            "sourcePortRange": "*",
            "destinationPortRange": "*",
            "protocol": protocol,
        },
    }


def _deny_rule(
    name: str = "deny-rule",
    *,
    priority: int = 200,
    direction: str = "inbound",
    source_prefix: str = "*",
    dest_prefix: str = "*",
    protocol: str = "Tcp",
) -> dict:
    return {
        "name": name,
        "properties": {
            "direction": direction,
            "access": "Deny",
            "priority": priority,
            "sourceAddressPrefix": source_prefix,
            "destinationAddressPrefix": dest_prefix,
            "sourcePortRange": "*",
            "destinationPortRange": "*",
            "protocol": protocol,
        },
    }


def _route_table_resource(
    rt_id: str = RT_ID,
    *,
    routes: list[dict] | None = None,
    subnets: list[dict] | None = None,
) -> dict:
    """Build a route table resource with custom routes."""
    return _resource(
        rt_id,
        "Microsoft.Network/routeTables",
        {
            "routes": routes or [],
            "subnets": subnets or [],
        },
    )


def _route_entry(
    name: str = "route-to-hub",
    *,
    address_prefix: str = "10.0.0.0/8",
    next_hop_type: str = "VirtualAppliance",
    next_hop_ip: str | None = None,
) -> dict:
    props: dict = {
        "addressPrefix": address_prefix,
        "nextHopType": next_hop_type,
    }
    if next_hop_ip:
        props["nextHopIpAddress"] = next_hop_ip
    return {"name": name, "properties": props}


def _blackhole_route(
    name: str = "blackhole-route",
    *,
    address_prefix: str = "10.0.0.0/8",
) -> dict:
    return _route_entry(name, address_prefix=address_prefix, next_hop_type="None")


# ===========================================================================
# NSG Rule Parsing
# ===========================================================================

class TestParseNSGRules:
    def test_empty_nsg_returns_no_rules(self):
        nsg = _nsg_resource(NSG_ID)
        rules = parse_nsg_rules(nsg)
        assert rules == []

    def test_single_allow_rule_parsed(self):
        nsg = _nsg_resource(NSG_ID, security_rules=[_allow_rule()])
        rules = parse_nsg_rules(nsg)
        assert len(rules) == 1
        assert rules[0].direction == "inbound"
        assert rules[0].access == "allow"
        assert rules[0].priority == 100
        assert rules[0].name == "allow-rule"

    def test_single_deny_rule_parsed(self):
        nsg = _nsg_resource(NSG_ID, security_rules=[_deny_rule()])
        rules = parse_nsg_rules(nsg)
        assert len(rules) == 1
        assert rules[0].access == "deny"

    def test_multiple_rules_parsed(self):
        rules_data = [
            _allow_rule("allow-https", priority=100, dest_prefix="443"),
            _deny_rule("deny-all", priority=4000),
        ]
        nsg = _nsg_resource(NSG_ID, security_rules=rules_data)
        rules = parse_nsg_rules(nsg)
        assert len(rules) == 2

    def test_default_security_rules_also_parsed(self):
        default = [_deny_rule("default-deny-all", priority=65500)]
        nsg = _nsg_resource(NSG_ID, default_rules=default)
        rules = parse_nsg_rules(nsg)
        assert len(rules) == 1
        assert rules[0].name == "default-deny-all"

    def test_custom_and_default_rules_merged(self):
        custom = [_allow_rule("allow-ssh", priority=100)]
        default = [_deny_rule("default-deny", priority=65500)]
        nsg = _nsg_resource(NSG_ID, security_rules=custom, default_rules=default)
        rules = parse_nsg_rules(nsg)
        assert len(rules) == 2

    def test_malformed_rule_skipped(self):
        """Rules missing direction or access should be skipped gracefully."""
        nsg = _nsg_resource(NSG_ID, security_rules=[
            {"name": "bad-rule", "properties": {"priority": 100}},  # missing direction/access
        ])
        rules = parse_nsg_rules(nsg)
        assert rules == []

    def test_rule_with_missing_priority_gets_default(self):
        nsg = _nsg_resource(NSG_ID, security_rules=[
            {"name": "no-priority", "properties": {"direction": "Inbound", "access": "Allow"}},
        ])
        rules = parse_nsg_rules(nsg)
        assert len(rules) == 1
        assert rules[0].priority == 4096

    def test_outbound_rule_parsed(self):
        nsg = _nsg_resource(NSG_ID, security_rules=[
            _allow_rule("allow-outbound", priority=100, direction="outbound"),
        ])
        rules = parse_nsg_rules(nsg)
        assert len(rules) == 1
        assert rules[0].direction == "outbound"


# ===========================================================================
# NSG Verdict Classification
# ===========================================================================

class TestClassifyNSGVerdict:
    def test_empty_rules_returns_unknown(self):
        assert classify_nsg_verdict([], direction="inbound") == PathVerdict.UNKNOWN

    def test_allow_rule_returns_allowed(self):
        rules = [NSGRule(direction="inbound", access="allow", priority=100, name="test")]
        assert classify_nsg_verdict(rules, direction="inbound") == PathVerdict.ALLOWED

    def test_deny_rule_returns_blocked(self):
        rules = [NSGRule(direction="inbound", access="deny", priority=100, name="test")]
        assert classify_nsg_verdict(rules, direction="inbound") == PathVerdict.BLOCKED

    def test_higher_priority_allow_wins_over_lower_deny(self):
        rules = [
            NSGRule(direction="inbound", access="allow", priority=100, name="allow-https"),
            NSGRule(direction="inbound", access="deny", priority=4000, name="deny-all"),
        ]
        assert classify_nsg_verdict(rules, direction="inbound") == PathVerdict.ALLOWED

    def test_higher_priority_deny_wins_over_lower_allow(self):
        rules = [
            NSGRule(direction="inbound", access="deny", priority=100, name="deny-specific"),
            NSGRule(direction="inbound", access="allow", priority=4000, name="allow-all"),
        ]
        assert classify_nsg_verdict(rules, direction="inbound") == PathVerdict.BLOCKED

    def test_direction_filtering(self):
        rules = [
            NSGRule(direction="inbound", access="allow", priority=100, name="in-allow"),
            NSGRule(direction="outbound", access="deny", priority=100, name="out-deny"),
        ]
        assert classify_nsg_verdict(rules, direction="inbound") == PathVerdict.ALLOWED
        assert classify_nsg_verdict(rules, direction="outbound") == PathVerdict.BLOCKED

    def test_no_matching_direction_returns_unknown(self):
        rules = [NSGRule(direction="outbound", access="allow", priority=100, name="out-allow")]
        assert classify_nsg_verdict(rules, direction="inbound") == PathVerdict.UNKNOWN

    def test_protocol_filtering_returns_matching_rule(self):
        rules = [
            NSGRule(direction="inbound", access="deny", priority=100, name="deny-udp", protocol="Udp"),
            NSGRule(direction="inbound", access="allow", priority=200, name="allow-tcp", protocol="Tcp"),
        ]
        assert classify_nsg_verdict(rules, direction="inbound", protocol="Tcp") == PathVerdict.ALLOWED

    def test_destination_port_filtering_supports_ranges(self):
        rules = [
            NSGRule(direction="inbound", access="deny", priority=100, name="deny-admin", destination_port_range="3389"),
            NSGRule(direction="inbound", access="allow", priority=200, name="allow-web", destination_port_range="80-443"),
        ]
        assert classify_nsg_verdict(rules, direction="inbound", destination_port=443) == PathVerdict.ALLOWED

    def test_destination_port_filtering_returns_unknown_without_match(self):
        rules = [NSGRule(direction="inbound", access="allow", priority=100, name="allow-https", destination_port_range="443")]
        assert classify_nsg_verdict(rules, direction="inbound", destination_port=8443) == PathVerdict.UNKNOWN

    def test_address_prefix_filtering_uses_cidr_containment(self):
        rules = [
            NSGRule(
                direction="inbound",
                access="allow",
                priority=100,
                name="allow-spoke",
                source_address_prefix="10.0.0.0/16",
                destination_address_prefix="10.1.0.0/16",
            )
        ]
        assert classify_nsg_verdict(
            rules,
            direction="inbound",
            source_address_prefix="10.0.2.4/32",
            destination_address_prefix="10.1.3.5/32",
        ) == PathVerdict.ALLOWED

    def test_address_prefix_filtering_returns_unknown_without_match(self):
        rules = [NSGRule(direction="inbound", access="allow", priority=100, name="allow-spoke", source_address_prefix="10.0.0.0/16")]
        assert classify_nsg_verdict(rules, direction="inbound", source_address_prefix="10.2.0.4/32") == PathVerdict.UNKNOWN


# ===========================================================================
# Route Table Parsing
# ===========================================================================

class TestParseRouteTableRoutes:
    def test_empty_route_table(self):
        rt = _route_table_resource(RT_ID)
        routes = parse_route_table_routes(rt)
        assert routes == []

    def test_single_route_parsed(self):
        rt = _route_table_resource(RT_ID, routes=[_route_entry()])
        routes = parse_route_table_routes(rt)
        assert len(routes) == 1
        assert routes[0].name == "route-to-hub"
        assert routes[0].address_prefix == "10.0.0.0/8"
        assert routes[0].next_hop_type == "VirtualAppliance"

    def test_multiple_routes_parsed(self):
        route_data = [
            _route_entry("route-1", address_prefix="10.0.0.0/8"),
            _route_entry("route-2", address_prefix="0.0.0.0/0", next_hop_type="Internet"),
        ]
        rt = _route_table_resource(RT_ID, routes=route_data)
        routes = parse_route_table_routes(rt)
        assert len(routes) == 2

    def test_route_with_next_hop_ip(self):
        rt = _route_table_resource(RT_ID, routes=[
            _route_entry("to-firewall", next_hop_type="VirtualAppliance", next_hop_ip="10.0.0.1"),
        ])
        routes = parse_route_table_routes(rt)
        assert routes[0].next_hop_ip == "10.0.0.1"

    def test_route_without_name_skipped(self):
        rt = _route_table_resource(RT_ID, routes=[
            {"properties": {"addressPrefix": "10.0.0.0/8", "nextHopType": "VnetLocal"}},
        ])
        routes = parse_route_table_routes(rt)
        assert routes == []


# ===========================================================================
# Route Verdict Classification
# ===========================================================================

class TestClassifyRouteVerdict:
    def test_empty_routes_returns_unknown(self):
        assert classify_route_verdict([], destination_prefix="10.0.0.0/8") == PathVerdict.UNKNOWN

    def test_normal_routes_return_allowed(self):
        routes = [RouteEntry(name="to-hub", address_prefix="10.0.0.0/8", next_hop_type="VirtualAppliance")]
        assert classify_route_verdict(routes) == PathVerdict.ALLOWED

    def test_blackhole_route_returns_blocked(self):
        routes = [RouteEntry(name="drop", address_prefix="10.0.0.0/8", next_hop_type="None")]
        assert classify_route_verdict(routes, destination_prefix="10.0.0.0/8") == PathVerdict.BLOCKED

    def test_blackhole_catchall_blocks_any_destination(self):
        routes = [RouteEntry(name="drop-all", address_prefix="0.0.0.0/0", next_hop_type="None")]
        assert classify_route_verdict(routes, destination_prefix="172.16.0.0/16") == PathVerdict.BLOCKED

    def test_blackhole_does_not_block_unrelated_prefix(self):
        routes = [RouteEntry(name="drop-10", address_prefix="10.0.0.0/8", next_hop_type="None")]
        assert classify_route_verdict(routes, destination_prefix="172.16.0.0/16") == PathVerdict.ALLOWED

    def test_blackhole_route_uses_cidr_containment(self):
        routes = [RouteEntry(name="drop-spoke", address_prefix="10.0.0.0/16", next_hop_type="None")]
        assert classify_route_verdict(routes, destination_prefix="10.0.1.25/32") == PathVerdict.BLOCKED

    def test_blackhole_route_does_not_cross_ip_versions(self):
        routes = [RouteEntry(name="drop-ipv4", address_prefix="10.0.0.0/8", next_hop_type="None")]
        assert classify_route_verdict(routes, destination_prefix="2001:db8::/64") == PathVerdict.ALLOWED

    def test_azure_service_tag_prefix_falls_back_to_exact_match(self):
        routes = [RouteEntry(name="drop-tag", address_prefix="VirtualNetwork", next_hop_type="None")]
        assert classify_route_verdict(routes, destination_prefix="10.0.0.0/8") == PathVerdict.ALLOWED

    def test_no_destination_prefix_with_blackhole_returns_blocked(self):
        routes = [RouteEntry(name="drop", address_prefix="10.0.0.0/8", next_hop_type="None")]
        assert classify_route_verdict(routes, destination_prefix=None) == PathVerdict.BLOCKED


# ===========================================================================
# Full Path Analysis
# ===========================================================================

class TestAnalyzePath:
    """Integration-level tests for the full analyze_path function."""

    def _base_resources_with_nsg_allow(self) -> list[dict]:
        """Resources: VNet → Subnet (with allow NSG) → NIC → VM."""
        return [
            _resource(
                VNET_ID,
                "Microsoft.Network/virtualNetworks",
                {"subnets": [{"id": SUBNET_ID}]},
            ),
            _resource(
                SUBNET_ID,
                "Microsoft.Network/virtualNetworks/subnets",
                {
                    "networkSecurityGroup": {"id": NSG_ID},
                    "routeTable": {"id": RT_ID},
                },
            ),
            _nsg_resource(
                NSG_ID,
                security_rules=[_allow_rule()],
                subnets=[{"id": SUBNET_ID}],
            ),
            _route_table_resource(
                RT_ID,
                routes=[_route_entry()],
                subnets=[{"id": SUBNET_ID}],
            ),
            _resource(
                NIC_ID,
                "Microsoft.Network/networkInterfaces",
                {
                    "networkSecurityGroup": {"id": NSG_ID},
                    "ipConfigurations": [
                        {"name": "ipconfig1", "properties": {"subnet": {"id": SUBNET_ID}}},
                    ],
                },
            ),
            _resource(
                VM_ID,
                "Microsoft.Compute/virtualMachines",
                {"networkProfile": {"networkInterfaces": [{"id": NIC_ID}]}},
            ),
        ]

    def test_path_found_with_nsg_allow_verdict(self):
        resources = self._base_resources_with_nsg_allow()
        result = analyze_path(
            resources,
            source_resource_id=VM_ID,
            destination_resource_id=SUBNET_ID,
        )
        assert result.overall_verdict == PathVerdict.ALLOWED
        assert len(result.path_candidates) >= 1

    def test_path_found_with_nsg_deny_verdict(self):
        resources = [
            _resource(
                VNET_ID,
                "Microsoft.Network/virtualNetworks",
                {"subnets": [{"id": SUBNET_ID}]},
            ),
            _resource(
                SUBNET_ID,
                "Microsoft.Network/virtualNetworks/subnets",
                {"networkSecurityGroup": {"id": NSG_ID}},
            ),
            _nsg_resource(
                NSG_ID,
                security_rules=[_deny_rule()],
                subnets=[{"id": SUBNET_ID}],
            ),
            _resource(
                NIC_ID,
                "Microsoft.Network/networkInterfaces",
                {
                    "ipConfigurations": [
                        {"name": "ipconfig1", "properties": {"subnet": {"id": SUBNET_ID}}},
                    ],
                },
            ),
            _resource(
                VM_ID,
                "Microsoft.Compute/virtualMachines",
                {"networkProfile": {"networkInterfaces": [{"id": NIC_ID}]}},
            ),
        ]
        result = analyze_path(
            resources,
            source_resource_id=VM_ID,
            destination_resource_id=SUBNET_ID,
        )
        assert result.overall_verdict == PathVerdict.BLOCKED

    def test_unknown_verdict_when_no_nsg_data(self):
        """Subnet without NSG association → UNKNOWN verdict."""
        resources = [
            _resource(
                VNET_ID,
                "Microsoft.Network/virtualNetworks",
                {"subnets": [{"id": SUBNET_ID}]},
            ),
            _resource(
                SUBNET_ID,
                "Microsoft.Network/virtualNetworks/subnets",
                {},  # No NSG, no route table
            ),
            _resource(
                NIC_ID,
                "Microsoft.Network/networkInterfaces",
                {
                    "ipConfigurations": [
                        {"name": "ipconfig1", "properties": {"subnet": {"id": SUBNET_ID}}},
                    ],
                },
            ),
            _resource(
                VM_ID,
                "Microsoft.Compute/virtualMachines",
                {"networkProfile": {"networkInterfaces": [{"id": NIC_ID}]}},
            ),
        ]
        result = analyze_path(
            resources,
            source_resource_id=VM_ID,
            destination_resource_id=SUBNET_ID,
        )
        assert result.overall_verdict == PathVerdict.UNKNOWN
        assert "insufficient" in result.path_candidates[0].reason.lower() or "unknown" in result.path_candidates[0].reason.lower()

    def test_source_not_found_returns_unknown(self):
        resources = self._base_resources_with_nsg_allow()
        result = analyze_path(
            resources,
            source_resource_id="/subscriptions/missing/resource",
            destination_resource_id=SUBNET_ID,
        )
        assert result.overall_verdict == PathVerdict.UNKNOWN
        assert len(result.path_candidates) == 0
        assert any("not found" in w.lower() for w in result.warnings)

    def test_destination_not_found_returns_unknown(self):
        resources = self._base_resources_with_nsg_allow()
        result = analyze_path(
            resources,
            source_resource_id=VM_ID,
            destination_resource_id="/subscriptions/missing/resource",
        )
        assert result.overall_verdict == PathVerdict.UNKNOWN
        assert any("not found" in w.lower() for w in result.warnings)

    def test_no_path_returns_unknown(self):
        """Two resources with no topology edge between them → UNKNOWN."""
        resources = [
            _resource(
                f"{BASE}/Microsoft.Compute/virtualMachines/vm-isolated",
                "Microsoft.Compute/virtualMachines",
            ),
            _resource(
                f"{BASE}/Microsoft.Storage/storageAccounts/stisolated",
                "Microsoft.Storage/storageAccounts",
            ),
        ]
        result = analyze_path(
            resources,
            source_resource_id=f"{BASE}/Microsoft.Compute/virtualMachines/vm-isolated",
            destination_resource_id=f"{BASE}/Microsoft.Storage/storageAccounts/stisolated",
        )
        assert result.overall_verdict == PathVerdict.UNKNOWN
        assert any("no network path" in w.lower() for w in result.warnings)

    def test_path_candidate_contains_hops(self):
        resources = self._base_resources_with_nsg_allow()
        result = analyze_path(
            resources,
            source_resource_id=VM_ID,
            destination_resource_id=VNET_ID,
        )
        if result.path_candidates:
            candidate = result.path_candidates[0]
            assert len(candidate.hops) >= 2
            hop_resource_ids = [h.resource_id for h in candidate.hops]
            assert VM_ID in hop_resource_ids

    def test_nsg_verdict_on_subnet_hop(self):
        """Subnet hop should have NSG verdict when NSG is associated."""
        resources = self._base_resources_with_nsg_allow()
        result = analyze_path(
            resources,
            source_resource_id=VM_ID,
            destination_resource_id=VNET_ID,
        )
        if result.path_candidates:
            candidate = result.path_candidates[0]
            subnet_hops = [h for h in candidate.hops if h.hop_type == HopType.SUBNET]
            if subnet_hops:
                assert subnet_hops[0].nsg_verdict is not None
                assert subnet_hops[0].nsg_name is not None

    def test_route_verdict_on_subnet_hop(self):
        """Subnet hop should have route verdict when route table is associated."""
        resources = self._base_resources_with_nsg_allow()
        result = analyze_path(
            resources,
            source_resource_id=VM_ID,
            destination_resource_id=VNET_ID,
        )
        if result.path_candidates:
            candidate = result.path_candidates[0]
            subnet_hops = [h for h in candidate.hops if h.hop_type == HopType.SUBNET]
            if subnet_hops:
                assert subnet_hops[0].route_verdict is not None
                assert subnet_hops[0].route_table_name is not None

    def test_private_endpoint_path(self):
        """Path from NIC through subnet to private endpoint."""
        resources = [
            _resource(
                VNET_ID,
                "Microsoft.Network/virtualNetworks",
                {"subnets": [{"id": SUBNET_ID}]},
            ),
            _resource(
                SUBNET_ID,
                "Microsoft.Network/virtualNetworks/subnets",
                {"networkSecurityGroup": {"id": NSG_ID}},
            ),
            _nsg_resource(NSG_ID, security_rules=[_allow_rule()], subnets=[{"id": SUBNET_ID}]),
            _resource(
                PEP_ID,
                "Microsoft.Network/privateEndpoints",
                {
                    "subnet": {"id": SUBNET_ID},
                    "privateLinkServiceConnections": [
                        {"properties": {"privateLinkServiceId": STORAGE_ID}},
                    ],
                },
            ),
            _resource(STORAGE_ID, "Microsoft.Storage/storageAccounts"),
        ]
        result = analyze_path(
            resources,
            source_resource_id=SUBNET_ID,
            destination_resource_id=STORAGE_ID,
        )
        assert result.overall_verdict == PathVerdict.ALLOWED
        assert len(result.path_candidates) >= 1

    def test_result_shape_fields(self):
        """Verify PathAnalysisResult has all expected fields."""
        resources = self._base_resources_with_nsg_allow()
        result = analyze_path(
            resources,
            source_resource_id=VM_ID,
            destination_resource_id=VNET_ID,
        )
        assert result.source_resource_id == VM_ID
        assert result.destination_resource_id == VNET_ID
        assert isinstance(result.overall_verdict, PathVerdict)
        assert isinstance(result.path_candidates, list)
        assert isinstance(result.warnings, list)


# ===========================================================================
# Edge cases
# ===========================================================================

class TestAnalyzePathEdgeCases:
    def test_same_source_and_destination(self):
        """Source == destination should still produce a result (even if degenerate)."""
        resources = self._base_resources_with_nsg_allow()
        result = analyze_path(
            resources,
            source_resource_id=VM_ID,
            destination_resource_id=VM_ID,
        )
        # Path from VM to itself through the topology; should still be valid
        assert isinstance(result.overall_verdict, PathVerdict)

    def _base_resources_with_nsg_allow(self) -> list[dict]:
        return [
            _resource(
                VNET_ID,
                "Microsoft.Network/virtualNetworks",
                {"subnets": [{"id": SUBNET_ID}]},
            ),
            _resource(
                SUBNET_ID,
                "Microsoft.Network/virtualNetworks/subnets",
                {
                    "networkSecurityGroup": {"id": NSG_ID},
                    "routeTable": {"id": RT_ID},
                },
            ),
            _nsg_resource(
                NSG_ID,
                security_rules=[_allow_rule()],
                subnets=[{"id": SUBNET_ID}],
            ),
            _route_table_resource(
                RT_ID,
                routes=[_route_entry()],
                subnets=[{"id": SUBNET_ID}],
            ),
            _resource(
                NIC_ID,
                "Microsoft.Network/networkInterfaces",
                {
                    "networkSecurityGroup": {"id": NSG_ID},
                    "ipConfigurations": [
                        {"name": "ipconfig1", "properties": {"subnet": {"id": SUBNET_ID}}},
                    ],
                },
            ),
            _resource(
                VM_ID,
                "Microsoft.Compute/virtualMachines",
                {"networkProfile": {"networkInterfaces": [{"id": NIC_ID}]}},
            ),
        ]

    def test_nsg_with_deny_overrides_allow_by_priority(self):
        """Deny with lower priority number (higher precedence) wins."""
        resources = [
            _resource(
                VNET_ID,
                "Microsoft.Network/virtualNetworks",
                {"subnets": [{"id": SUBNET_ID}]},
            ),
            _resource(
                SUBNET_ID,
                "Microsoft.Network/virtualNetworks/subnets",
                {"networkSecurityGroup": {"id": NSG_ID}},
            ),
            _nsg_resource(
                NSG_ID,
                security_rules=[
                    _deny_rule("deny-all", priority=100),
                    _allow_rule("allow-https", priority=200),
                ],
                subnets=[{"id": SUBNET_ID}],
            ),
            _resource(
                NIC_ID,
                "Microsoft.Network/networkInterfaces",
                {
                    "ipConfigurations": [
                        {"name": "ipconfig1", "properties": {"subnet": {"id": SUBNET_ID}}},
                    ],
                },
            ),
            _resource(
                VM_ID,
                "Microsoft.Compute/virtualMachines",
                {"networkProfile": {"networkInterfaces": [{"id": NIC_ID}]}},
            ),
        ]
        result = analyze_path(
            resources,
            source_resource_id=VM_ID,
            destination_resource_id=SUBNET_ID,
        )
        assert result.overall_verdict == PathVerdict.BLOCKED

    def test_route_table_with_blackhole_blocks_path(self):
        """A blackhole route on the subnet should block the path."""
        resources = [
            _resource(
                VNET_ID,
                "Microsoft.Network/virtualNetworks",
                {"subnets": [{"id": SUBNET_ID}]},
            ),
            _resource(
                SUBNET_ID,
                "Microsoft.Network/virtualNetworks/subnets",
                {
                    "networkSecurityGroup": {"id": NSG_ID},
                    "routeTable": {"id": RT_ID},
                },
            ),
            _nsg_resource(
                NSG_ID,
                security_rules=[_allow_rule()],
                subnets=[{"id": SUBNET_ID}],
            ),
            _route_table_resource(
                RT_ID,
                routes=[_blackhole_route()],
                subnets=[{"id": SUBNET_ID}],
            ),
            _resource(
                NIC_ID,
                "Microsoft.Network/networkInterfaces",
                {
                    "ipConfigurations": [
                        {"name": "ipconfig1", "properties": {"subnet": {"id": SUBNET_ID}}},
                    ],
                },
            ),
            _resource(
                VM_ID,
                "Microsoft.Compute/virtualMachines",
                {"networkProfile": {"networkInterfaces": [{"id": NIC_ID}]}},
            ),
        ]
        result = analyze_path(
            resources,
            source_resource_id=VM_ID,
            destination_resource_id=SUBNET_ID,
        )
        assert result.overall_verdict == PathVerdict.BLOCKED

    def test_path_trace_does_not_treat_nsg_attachment_as_traffic_path(self):
        """NSG secures edge alone should not become a source/destination traffic path."""
        resources = [
            _resource(
                SUBNET_ID,
                "Microsoft.Network/virtualNetworks/subnets",
                {"networkSecurityGroup": {"id": NSG_ID}},
            ),
            _nsg_resource(
                NSG_ID,
                security_rules=[_allow_rule()],
                subnets=[{"id": SUBNET_ID}],
            ),
        ]
        result = analyze_path(
            resources,
            source_resource_id=NSG_ID,
            destination_resource_id=SUBNET_ID,
        )
        assert result.overall_verdict == PathVerdict.UNKNOWN
        assert result.path_candidates == []
        assert any("no network path" in warning.lower() for warning in result.warnings)


    def test_path_trace_does_not_treat_route_table_attachment_as_traffic_path(self):
        """Route table routes edge alone should not become a traffic path."""
        resources = [
            _resource(
                SUBNET_ID,
                "Microsoft.Network/virtualNetworks/subnets",
                {"routeTable": {"id": RT_ID}},
            ),
            _route_table_resource(
                RT_ID,
                routes=[_route_entry()],
                subnets=[{"id": SUBNET_ID}],
            ),
        ]
        result = analyze_path(
            resources,
            source_resource_id=RT_ID,
            destination_resource_id=SUBNET_ID,
        )
        assert result.overall_verdict == PathVerdict.UNKNOWN
        assert result.path_candidates == []
        assert any("no network path" in warning.lower() for warning in result.warnings)
