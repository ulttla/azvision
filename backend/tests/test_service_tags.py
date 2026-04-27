"""Tests for the Azure service tag expansion module.

Covers:
- Static tag resolution (known tags → CIDR ranges)
- Unknown tag handling (conservative: returns None)
- ``is_service_tag`` classification
- ``address_prefix_matches_tag`` matching logic
- Integration with NSG address prefix matching in path_analysis
"""
from __future__ import annotations

import ipaddress

import pytest

from app.services.service_tags import (
    address_prefix_matches_tag,
    is_service_tag,
    resolve_service_tag,
)


# ===========================================================================
# resolve_service_tag
# ===========================================================================

class TestResolveServiceTag:
    def test_known_tag_returns_networks(self):
        result = resolve_service_tag("VirtualNetwork")
        assert result is not None
        assert len(result) > 0
        for net in result:
            assert isinstance(net, (ipaddress.IPv4Network, ipaddress.IPv6Network))

    def test_known_tag_case_insensitive(self):
        assert resolve_service_tag("virtualnetwork") is not None
        assert resolve_service_tag("VIRTUALNETWORK") is not None
        assert resolve_service_tag("VirtualNetwork") is not None

    def test_internet_tag_resolves_to_catchall(self):
        result = resolve_service_tag("Internet")
        assert result is not None
        # Internet tag should include 0.0.0.0/0 (IPv4 catch-all)
        cidrs = [str(n) for n in result]
        assert "0.0.0.0/0" in cidrs

    def test_azureloadbalancer_tag_resolves(self):
        result = resolve_service_tag("AzureLoadBalancer")
        assert result is not None
        # Should include the well-known Azure infrastructure IP
        cidrs = [str(n) for n in result]
        assert "168.63.129.16/32" in cidrs

    def test_storage_tag_resolves(self):
        result = resolve_service_tag("Storage")
        assert result is not None
        assert len(result) > 0

    def test_unknown_tag_returns_none(self):
        assert resolve_service_tag("FakeUnknownTag") is None

    def test_empty_string_returns_none(self):
        assert resolve_service_tag("") is None

    def test_whitespace_stripped(self):
        assert resolve_service_tag("  VirtualNetwork  ") is not None

    def test_sql_tag_resolves(self):
        assert resolve_service_tag("Sql") is not None

    def test_azurecloud_tag_resolves(self):
        assert resolve_service_tag("AzureCloud") is not None


# ===========================================================================
# is_service_tag
# ===========================================================================

class TestIsServiceTag:
    def test_virtualnetwork_is_tag(self):
        assert is_service_tag("VirtualNetwork") is True

    def test_internet_is_tag(self):
        assert is_service_tag("Internet") is True

    def test_storage_is_tag(self):
        assert is_service_tag("Storage") is True

    def test_ip_address_is_not_tag(self):
        assert is_service_tag("10.0.0.4") is False

    def test_cidr_is_not_tag(self):
        assert is_service_tag("10.0.0.0/16") is False

    def test_wildcard_is_not_tag(self):
        assert is_service_tag("*") is False

    def test_unknown_string_is_not_tag(self):
        assert is_service_tag("MyCustomPrefix") is False

    def test_empty_is_not_tag(self):
        assert is_service_tag("") is False

    def test_case_insensitive(self):
        assert is_service_tag("virtualnetwork") is True
        assert is_service_tag("STORAGE") is True


# ===========================================================================
# address_prefix_matches_tag
# ===========================================================================

class TestAddressPrefixMatchesTag:
    def test_rfc1918_in_virtualnetwork(self):
        result = address_prefix_matches_tag("VirtualNetwork", "10.0.0.4/32")
        assert result is True

    def test_rfc1918_172_in_virtualnetwork(self):
        result = address_prefix_matches_tag("VirtualNetwork", "172.16.5.0/24")
        assert result is True

    def test_rfc1918_192_in_virtualnetwork(self):
        result = address_prefix_matches_tag("VirtualNetwork", "192.168.1.0/24")
        assert result is True

    def test_public_ip_not_in_virtualnetwork(self):
        result = address_prefix_matches_tag("VirtualNetwork", "4.2.0.0/16")
        assert result is False

    def test_public_ip_in_internet(self):
        result = address_prefix_matches_tag("Internet", "8.8.8.8/32")
        assert result is True

    def test_private_ip_not_in_internet(self):
        result = address_prefix_matches_tag("Internet", "10.0.0.4/32")
        assert result is False

    def test_cgnat_shared_space_not_in_internet(self):
        result = address_prefix_matches_tag("Internet", "100.64.1.1/32")
        assert result is False

    def test_public_ipv6_in_internet(self):
        result = address_prefix_matches_tag("Internet", "2606:4700:4700::1111/128")
        assert result is True

    def test_ula_ipv6_not_in_internet(self):
        result = address_prefix_matches_tag("Internet", "fd00::/48")
        assert result is False

    def test_rfc1918_not_in_storage(self):
        # Storage tag covers Azure public ranges, not RFC1918
        result = address_prefix_matches_tag("Storage", "10.0.0.0/16")
        assert result is False

    def test_unknown_tag_returns_none(self):
        result = address_prefix_matches_tag("FakeTag", "10.0.0.0/16")
        assert result is None

    def test_unparseable_prefix_returns_none(self):
        result = address_prefix_matches_tag("VirtualNetwork", "not-a-prefix")
        assert result is None

    def test_ipv6_fd_in_virtualnetwork(self):
        result = address_prefix_matches_tag("VirtualNetwork", "fd00::/48")
        assert result is True

    def test_azurelb_ip_in_tag(self):
        result = address_prefix_matches_tag("AzureLoadBalancer", "168.63.129.16/32")
        assert result is True

    def test_non_azurelb_ip_not_in_tag(self):
        result = address_prefix_matches_tag("AzureLoadBalancer", "10.0.0.1/32")
        assert result is False


