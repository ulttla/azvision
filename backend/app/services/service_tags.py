"""Azure service tag CIDR expansion for NSG and route evaluation.

Azure NSG rules and route table entries can use *service tags* as address
prefixes (e.g., ``VirtualNetwork``, ``Storage``, ``Internet``).  Unlike CIDR
prefixes, service tags represent dynamic IP ranges managed by Azure that
change over time and vary by region.

This module provides a conservative, static approximation of the most common
service tags for use in path analysis.  The approximation is intentionally
**wide** (covers more IPs than Azure actually uses for a given tag) so that
we never incorrectly *block* traffic that would be allowed in reality.  When a
service tag cannot be resolved, callers should treat it as **unknown** rather
than guessing.

Design goals
------------
- Pure-Python, zero network calls.
- Deterministic and fast (lookup-table only).
- Conservative: a resolved tag is a **superset** of Azure's actual ranges.
- Extensible: adding new tags only requires updating ``_STATIC_TAG_RANGES``.
"""

from __future__ import annotations

import ipaddress
from typing import Sequence

# ---------------------------------------------------------------------------
# Static tag range approximation
# ---------------------------------------------------------------------------

# Each entry maps a canonical service tag name to one or more CIDR ranges
# that *superset* the actual Azure ranges for that tag in any region.
#
# Sources of truth (for future updates):
#   https://www.microsoft.com/en-us/download/details.aspx?id=56519
#   Azure Network > Service Tags documentation
#
# These are intentionally coarse /18-/8 nets so we never say "not in range"
# when Azure would say "in range".  The trade-off is that we may report
# *allow* for an address that Azure's actual tag would not cover, which is
# the conservative (safe) direction for reachability analysis: we prefer
# UNKNOWN or ALLOWED over a false BLOCKED.
_STATIC_TAG_RANGES: dict[str, tuple[str, ...]] = {
    # --- VNet / on-premises ---
    "virtualnetwork": ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "fd00::/8"),
    "virtualnetworkgateway": ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "fd00::/8"),
    "gatewaymanager": ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"),

    # --- Azure platform ---
    "azureloadbalancer": ("168.63.129.16/32", "fd00::/8"),
    "azurecloud": ("4.0.0.0/8", "13.0.0.0/8", "20.0.0.0/8", "40.0.0.0/8", "52.0.0.0/8", "104.0.0.0/8", "131.253.0.0/16", "fd00::/8"),
    "azureactivedirectory": ("4.0.0.0/8", "13.0.0.0/8", "52.0.0.0/8"),

    # --- PaaS services ---
    "storage": ("4.0.0.0/8", "13.0.0.0/8", "20.0.0.0/8", "40.0.0.0/8", "52.0.0.0/8", "104.0.0.0/8"),
    "sql": ("4.0.0.0/8", "13.0.0.0/8", "20.0.0.0/8", "40.0.0.0/8", "52.0.0.0/8", "104.0.0.0/8"),
    "sqlmanagement": ("4.0.0.0/8", "13.0.0.0/8", "20.0.0.0/8", "40.0.0.0/8", "52.0.0.0/8", "104.0.0.0/8"),
    "apimanagement": ("4.0.0.0/8", "13.0.0.0/8", "20.0.0.0/8", "40.0.0.0/8", "52.0.0.0/8", "104.0.0.0/8"),
    "azurekeyvault": ("4.0.0.0/8", "13.0.0.0/8", "20.0.0.0/8", "40.0.0.0/8", "52.0.0.0/8", "104.0.0.0/8"),
    "azurecontainerregistry": ("4.0.0.0/8", "13.0.0.0/8", "20.0.0.0/8", "40.0.0.0/8", "52.0.0.0/8", "104.0.0.0/8"),
    "azureweb": ("4.0.0.0/8", "13.0.0.0/8", "20.0.0.0/8", "40.0.0.0/8", "52.0.0.0/8", "104.0.0.0/8"),

    # --- Internet ---
    "internet": ("0.0.0.0/0", "::/0"),

    # --- Special ---
    "anysastaff": ("4.0.0.0/8", "13.0.0.0/8"),
}

# Pre-parsed ipaddress network objects for fast lookup
_PARSED_TAG_NETWORKS: dict[str, tuple[ipaddress.IPv4Network | ipaddress.IPv6Network, ...]] = {}


def _ensure_parsed() -> None:
    """Lazily parse the static tag ranges into ipaddress network objects."""
    if _PARSED_TAG_NETWORKS:
        return
    for tag, cidrs in _STATIC_TAG_RANGES.items():
        nets: list[ipaddress.IPv4Network | ipaddress.IPv6Network] = []
        for cidr in cidrs:
            try:
                nets.append(ipaddress.ip_network(cidr, strict=False))
            except ValueError:
                continue
        _PARSED_TAG_NETWORKS[tag] = tuple(nets)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def resolve_service_tag(tag: str) -> Sequence[ipaddress.IPv4Network | ipaddress.IPv6Network] | None:
    """Resolve an Azure service tag to a sequence of superset CIDR networks.

    Returns ``None`` if the tag is not recognized, signalling that the caller
    should treat the match as ambiguous / unknown rather than granted.
    """
    canonical = tag.strip().lower()
    if not canonical:
        return None

    _ensure_parsed()
    return _PARSED_TAG_NETWORKS.get(canonical)


def is_service_tag(value: str) -> bool:
    """Check whether a string looks like an Azure service tag.

    Service tags are alphanumeric identifiers (no ``/``) that are not
    parseable as IP addresses or CIDR networks.
    """
    text = value.strip()
    if not text or text in {"*", ""}:
        return False
    # CIDR prefixes or IP addresses are not service tags
    if "/" in text:
        return False
    # Try to parse as IP address – if it succeeds, it's not a service tag
    try:
        ipaddress.ip_address(text)
        return False
    except ValueError:
        pass
    # Must be a known tag name
    canonical = text.lower()
    _ensure_parsed()
    return canonical in _PARSED_TAG_NETWORKS


def address_prefix_matches_tag(
    tag: str,
    requested_prefix: str,
) -> bool | None:
    """Check whether an address prefix falls within a service tag's ranges.

    Returns:
        True  – the requested_prefix is covered by the tag's ranges
        False – the requested_prefix is definitely *not* covered
        None  – the tag is unknown, so the match is ambiguous
    """
    canonical = tag.strip().lower()
    networks = resolve_service_tag(canonical)
    if networks is None:
        return None  # unknown tag → ambiguous

    try:
        requested = ipaddress.ip_network(requested_prefix.strip(), strict=False)
    except ValueError:
        return None  # unparseable prefix → ambiguous

    if canonical == "internet":
        # Azure's Internet tag represents public internet address space, not
        # private/RFC1918 or other non-global ranges. A catch-all 0.0.0.0/0 is
        # kept in the static table for route-prefix containment, but NSG rule
        # matching should not let Internet match private traffic.
        return requested.is_global

    for net in networks:
        if net.version == requested.version and requested.subnet_of(net):
            return True

    return False  # definitively not in any tag range