# ===========================================================================
# Integration: service tags in NSG verdict classification
# ===========================================================================

class TestServiceTagIntegration:
    """Verify that NSG rules with service tag prefixes are properly resolved
    through the path analysis classify_nsg_verdict function."""

    def test_nsg_rule_with_virtualnetwork_source_allows_rfc1918(self):
        from app.services.path_analysis import NSGRule, PathVerdict, classify_nsg_verdict

        rules = [
            NSGRule(
                direction="inbound",
                access="allow",
                priority=100,
                name="allow-vnet",
                source_address_prefix="VirtualNetwork",
            )
        ]
        # 10.0.2.4 is within VirtualNetwork's superset (10.0.0.0/8)
        verdict = classify_nsg_verdict(
            rules,
            direction="inbound",
            source_address_prefix="10.0.2.4/32",
        )
        assert verdict == PathVerdict.ALLOWED

    def test_nsg_rule_with_virtualnetwork_source_blocks_public_ip(self):
        from app.services.path_analysis import NSGRule, PathVerdict, classify_nsg_verdict

        rules = [
            NSGRule(
                direction="inbound",
                access="allow",
                priority=100,
                name="allow-vnet",
                source_address_prefix="VirtualNetwork",
            )
        ]
        # 4.2.0.0 is a public IP, NOT within VirtualNetwork's superset
        verdict = classify_nsg_verdict(
            rules,
            direction="inbound",
            source_address_prefix="4.2.0.0/32",
        )
        assert verdict == PathVerdict.UNKNOWN  # no matching rule → UNKNOWN

    def test_nsg_rule_with_internet_prefix_matches_any_ip(self):
        from app.services.path_analysis import NSGRule, PathVerdict, classify_nsg_verdict

        rules = [
            NSGRule(
                direction="outbound",
                access="allow",
                priority=100,
                name="allow-internet",
                destination_address_prefix="Internet",
            )
        ]
        verdict = classify_nsg_verdict(
            rules,
            direction="outbound",
            destination_address_prefix="1.2.3.4/32",
        )
        assert verdict == PathVerdict.ALLOWED

    def test_nsg_rule_with_unknown_tag_stays_unknown(self):
        from app.services.path_analysis import NSGRule, PathVerdict, classify_nsg_verdict

        rules = [
            NSGRule(
                direction="inbound",
                access="allow",
                priority=100,
                name="allow-unknowntag",
                source_address_prefix="SomeMadeUpTag",
            )
        ]
        # Unknown tag cannot be resolved → conservative UNKNOWN
        verdict = classify_nsg_verdict(
            rules,
            direction="inbound",
            source_address_prefix="10.0.0.4/32",
        )
        assert verdict == PathVerdict.UNKNOWN

    def test_route_blackhole_with_service_tag_virtualnetwork(self):
        from app.services.path_analysis import PathVerdict, RouteEntry, classify_route_verdict

        routes = [
            RouteEntry(name="drop-vnet", address_prefix="VirtualNetwork", next_hop_type="None")
        ]
        # VirtualNetwork tag now resolves to 10.0.0.0/8 superset
        # 10.0.1.5/32 falls within VirtualNetwork → BLOCKED
        verdict = classify_route_verdict(routes, destination_prefix="10.0.1.5/32")
        assert verdict == PathVerdict.BLOCKED

    def test_route_blackhole_with_service_tag_not_matching(self):
        from app.services.path_analysis import PathVerdict, RouteEntry, classify_route_verdict

        routes = [
            RouteEntry(name="drop-vnet", address_prefix="VirtualNetwork", next_hop_type="None")
        ]
        # 172.16.0.0 falls within VirtualNetwork (172.16.0.0/12)
        verdict = classify_route_verdict(routes, destination_prefix="172.16.0.5/32")
        assert verdict == PathVerdict.BLOCKED

    def test_route_blackhole_with_service_tag_different_range(self):
        from app.services.path_analysis import PathVerdict, RouteEntry, classify_route_verdict

        routes = [
            RouteEntry(name="drop-vnet", address_prefix="VirtualNetwork", next_hop_type="None")
        ]
        # 4.2.0.0 is NOT within VirtualNetwork → ALLOWED (no blackhole match)
        verdict = classify_route_verdict(routes, destination_prefix="4.2.0.0/32")
        assert verdict == PathVerdict.ALLOWED