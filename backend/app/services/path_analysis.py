"""Network path analysis service for AzVision.

Analyzes reachability between Azure resources using NSG rules, route tables,
and topology edges.  Produces source→destination path candidates with an
allowed/blocked/unknown verdict per hop.

Design goals:
- Pure-Python, testable without Azure credentials or live inventory.
- Operates on the same resource dict shape used by topology inference.
- Conservative: defaults to "unknown" when data is missing or ambiguous.
- Intra-VNet (L3) reachability at MVP scope.

Evaluation directions
---------------------
For traffic from source → destination, Azure evaluates **two** NSG
checkpoints:

1. **Outbound NSG** on the source's subnet/NIC – does the source *allow*
   traffic *out* to the destination?
2. **Inbound NSG** on the destination's subnet/NIC – does the destination
   *allow* traffic *in* from the source?

Both must allow for traffic to flow.  Earlier releases only evaluated
inbound; this version evaluates both directions and records the verdict
for each on the hop where the NSG is attached.

Service tags
------------
Azure NSG rules can use *service tags* (e.g. ``VirtualNetwork``, ``Storage``,
``Internet``) as address prefixes.  These are resolved via the
``service_tags`` module using a conservative static superset of CIDR ranges.
Unknown service tags fall back to UNKNOWN (safe) semantics.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
import ipaddress
from typing import Any, Sequence

from app.services.service_tags import address_prefix_matches_tag, is_service_tag, resolve_service_tag


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

class PathVerdict(str, Enum):
    ALLOWED = "allowed"
    BLOCKED = "blocked"
    UNKNOWN = "unknown"


class HopType(str, Enum):
    VNET = "vnet"
    SUBNET = "subnet"
    NIC = "nic"
    NSG = "nsg"
    ROUTE_TABLE = "route_table"
    PRIVATE_ENDPOINT = "private_endpoint"
    LOAD_BALANCER = "load_balancer"
    APPLICATION_GATEWAY = "application_gateway"
    PUBLIC_IP = "public_ip"
    VM = "vm"
    STORAGE_ACCOUNT = "storage_account"
    SQL_MI = "sql_managed_instance"
    WEB_APP = "web_app"
    OTHER = "other"


@dataclass(frozen=True)
class NSGRule:
    """Simplified representation of an NSG rule (default or custom)."""
    direction: str          # "inbound" | "outbound"
    access: str             # "allow" | "deny"
    priority: int
    name: str
    source_address_prefix: str | None = None
    source_port_range: str | None = None
    destination_address_prefix: str | None = None
    destination_port_range: str | None = None
    protocol: str | None = None


@dataclass(frozen=True)
class RouteEntry:
    """Simplified representation of a route table entry."""
    name: str
    address_prefix: str | None = None
    next_hop_type: str | None = None
    next_hop_ip: str | None = None


@dataclass(frozen=True)
class PathHop:
    """A single hop in a path candidate."""
    resource_id: str
    resource_type: str
    hop_type: HopType
    display_name: str

    # Inbound NSG verdict at this hop (None if no NSG applies)
    nsg_verdict: PathVerdict | None = None
    nsg_name: str | None = None
    nsg_rule_name: str | None = None
    # Which NSG direction was evaluated for the primary verdict
    nsg_direction: str | None = None   # "inbound" | "outbound" | None

    # Outbound NSG verdict (evaluated on each NSG-bearing hop)
    nsg_outbound_verdict: PathVerdict | None = None
    nsg_outbound_name: str | None = None
    nsg_outbound_rule_name: str | None = None

    # Route verdict at this hop (None if no route table applies)
    route_verdict: PathVerdict | None = None
    route_table_name: str | None = None
    route_name: str | None = None
    route_next_hop_type: str | None = None
    route_next_hop_ip: str | None = None

    # Peering boundary marker: True when this VNet hop is reached via a
    # VNet peering edge (the path crosses from one VNet to another).
    is_peering_boundary: bool = False


@dataclass(frozen=True)
class PathCandidate:
    """A single source→destination path candidate with verdict."""
    source_resource_id: str
    destination_resource_id: str
    verdict: PathVerdict
    hops: tuple[PathHop, ...]
    reason: str
    # Number of VNet peering edges traversed in this path.
    # 0 = intra-VNet, 1 = direct peering, 2+ = transitive peering.
    peering_hop_count: int = 0
    # Whether traffic is forwarded through peering.
    # None = intra-VNet (no peering), False = direct peering,
    # True = transitive peering (forwarded through ≥2 peering edges).
    is_forwarded_traffic: bool | None = None


@dataclass
class PathAnalysisResult:
    """Complete analysis result for a source→destination query."""
    source_resource_id: str
    destination_resource_id: str
    overall_verdict: PathVerdict
    path_candidates: list[PathCandidate] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# NSG rule parsing
# ---------------------------------------------------------------------------

def _properties(item: dict[str, Any]) -> dict[str, Any]:
    properties = item.get("properties")
    return properties if isinstance(properties, dict) else {}


def parse_nsg_rules(resource: dict[str, Any]) -> list[NSGRule]:
    """Parse NSG security rules from an NSG resource dict.

    Extracts both custom security rules and default rules from the
    ``properties.securityRules`` and ``properties.defaultSecurityRules`` lists.
    """
    properties = _properties(resource)
    rules: list[NSGRule] = []

    for key in ("securityRules", "defaultSecurityRules"):
        for raw in _iter_dicts(properties.get(key)):
            rule = _parse_single_nsg_rule(raw)
            if rule is not None:
                rules.append(rule)

    return rules


def _azure_default_nsg_rules() -> list[NSGRule]:
    """Return Azure's built-in NSG default rules.

    Azure applies these rules even when the resource payload does not include
    ``defaultSecurityRules``. Injecting them avoids treating an NSG with only
    custom inbound rules as if it had no outbound policy at all.
    """
    return [
        NSGRule(
            direction="inbound",
            access="allow",
            priority=65000,
            name="AllowVnetInBound",
            source_address_prefix="VirtualNetwork",
            destination_address_prefix="VirtualNetwork",
            source_port_range="*",
            destination_port_range="*",
            protocol="*",
        ),
        NSGRule(
            direction="inbound",
            access="allow",
            priority=65001,
            name="AllowAzureLoadBalancerInBound",
            source_address_prefix="AzureLoadBalancer",
            destination_address_prefix="*",
            source_port_range="*",
            destination_port_range="*",
            protocol="*",
        ),
        NSGRule(
            direction="inbound",
            access="deny",
            priority=65500,
            name="DenyAllInBound",
            source_address_prefix="*",
            destination_address_prefix="*",
            source_port_range="*",
            destination_port_range="*",
            protocol="*",
        ),
        NSGRule(
            direction="outbound",
            access="allow",
            priority=65000,
            name="AllowVnetOutBound",
            source_address_prefix="VirtualNetwork",
            destination_address_prefix="VirtualNetwork",
            source_port_range="*",
            destination_port_range="*",
            protocol="*",
        ),
        NSGRule(
            direction="outbound",
            access="allow",
            priority=65001,
            name="AllowInternetOutBound",
            source_address_prefix="*",
            destination_address_prefix="Internet",
            source_port_range="*",
            destination_port_range="*",
            protocol="*",
        ),
        NSGRule(
            direction="outbound",
            access="deny",
            priority=65500,
            name="DenyAllOutBound",
            source_address_prefix="*",
            destination_address_prefix="*",
            source_port_range="*",
            destination_port_range="*",
            protocol="*",
        ),
    ]


def _rules_with_azure_defaults(resource: dict[str, Any]) -> list[NSGRule]:
    """Parse an NSG and add any Azure default rules missing from the payload.

    Some export/API shapes include only a partial ``defaultSecurityRules`` list.
    Azure still applies the full default set, so missing defaults must be
    backfilled instead of treating the partial payload as authoritative.
    """
    rules = parse_nsg_rules(resource)
    default_items = _iter_dicts(_properties(resource).get("defaultSecurityRules"))
    existing_default_names: set[str] = set()
    for item in default_items:
        props = item.get("properties")
        if not isinstance(props, dict):
            props = {}
        name = str(item.get("name") or props.get("name") or "").strip().lower()
        if name:
            existing_default_names.add(name)
    for default_rule in _azure_default_nsg_rules():
        if not default_items or default_rule.name.lower() not in existing_default_names:
            rules.append(default_rule)
    return rules


def _parse_single_nsg_rule(raw: dict[str, Any]) -> NSGRule | None:
    props = raw.get("properties")
    if not isinstance(props, dict):
        # Some rule shapes put direction/access directly on the object
        props = raw

    direction = str(props.get("direction", "")).lower()
    access = str(props.get("access", "")).lower()
    priority = props.get("priority")

    if direction not in ("inbound", "outbound") or access not in ("allow", "deny"):
        return None

    name = str(raw.get("name", props.get("name", "")))
    try:
        priority_int = int(priority)
    except (TypeError, ValueError):
        priority_int = 4096  # lowest priority

    return NSGRule(
        direction=direction,
        access=access,
        priority=priority_int,
        name=name,
        source_address_prefix=props.get("sourceAddressPrefix") or props.get("sourceAddressPrefixes"),
        source_port_range=props.get("sourcePortRange") or props.get("sourcePortRanges"),
        destination_address_prefix=props.get("destinationAddressPrefix") or props.get("destinationAddressPrefixes"),
        destination_port_range=props.get("destinationPortRange") or props.get("destinationPortRanges"),
        protocol=props.get("protocol"),
    )


def classify_nsg_verdict(
    rules: list[NSGRule],
    *,
    direction: str,
    protocol: str | None = None,
    source_address_prefix: str | None = None,
    destination_address_prefix: str | None = None,
    source_port: int | None = None,
    destination_port: int | None = None,
    virtual_network_prefixes: Sequence[str] | None = None,
) -> PathVerdict:
    """Classify the effective NSG verdict for a given direction.

    Azure NSG evaluation: rules are processed by priority (lowest number wins).
    If no rule matches, the default action depends on whether default rules
    are present. At MVP scope we treat:
    - An explicit "allow" rule → ALLOWED
    - An explicit "deny" rule (with lower priority than any allow) → BLOCKED
    - No rules or ambiguous → UNKNOWN
    """
    if not rules:
        return PathVerdict.UNKNOWN

    top_rule = _first_effective_nsg_rule(
        rules,
        direction=direction,
        protocol=protocol,
        source_address_prefix=source_address_prefix,
        destination_address_prefix=destination_address_prefix,
        source_port=source_port,
        destination_port=destination_port,
        virtual_network_prefixes=virtual_network_prefixes,
    )
    if top_rule is None:
        return PathVerdict.UNKNOWN
    if top_rule.access == "allow":
        return PathVerdict.ALLOWED
    if top_rule.access == "deny":
        return PathVerdict.BLOCKED
    return PathVerdict.UNKNOWN


def _matching_nsg_rules(
    rules: list[NSGRule],
    *,
    direction: str,
    protocol: str | None = None,
    source_address_prefix: str | None = None,
    destination_address_prefix: str | None = None,
    source_port: int | None = None,
    destination_port: int | None = None,
    virtual_network_prefixes: Sequence[str] | None = None,
) -> list[NSGRule]:
    matching = [
        r for r in rules
        if _nsg_rule_match_state(
            r,
            direction=direction,
            protocol=protocol,
            source_address_prefix=source_address_prefix,
            destination_address_prefix=destination_address_prefix,
            source_port=source_port,
            destination_port=destination_port,
            virtual_network_prefixes=virtual_network_prefixes,
        ) is True
    ]
    return sorted(matching, key=lambda r: r.priority)


def _first_effective_nsg_rule(
    rules: list[NSGRule],
    *,
    direction: str,
    protocol: str | None = None,
    source_address_prefix: str | None = None,
    destination_address_prefix: str | None = None,
    source_port: int | None = None,
    destination_port: int | None = None,
    virtual_network_prefixes: Sequence[str] | None = None,
) -> NSGRule | None:
    uncertain_rules: list[NSGRule] = []
    for rule in sorted(rules, key=lambda r: r.priority):
        state = _nsg_rule_match_state(
            rule,
            direction=direction,
            protocol=protocol,
            source_address_prefix=source_address_prefix,
            destination_address_prefix=destination_address_prefix,
            source_port=source_port,
            destination_port=destination_port,
            virtual_network_prefixes=virtual_network_prefixes,
        )
        if state is True:
            if rule.access == "allow" and any(item.access == "deny" for item in uncertain_rules):
                return None
            if rule.access == "deny" and any(item.access == "allow" for item in uncertain_rules):
                return None
            return rule
        if state is None:
            uncertain_rules.append(rule)
    return None


def _nsg_rule_match_state(
    rule: NSGRule,
    *,
    direction: str,
    protocol: str | None = None,
    source_address_prefix: str | None = None,
    destination_address_prefix: str | None = None,
    source_port: int | None = None,
    destination_port: int | None = None,
    virtual_network_prefixes: Sequence[str] | None = None,
) -> bool | None:
    if rule.direction != direction:
        return False
    if not _protocol_matches(rule.protocol, protocol):
        return False
    if not _port_matches(rule.source_port_range, source_port):
        return False
    if not _port_matches(rule.destination_port_range, destination_port):
        return False

    source_match = _address_prefix_match_state(rule.source_address_prefix, source_address_prefix, virtual_network_prefixes=virtual_network_prefixes)
    if source_match is False:
        return False
    dest_match = _address_prefix_match_state(rule.destination_address_prefix, destination_address_prefix, virtual_network_prefixes=virtual_network_prefixes)
    if dest_match is False:
        return False
    if source_match is None or dest_match is None:
        return None
    return True


def _protocol_matches(rule_protocol: str | None, requested_protocol: str | None) -> bool:
    if not requested_protocol:
        return True
    if not rule_protocol or str(rule_protocol).strip() in {"", "*"}:
        return True
    return str(rule_protocol).strip().lower() == requested_protocol.strip().lower()


def _address_prefix_matches(rule_value: Any, requested_prefix: str | None, *, virtual_network_prefixes: Sequence[str] | None = None) -> bool:
    """Check whether a rule's address prefix matches the requested prefix.

    Supports:
    - Wildcards (``*``, empty string)
    - Exact string match
    - CIDR containment (requested is a subnet of rule)
    - Azure service tags (e.g. ``VirtualNetwork``, ``Storage``, ``Internet``)
      resolved via the ``service_tags`` module using a conservative superset
    - Lists of prefixes (``sourceAddressPrefixes`` / ``destinationAddressPrefixes``)

    Returns True when the rule *covers* the requested prefix, or when no
    specific prefix was requested (caller is checking direction/protocol only).
    """
    return _address_prefix_match_state(
        rule_value,
        requested_prefix,
        virtual_network_prefixes=virtual_network_prefixes,
    ) is True


def _address_prefix_match_state(
    rule_value: Any,
    requested_prefix: str | None,
    *,
    virtual_network_prefixes: Sequence[str] | None = None,
) -> bool | None:
    if not requested_prefix:
        return True
    if rule_value is None:
        return True

    values = rule_value if isinstance(rule_value, list) else [rule_value]
    if isinstance(rule_value, list) and not values:
        return True
    requested = requested_prefix.strip().lower()
    for value in values:
        text = str(value).strip().lower()
        if text in {"", "*"} or text == requested:
            return True

        if is_service_tag(text):
            if text == "virtualnetwork" and virtual_network_prefixes is not None:
                tag_match = _prefix_is_covered_by_any(virtual_network_prefixes, requested)
            else:
                tag_match = address_prefix_matches_tag(text, requested)
            if tag_match is True:
                return True
            if tag_match is None:
                return None
            continue

        try:
            rule_network = ipaddress.ip_network(text, strict=False)
            requested_network = ipaddress.ip_network(requested, strict=False)
        except ValueError:
            continue
        if rule_network.version == requested_network.version and requested_network.subnet_of(rule_network):
            return True
    return False


def _prefix_is_covered_by_any(prefixes: Sequence[str], requested_prefix: str) -> bool | None:
    try:
        requested_network = ipaddress.ip_network(requested_prefix.strip(), strict=False)
    except ValueError:
        return None
    saw_parseable = False
    for prefix in prefixes:
        try:
            network = ipaddress.ip_network(str(prefix).strip(), strict=False)
        except ValueError:
            continue
        saw_parseable = True
        if network.version == requested_network.version and requested_network.subnet_of(network):
            return True
    if not saw_parseable:
        return None
    return False


def _port_matches(rule_value: Any, requested_port: int | None) -> bool:
    if requested_port is None:
        return True
    if rule_value is None:
        return True

    raw_values = rule_value if isinstance(rule_value, list) else [rule_value]
    if isinstance(rule_value, list) and not raw_values:
        return True
    values: list[str] = []
    for value in raw_values:
        values.extend(part.strip() for part in str(value).split(","))

    for text in values:
        if text in {"", "*"}:
            return True
        if "-" in text:
            start_text, end_text = text.split("-", 1)
            try:
                if int(start_text) <= requested_port <= int(end_text):
                    return True
            except ValueError:
                continue
            continue
        try:
            if int(text) == requested_port:
                return True
        except ValueError:
            continue
    return False


# ---------------------------------------------------------------------------
# Route table parsing
# ---------------------------------------------------------------------------

def parse_route_table_routes(resource: dict[str, Any]) -> list[RouteEntry]:
    """Parse routes from a route table resource dict.

    Extracts entries from ``properties.routes``.
    """
    properties = _properties(resource)
    routes: list[RouteEntry] = []

    for raw in _iter_dicts(properties.get("routes")):
        route = _parse_single_route(raw)
        if route is not None:
            routes.append(route)

    return routes


def _parse_single_route(raw: dict[str, Any]) -> RouteEntry | None:
    props = raw.get("properties")
    if not isinstance(props, dict):
        props = raw

    name = str(raw.get("name", props.get("name", "")))
    if not name:
        return None

    return RouteEntry(
        name=name,
        address_prefix=props.get("addressPrefix"),
        next_hop_type=props.get("nextHopType"),
        next_hop_ip=props.get("nextHopIpAddress"),
    )


@dataclass(frozen=True)
class RouteVerdictDetail:
    """Route verdict with the route that determined it, when known."""
    verdict: PathVerdict
    route: RouteEntry | None = None


def classify_route_verdict(
    routes: list[RouteEntry],
    *,
    destination_prefix: str | None = None,
) -> PathVerdict:
    """Classify route table verdict for reaching a destination."""
    return classify_route_verdict_detail(routes, destination_prefix=destination_prefix).verdict


def classify_route_verdict_detail(
    routes: list[RouteEntry],
    *,
    destination_prefix: str | None = None,
) -> RouteVerdictDetail:
    """Classify route verdict and preserve the route that determined it.

    Conservative route semantics:
    - No routes → UNKNOWN
    - Matching ``nextHopType=None`` black-hole route → BLOCKED
    - Matching appliance/gateway next-hop → UNKNOWN because reachability depends
      on a firewall/gateway configuration that path analysis has not modelled
    - Matching direct/simple next-hop types → ALLOWED
    - Existing routes that do not match the destination do not block the path
    """
    if not routes:
        return RouteVerdictDetail(PathVerdict.UNKNOWN)

    candidate_routes = [
        route for route in routes
        if not destination_prefix or not route.address_prefix or _prefix_covers(route.address_prefix, destination_prefix)
    ]
    if not candidate_routes:
        return RouteVerdictDetail(PathVerdict.ALLOWED)

    if destination_prefix:
        max_specificity = max(
            _route_prefix_specificity(route.address_prefix, destination_prefix)
            for route in candidate_routes
        )
        candidate_routes = [
            route for route in candidate_routes
            if _route_prefix_specificity(route.address_prefix, destination_prefix) == max_specificity
        ]

    for route in candidate_routes:
        next_hop = (route.next_hop_type or "").strip().lower()
        if next_hop == "none":
            return RouteVerdictDetail(PathVerdict.BLOCKED, route)

    for route in candidate_routes:
        if _route_next_hop_is_ambiguous(route.next_hop_type):
            return RouteVerdictDetail(PathVerdict.UNKNOWN, route)

    for route in candidate_routes:
        if _route_next_hop_is_allowed(route.next_hop_type):
            return RouteVerdictDetail(PathVerdict.ALLOWED, route)

    return RouteVerdictDetail(PathVerdict.UNKNOWN, candidate_routes[0] if candidate_routes else None)


def _route_next_hop_is_ambiguous(next_hop_type: str | None) -> bool:
    return (next_hop_type or "").strip().lower() in {
        "virtualappliance",
        "virtualnetworkgateway",
    }


def _route_next_hop_is_allowed(next_hop_type: str | None) -> bool:
    return (next_hop_type or "").strip().lower() in {
        "internet",
        "vnetlocal",
        "virtualnetwork",
    }

def _route_prefix_specificity(route_prefix: str | None, destination_prefix: str) -> int:
    """Return prefix length for Azure longest-prefix-match ordering."""
    if not route_prefix:
        return 0

    route_text = route_prefix.strip().lower()
    destination_text = destination_prefix.strip().lower()
    if route_text in {"*", "0.0.0.0/0", "::/0"}:
        return 0

    if is_service_tag(route_text):
        try:
            destination_network = ipaddress.ip_network(destination_text, strict=False)
        except ValueError:
            return 0
        networks = resolve_service_tag(route_text) or ()
        matching_lengths = [
            network.prefixlen
            for network in networks
            if network.version == destination_network.version and destination_network.subnet_of(network)
        ]
        return max(matching_lengths, default=0)

    try:
        return ipaddress.ip_network(route_text, strict=False).prefixlen
    except ValueError:
        return 0


def _prefix_covers(route_prefix: str, destination_prefix: str) -> bool:
    """Check if route_prefix covers destination_prefix.

    Supports exact strings, catch-all prefixes, stdlib CIDR containment,
    and Azure service tags resolved via the ``service_tags`` module.
    """
    route_prefix = route_prefix.strip().lower()
    destination_prefix = destination_prefix.strip().lower()

    if route_prefix == destination_prefix:
        return True

    if route_prefix in ("0.0.0.0/0", "::/0", "*"):
        return True

    # --- Service tag resolution ---
    if is_service_tag(route_prefix):
        tag_match = address_prefix_matches_tag(route_prefix, destination_prefix)
        if tag_match is True:
            return True
        if tag_match is False:
            return False
        # tag_match is None → unknown tag, fall through to CIDR (will fail)
        return False

    # --- CIDR containment ---
    try:
        route_network = ipaddress.ip_network(route_prefix, strict=False)
        destination_network = ipaddress.ip_network(destination_prefix, strict=False)
    except ValueError:
        return False

    return route_network.version == destination_network.version and destination_network.subnet_of(route_network)


# ---------------------------------------------------------------------------
# Resource graph helpers
# ---------------------------------------------------------------------------

def _iter_dicts(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def _resource_type_lower(item: dict[str, Any]) -> str:
    return str(item.get("type") or "").lower()


def _canonical_resource_id(value: str | None) -> str | None:
    if value is None:
        return None
    return value.rstrip("/").lower()


def _resource_ids_by_canonical(resources: list[dict[str, Any]]) -> dict[str, str]:
    ids: dict[str, str] = {}
    for item in resources:
        resource_id = item.get("id")
        canonical_id = _canonical_resource_id(resource_id)
        if canonical_id and resource_id:
            ids[canonical_id] = resource_id
    return ids


def _id_from_ref(value: Any) -> str | None:
    if isinstance(value, dict):
        candidate = value.get("id")
        return candidate if isinstance(candidate, str) and candidate else None
    if isinstance(value, str) and value:
        return value
    return None


def _resolve_existing_resource_id(raw_id: str | None, resource_ids: dict[str, str]) -> str | None:
    if not raw_id:
        return None
    canonical_id = _canonical_resource_id(raw_id)
    if canonical_id and canonical_id in resource_ids:
        return resource_ids[canonical_id]
    return None


def _hop_type_for_resource_type(resource_type: str) -> HopType:
    rt = resource_type.lower()
    if rt.startswith("microsoft.network/virtualnetworks/subnets"):
        return HopType.SUBNET
    if rt.startswith("microsoft.network/virtualnetworks"):
        return HopType.VNET
    if rt.startswith("microsoft.network/networkinterfaces"):
        return HopType.NIC
    if rt.startswith("microsoft.network/networksecuritygroups"):
        return HopType.NSG
    if rt.startswith("microsoft.network/routetables"):
        return HopType.ROUTE_TABLE
    if rt.startswith("microsoft.network/privateendpoints"):
        return HopType.PRIVATE_ENDPOINT
    if rt.startswith("microsoft.network/loadbalancers"):
        return HopType.LOAD_BALANCER
    if rt.startswith("microsoft.network/applicationgateways"):
        return HopType.APPLICATION_GATEWAY
    if rt.startswith("microsoft.network/publicipaddresses"):
        return HopType.PUBLIC_IP
    if rt.startswith("microsoft.compute/virtualmachines"):
        return HopType.VM
    if rt.startswith("microsoft.storage/storageaccounts"):
        return HopType.STORAGE_ACCOUNT
    if rt.startswith("microsoft.sql/managedinstances"):
        return HopType.SQL_MI
    if rt.startswith("microsoft.web/sites"):
        return HopType.WEB_APP
    return HopType.OTHER


def _resource_display_name(resource: dict[str, Any]) -> str:
    name = resource.get("name")
    if isinstance(name, str) and name:
        return name.split("/")[-1]
    resource_id = resource.get("id")
    if isinstance(resource_id, str) and resource_id:
        return resource_id.rstrip("/").split("/")[-1]
    return "resource"


# ---------------------------------------------------------------------------
# Core path analysis
# ---------------------------------------------------------------------------

def analyze_path(
    resources: list[dict[str, Any]],
    *,
    source_resource_id: str,
    destination_resource_id: str,
    protocol: str | None = None,
    source_address_prefix: str | None = None,
    destination_address_prefix: str | None = None,
    source_port: int | None = None,
    destination_port: int | None = None,
) -> PathAnalysisResult:
    """Analyze network path from source to destination through Azure resources.

    This is the main entry point. It:
    1. Builds a resource index from the provided resources list.
    2. Follows topology edges (VNet→Subnet→NIC chains) from source to destination.
    3. Applies NSG (both inbound and outbound) and route classification at
       each hop where data exists.
    4. Returns path candidates with allowed/blocked/unknown verdicts.

    Conservative guarantees:
    - Missing NSG data → verdict UNKNOWN (not ALLOWED).
    - Missing route table data → verdict UNKNOWN (not ALLOWED).
    - No path found → overall verdict UNKNOWN with empty hops.
    - Unknown service tags → UNKNOWN (not falsely ALLOWED or BLOCKED).
    """
    resource_ids = _resource_ids_by_canonical(resources)
    resources_by_canonical_id: dict[str, dict[str, Any]] = {}
    for item in resources:
        resource_id = item.get("id")
        canonical_id = _canonical_resource_id(resource_id)
        if canonical_id and resource_id:
            resources_by_canonical_id[canonical_id] = item

    # Resolve source/destination
    source_canonical = _canonical_resource_id(source_resource_id)
    dest_canonical = _canonical_resource_id(destination_resource_id)

    source_res = resources_by_canonical_id.get(source_canonical) if source_canonical else None
    dest_res = resources_by_canonical_id.get(dest_canonical) if dest_canonical else None

    warnings: list[str] = []

    if not source_res:
        warnings.append(f"Source resource not found: {source_resource_id}")
    if not dest_res:
        warnings.append(f"Destination resource not found: {destination_resource_id}")

    if not source_res or not dest_res:
        return PathAnalysisResult(
            source_resource_id=source_resource_id,
            destination_resource_id=destination_resource_id,
            overall_verdict=PathVerdict.UNKNOWN,
            warnings=warnings,
        )

    # Find path from source to destination via topology edges
    trace_result = _trace_path(
        source_res,
        dest_res,
        resources,
        resources_by_canonical_id,
        resource_ids,
    )

    if not trace_result.hops:
        return PathAnalysisResult(
            source_resource_id=source_resource_id,
            destination_resource_id=destination_resource_id,
            overall_verdict=PathVerdict.UNKNOWN,
            warnings=warnings + ["No network path found between source and destination"],
        )

    # Classify each hop – evaluate both inbound and outbound NSG directions
    nsg_params = _NSGParams(
        protocol=protocol,
        source_address_prefix=source_address_prefix,
        destination_address_prefix=destination_address_prefix,
        source_port=source_port,
        destination_port=destination_port,
    )

    classified_hops: list[PathHop] = []
    for idx, hop in enumerate(trace_result.hops):
        classified_hop = _classify_hop(
            hop,
            resources_by_canonical_id,
            resource_ids,
            path_hops=list(trace_result.hops),
            hop_index=idx,
            nsg_params=nsg_params,
        )
        classified_hops.append(classified_hop)

    # Build path candidate
    overall_verdict = _compute_overall_verdict(classified_hops)
    reason = _verdict_reason(classified_hops, overall_verdict)

    candidate = PathCandidate(
        source_resource_id=source_resource_id,
        destination_resource_id=destination_resource_id,
        verdict=overall_verdict,
        hops=tuple(classified_hops),
        reason=reason,
        peering_hop_count=trace_result.peering_hop_count,
        is_forwarded_traffic=trace_result.is_forwarded_traffic,
    )

    return PathAnalysisResult(
        source_resource_id=source_resource_id,
        destination_resource_id=destination_resource_id,
        overall_verdict=overall_verdict,
        path_candidates=[candidate],
        warnings=warnings,
    )


# ---------------------------------------------------------------------------
# Hop classification helpers
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class _NSGParams:
    """Carries NSG evaluation parameters through the classify_hop call."""
    protocol: str | None = None
    source_address_prefix: str | None = None
    destination_address_prefix: str | None = None
    source_port: int | None = None
    destination_port: int | None = None


def _evaluate_nsg_on_resource(
    res: dict[str, Any],
    resources_by_canonical_id: dict[str, dict[str, Any]],
    resource_ids: dict[str, str],
    *,
    direction: str,
    nsg_params: _NSGParams,
) -> tuple[PathVerdict | None, str | None, str | None]:
    """Evaluate effective NSG verdict for a resource and direction.

    For NICs, Azure evaluates both NIC-level and subnet-level NSGs when both
    are associated. A deny at either level blocks traffic; an unknown at either
    level keeps the result unknown; all attached NSGs must allow before the
    hop is treated as allowed.

    Returns ``(verdict, nsg_name, nsg_rule_name)``. When multiple NSGs apply,
    names are joined with ``+`` for evidence display.
    """
    nsg_resources = _associated_nsg_resources(res, resources_by_canonical_id, resource_ids)
    if not nsg_resources:
        return None, None, None

    evaluated: list[tuple[PathVerdict, str, str | None]] = []
    for nsg_res in nsg_resources:
        nsg_name = _resource_display_name(nsg_res)
        rules = _rules_with_azure_defaults(nsg_res)
        virtual_network_prefixes = _virtual_network_prefixes_for_resource(res, resources_by_canonical_id, resource_ids)
        verdict = classify_nsg_verdict(
            rules,
            direction=direction,
            protocol=nsg_params.protocol,
            source_address_prefix=nsg_params.source_address_prefix,
            destination_address_prefix=nsg_params.destination_address_prefix,
            source_port=nsg_params.source_port,
            destination_port=nsg_params.destination_port,
            virtual_network_prefixes=virtual_network_prefixes,
        )
        evaluated.append((
            verdict,
            nsg_name,
            _matching_nsg_rule_name(
                rules,
                direction=direction,
                protocol=nsg_params.protocol,
                source_address_prefix=nsg_params.source_address_prefix,
                destination_address_prefix=nsg_params.destination_address_prefix,
                source_port=nsg_params.source_port,
                destination_port=nsg_params.destination_port,
                virtual_network_prefixes=virtual_network_prefixes,
            ),
        ))

    for verdict, nsg_name, rule_name in evaluated:
        if verdict == PathVerdict.BLOCKED:
            return verdict, nsg_name, rule_name

    joined_names = "+".join(name for _, name, _ in evaluated)
    joined_rules = "+".join(rule for _, _, rule in evaluated if rule) or None
    if any(verdict == PathVerdict.UNKNOWN for verdict, _, _ in evaluated):
        return PathVerdict.UNKNOWN, joined_names, joined_rules
    if any(verdict == PathVerdict.ALLOWED for verdict, _, _ in evaluated):
        return PathVerdict.ALLOWED, joined_names, joined_rules
    return PathVerdict.UNKNOWN, joined_names, joined_rules


def _associated_nsg_resources(
    res: dict[str, Any],
    resources_by_canonical_id: dict[str, dict[str, Any]],
    resource_ids: dict[str, str],
) -> list[dict[str, Any]]:
    """Return direct and parent-subnet NSGs that apply to a resource."""
    properties = _properties(res)
    nsgs: list[dict[str, Any]] = []
    seen: set[str] = set()

    def add_nsg(raw_id: str | None) -> None:
        nsg_id_ref = _resolve_existing_resource_id(raw_id, resource_ids)
        nsg_canonical = _canonical_resource_id(nsg_id_ref) if nsg_id_ref else None
        if not nsg_canonical or nsg_canonical in seen:
            return
        nsg_res = resources_by_canonical_id.get(nsg_canonical)
        if nsg_res:
            seen.add(nsg_canonical)
            nsgs.append(nsg_res)

    add_nsg(_id_from_ref(properties.get("networkSecurityGroup")))

    if _resource_type_lower(res).startswith("microsoft.network/networkinterfaces"):
        for ip_config in _iter_dicts(properties.get("ipConfigurations")):
            ip_props = ip_config.get("properties")
            if not isinstance(ip_props, dict):
                continue
            subnet_id_ref = _resolve_existing_resource_id(
                _id_from_ref(ip_props.get("subnet")),
                resource_ids,
            )
            subnet_canonical = _canonical_resource_id(subnet_id_ref) if subnet_id_ref else None
            subnet_res = resources_by_canonical_id.get(subnet_canonical) if subnet_canonical else None
            if subnet_res:
                add_nsg(_id_from_ref(_properties(subnet_res).get("networkSecurityGroup")))

    return nsgs


def _virtual_network_prefixes_for_resource(
    res: dict[str, Any],
    resources_by_canonical_id: dict[str, dict[str, Any]],
    resource_ids: dict[str, str],
) -> tuple[str, ...] | None:
    """Return the Azure VirtualNetwork tag scope for a subnet/NIC hop.

    Azure's ``VirtualNetwork`` service tag is not all RFC1918 space. For an
    NSG evaluation it covers the owning VNet address space and connected
    peered VNets. If the owning VNet cannot be resolved, callers fall back to
    the static service-tag approximation.
    """
    vnet_id = _vnet_id_for_resource(res, resources_by_canonical_id, resource_ids)
    vnet_canonical = _canonical_resource_id(vnet_id) if vnet_id else None
    vnet_res = resources_by_canonical_id.get(vnet_canonical) if vnet_canonical else None
    if not vnet_res:
        return None

    prefixes: list[str] = list(_vnet_address_prefixes(vnet_res))
    for peer_id in _connected_peered_vnet_ids(vnet_res, resources_by_canonical_id):
        peer_res = resources_by_canonical_id.get(peer_id)
        if peer_res:
            prefixes.extend(_vnet_address_prefixes(peer_res))

    deduped: list[str] = []
    seen: set[str] = set()
    for prefix in prefixes:
        key = prefix.strip().lower()
        if key and key not in seen:
            seen.add(key)
            deduped.append(prefix)
    return tuple(deduped)


def _vnet_id_for_resource(
    res: dict[str, Any],
    resources_by_canonical_id: dict[str, dict[str, Any]],
    resource_ids: dict[str, str],
) -> str | None:
    resource_id = str(res.get("id") or "")
    resource_type = _resource_type_lower(res)
    if resource_type.startswith("microsoft.network/virtualnetworks/subnets") and "/subnets/" in resource_id.lower():
        return resource_id[:resource_id.lower().index("/subnets/")]

    if resource_type.startswith("microsoft.network/networkinterfaces"):
        for ip_config in _iter_dicts(_properties(res).get("ipConfigurations")):
            ip_props = ip_config.get("properties")
            if not isinstance(ip_props, dict):
                continue
            subnet_id_ref = _resolve_existing_resource_id(_id_from_ref(ip_props.get("subnet")), resource_ids)
            if subnet_id_ref and "/subnets/" in subnet_id_ref.lower():
                return subnet_id_ref[:subnet_id_ref.lower().index("/subnets/")]

    subnet_id_ref = _resolve_existing_resource_id(_id_from_ref(_properties(res).get("subnet")), resource_ids)
    if subnet_id_ref and "/subnets/" in subnet_id_ref.lower():
        return subnet_id_ref[:subnet_id_ref.lower().index("/subnets/")]
    return None


def _vnet_address_prefixes(vnet_res: dict[str, Any]) -> tuple[str, ...]:
    address_space = _properties(vnet_res).get("addressSpace")
    prefixes: list[str] = []
    if isinstance(address_space, dict):
        raw = address_space.get("addressPrefixes")
        if isinstance(raw, list):
            prefixes.extend(str(item) for item in raw if item)
        elif isinstance(raw, str):
            prefixes.append(raw)
    raw_prefix = _properties(vnet_res).get("addressPrefix")
    if isinstance(raw_prefix, str):
        prefixes.append(raw_prefix)
    return tuple(prefixes)


def _connected_peered_vnet_ids(
    vnet_res: dict[str, Any],
    resources_by_canonical_id: dict[str, dict[str, Any]],
) -> tuple[str, ...]:
    vnet_id = _canonical_resource_id(str(vnet_res.get("id") or ""))
    if not vnet_id:
        return ()

    peers: set[str] = set()
    for raw in _iter_dicts(_properties(vnet_res).get("virtualNetworkPeerings")):
        props = raw.get("properties") if isinstance(raw.get("properties"), dict) else raw
        state = str(props.get("peeringState") or "").strip().lower()
        if state != "connected":
            continue
        remote_id = _canonical_resource_id(_id_from_ref(props.get("remoteVirtualNetwork")))
        if not remote_id:
            continue
        remote = resources_by_canonical_id.get(remote_id)
        if remote and _has_connected_reverse_peering(remote, vnet_id):
            peers.add(remote_id)
    return tuple(sorted(peers))


def _has_connected_reverse_peering(vnet_res: dict[str, Any], expected_remote_vnet_id: str) -> bool:
    for raw in _iter_dicts(_properties(vnet_res).get("virtualNetworkPeerings")):
        props = raw.get("properties") if isinstance(raw.get("properties"), dict) else raw
        state = str(props.get("peeringState") or "").strip().lower()
        if state != "connected":
            continue
        remote_id = _canonical_resource_id(_id_from_ref(props.get("remoteVirtualNetwork")))
        if remote_id == expected_remote_vnet_id:
            return True
    return False


def _matching_nsg_rule_name(
    rules: list[NSGRule],
    *,
    direction: str,
    protocol: str | None = None,
    source_address_prefix: str | None = None,
    destination_address_prefix: str | None = None,
    source_port: int | None = None,
    destination_port: int | None = None,
    virtual_network_prefixes: Sequence[str] | None = None,
) -> str | None:
    matching = _matching_nsg_rules(
        rules,
        direction=direction,
        protocol=protocol,
        source_address_prefix=source_address_prefix,
        destination_address_prefix=destination_address_prefix,
        source_port=source_port,
        destination_port=destination_port,
        virtual_network_prefixes=virtual_network_prefixes,
    )
    return matching[0].name if matching else None


def _classify_hop(
    hop: PathHop,
    resources_by_canonical_id: dict[str, dict[str, Any]],
    resource_ids: dict[str, str],
    *,
    path_hops: list[PathHop],
    hop_index: int,
    nsg_params: _NSGParams,
) -> PathHop:
    """Classify a single hop by checking NSG (inbound + outbound) and route data.

    NSG direction assignment:
    - Source-side hops (closer to source) evaluate **outbound** NSG direction.
    - Destination-side hops (closer to destination) evaluate **inbound** NSG
      direction.
    - For a path of N hops, the first hop is the source and the last is the
      destination.  We evaluate outbound on the source's NSG-attached hop and
      inbound on the destination's NSG-attached hop.
    """
    hop_canonical = _canonical_resource_id(hop.resource_id)
    if not hop_canonical:
        return hop

    # Only classify hops where NSGs or route tables are relevant
    # (subnets and NICs are the main attachment points)
    if hop.hop_type not in (HopType.SUBNET, HopType.NIC):
        return hop

    res = resources_by_canonical_id.get(hop_canonical)
    if not res:
        return hop

    # NSG-bearing hops may appear anywhere in the traced path (for example,
    # a source VM's subnet is usually not index 0). Evaluate both directions
    # on every NSG-bearing subnet/NIC and let the overall verdict remain
    # conservative: any block blocks, any unknown prevents a partial allow from
    # becoming allowed.
    _ = path_hops, hop_index

    # Inbound verdict
    nsg_inbound_verdict: PathVerdict | None = None
    nsg_name: str | None = None
    nsg_rule_name: str | None = None
    nsg_direction: str | None = None

    # Outbound verdict (source-side NSG)
    nsg_outbound_verdict: PathVerdict | None = None
    nsg_outbound_name: str | None = None
    nsg_outbound_rule_name: str | None = None

    inbound_v, inbound_name, inbound_rule = _evaluate_nsg_on_resource(
        res, resources_by_canonical_id, resource_ids,
        direction="inbound", nsg_params=nsg_params,
    )
    nsg_inbound_verdict = inbound_v
    nsg_name = inbound_name
    nsg_rule_name = inbound_rule
    if inbound_v is not None:
        nsg_direction = "inbound"

    outbound_v, outbound_name, outbound_rule = _evaluate_nsg_on_resource(
        res, resources_by_canonical_id, resource_ids,
        direction="outbound", nsg_params=nsg_params,
    )
    nsg_outbound_verdict = outbound_v
    nsg_outbound_name = outbound_name
    nsg_outbound_rule_name = outbound_rule
    # If no inbound was set but outbound is, use outbound as primary
    if nsg_inbound_verdict is None and outbound_v is not None:
        nsg_direction = "outbound"
        nsg_name = outbound_name
        nsg_rule_name = outbound_rule
        nsg_inbound_verdict = outbound_v

    # For simple source→dest paths where source == index 0 and dest == last,
    # assign the primary nsg_verdict to inbound (dest side) and track outbound
    # separately.  For single-hop or degenerate paths, use whichever is set.
    primary_nsg_verdict = nsg_inbound_verdict
    if primary_nsg_verdict is None and nsg_outbound_verdict is not None:
        primary_nsg_verdict = nsg_outbound_verdict
        nsg_direction = "outbound"
        nsg_name = nsg_outbound_name
        nsg_rule_name = nsg_outbound_rule_name

    # --- Route table evaluation ---
    route_verdict: PathVerdict | None = None
    route_table_name: str | None = None
    route_name: str | None = None
    route_next_hop_type: str | None = None
    route_next_hop_ip: str | None = None

    rt_id_ref = _resolve_existing_resource_id(
        _id_from_ref(_properties(res).get("routeTable")),
        resource_ids,
    )

    # For NICs, also check subnet route table
    if not rt_id_ref and hop.hop_type == HopType.NIC:
        ip_configs = _iter_dicts(_properties(res).get("ipConfigurations"))
        for ip_config in ip_configs:
            ip_props = ip_config.get("properties")
            if not isinstance(ip_props, dict):
                continue
            subnet_id_ref = _resolve_existing_resource_id(
                _id_from_ref(ip_props.get("subnet")),
                resource_ids,
            )
            if subnet_id_ref:
                subnet_canonical = _canonical_resource_id(subnet_id_ref)
                subnet_res = resources_by_canonical_id.get(subnet_canonical) if subnet_canonical else None
                if subnet_res:
                    subnet_props = _properties(subnet_res)
                    rt_id_ref = _resolve_existing_resource_id(
                        _id_from_ref(subnet_props.get("routeTable")),
                        resource_ids,
                    )
                    if rt_id_ref:
                        break

    if rt_id_ref:
        rt_canonical = _canonical_resource_id(rt_id_ref)
        rt_res = resources_by_canonical_id.get(rt_canonical) if rt_canonical else None
        if rt_res:
            route_table_name = _resource_display_name(rt_res)
            routes = parse_route_table_routes(rt_res)
            route_detail = classify_route_verdict_detail(routes, destination_prefix=nsg_params.destination_address_prefix)
            route_verdict = route_detail.verdict
            if route_detail.route:
                route_name = route_detail.route.name
                route_next_hop_type = route_detail.route.next_hop_type
                route_next_hop_ip = route_detail.route.next_hop_ip

    return PathHop(
        resource_id=hop.resource_id,
        resource_type=hop.resource_type,
        hop_type=hop.hop_type,
        display_name=hop.display_name,
        nsg_verdict=primary_nsg_verdict,
        nsg_name=nsg_name,
        nsg_rule_name=nsg_rule_name,
        nsg_direction=nsg_direction,
        nsg_outbound_verdict=nsg_outbound_verdict,
        nsg_outbound_name=nsg_outbound_name,
        nsg_outbound_rule_name=nsg_outbound_rule_name,
        route_verdict=route_verdict,
        route_table_name=route_table_name,
        route_name=route_name,
        route_next_hop_type=route_next_hop_type,
        route_next_hop_ip=route_next_hop_ip,
        is_peering_boundary=hop.is_peering_boundary,
    )


def _compute_overall_verdict(hops: list[PathHop]) -> PathVerdict:
    """Compute overall verdict from hop-level verdicts.

    Rules (considering both inbound and outbound NSG directions):
    - Any hop with BLOCKED inbound NSG, outbound NSG, or route verdict → BLOCKED
    - All hops have ALLOWED or no NSG/route data, and at least one hop has
      explicit ALLOWED → ALLOWED (only if no UNKNOWN remains)
    - Otherwise → UNKNOWN
    """
    has_explicit_allow = False
    for hop in hops:
        # Check all possible blocking signals
        for verdict in (hop.nsg_verdict, hop.nsg_outbound_verdict, hop.route_verdict):
            if verdict == PathVerdict.BLOCKED:
                return PathVerdict.BLOCKED

        # Check for explicit allow signals
        if hop.nsg_verdict == PathVerdict.ALLOWED or hop.route_verdict == PathVerdict.ALLOWED:
            has_explicit_allow = True
        if hop.nsg_outbound_verdict == PathVerdict.ALLOWED:
            has_explicit_allow = True

    if has_explicit_allow:
        # Conservative: if any attached NSG or route table exists
        # but cannot be classified, keep the overall result UNKNOWN instead of
        # upgrading a partial allow signal to ALLOWED.
        for hop in hops:
            for verdict in (hop.nsg_verdict, hop.nsg_outbound_verdict, hop.route_verdict):
                if verdict == PathVerdict.UNKNOWN:
                    return PathVerdict.UNKNOWN
        return PathVerdict.ALLOWED

    return PathVerdict.UNKNOWN


def _route_next_hop_label(next_hop_type: str, next_hop_ip: str | None = None) -> str:
    """Return user-facing wording for Azure route next-hop evidence."""
    normalized = next_hop_type.strip().lower()
    if normalized == "vnetlocal":
        return "direct within VNet"
    if normalized == "virtualnetwork":
        return "direct within virtual network"
    if normalized == "internet":
        return "internet-bound"
    if normalized == "virtualappliance":
        return f"via appliance {next_hop_ip}" if next_hop_ip else "via appliance"
    if normalized == "virtualnetworkgateway":
        return "via virtual network gateway"
    if normalized == "none":
        return "black hole dropped"
    return f"via {next_hop_type}{f' {next_hop_ip}' if next_hop_ip else ''}"


def _verdict_reason_hop_detail(hop: PathHop) -> str:
    """Format a single hop's verdict detail for the reason string, including next-hop evidence."""
    parts = [hop.display_name]

    nsg_parts: list[str] = []
    if hop.nsg_verdict is not None:
        nsg_parts.append(f"inNSG={hop.nsg_verdict.value}")
    if hop.nsg_outbound_verdict is not None:
        nsg_parts.append(f"outNSG={hop.nsg_outbound_verdict.value}")
    if nsg_parts:
        parts.append("(" + ", ".join(nsg_parts) + ")")

    route_parts: list[str] = []
    if hop.route_verdict is not None:
        route_parts.append(f"route={hop.route_verdict.value}")
    if hop.route_next_hop_type is not None:
        route_parts.append(_route_next_hop_label(hop.route_next_hop_type, hop.route_next_hop_ip))
    if route_parts:
        parts.append("(" + ", ".join(route_parts) + ")")

    return " ".join(parts)


def _verdict_reason(hops: list[PathHop], verdict: PathVerdict) -> str:
    """Generate a human-readable reason for the verdict."""
    if verdict == PathVerdict.ALLOWED:
        allow_hops = [
            hop for hop in hops
            if hop.nsg_verdict == PathVerdict.ALLOWED
            or hop.nsg_outbound_verdict == PathVerdict.ALLOWED
            or hop.route_verdict == PathVerdict.ALLOWED
        ]
        details = ", ".join(
            _verdict_reason_hop_detail(hop)
            for hop in allow_hops
        )
        return f"All hops allow traffic: {details}"

    if verdict == PathVerdict.BLOCKED:
        block_hops = [
            hop for hop in hops
            if hop.nsg_verdict == PathVerdict.BLOCKED
            or hop.nsg_outbound_verdict == PathVerdict.BLOCKED
            or hop.route_verdict == PathVerdict.BLOCKED
        ]
        details = ", ".join(
            _verdict_reason_hop_detail(hop)
            for hop in block_hops
        )
        return f"Traffic blocked at: {details}"

    # UNKNOWN
    unknown_hops = [
        hop for hop in hops
        if (hop.nsg_verdict is None and hop.nsg_outbound_verdict is None and hop.route_verdict is None)
        or hop.nsg_verdict == PathVerdict.UNKNOWN
        or hop.nsg_outbound_verdict == PathVerdict.UNKNOWN
        or hop.route_verdict == PathVerdict.UNKNOWN
    ]
    if not unknown_hops:
        return "Verdict unknown: insufficient data for classification"
    details = ", ".join(_verdict_reason_hop_detail(hop) for hop in unknown_hops)
    return f"Insufficient NSG/route data for hops: {details}"


# ---------------------------------------------------------------------------
# Path tracing (BFS)
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class _TraversalEdge:
    target_resource_id: str
    is_peering: bool = False
    allow_forwarded_traffic: bool | None = None


@dataclass(frozen=True)
class _TraceResult:
    """Result of path tracing including peering metadata."""
    hops: tuple[PathHop, ...]
    peering_hop_count: int = 0
    is_forwarded_traffic: bool | None = None
    peering_boundary_ids: tuple[str, ...] = ()  # canonical IDs of VNet hops reached via peering


def _trace_path(
    source: dict[str, Any],
    destination: dict[str, Any],
    resources: list[dict[str, Any]],
    resources_by_canonical_id: dict[str, dict[str, Any]],
    resource_ids: dict[str, str],
) -> _TraceResult:
    """Trace a network path from source resource to destination resource.

    Uses topology inference (ARM ID references) to follow VNet→Subnet→NIC
    chains. This is a simplified BFS-style path finder for MVP scope.

    Returns a _TraceResult with hops, peering count, and forwarded-traffic
    metadata for source-address-aware direct vs. forwarded distinction.
    """
    from app.services.topology_inference import infer_explicit_network_relationship_edges

    source_id = source.get("id", "")
    dest_id = destination.get("id", "")

    # Build adjacency from explicit traffic-carrying edges only.
    # NSG ``secures`` and route-table ``routes`` edges describe controls that
    # attach to a path hop; they are not traffic path hops themselves.
    edges = infer_explicit_network_relationship_edges(resources)

    # Build adjacency list. Most ARM reference edges describe attachments that
    # should be traversable in both directions for path finding. VNet peering is
    # different: Azure requires both sides to be configured, so only treat a
    # peering as traversable when reciprocal peering evidence exists.
    adjacency: dict[str, list[_TraversalEdge]] = {}
    connect_edges = [edge for edge in edges if edge.get("relation_type") == "connects_to"]
    peering_pairs: set[tuple[str, str]] = set()

    def _edge_resource_ids(edge: dict[str, Any]) -> tuple[str, str]:
        src_key = edge["source_node_key"]
        tgt_key = edge["target_node_key"]
        src_rid = src_key.replace("resource:", "", 1) if src_key.startswith("resource:") else src_key
        tgt_rid = tgt_key.replace("resource:", "", 1) if tgt_key.startswith("resource:") else tgt_key
        return src_rid, tgt_rid

    for edge in connect_edges:
        if "virtualNetworkPeerings" not in str(edge.get("evidence") or ""):
            continue
        src_rid, tgt_rid = _edge_resource_ids(edge)
        if not _peering_edge_is_connected(src_rid, tgt_rid, resources_by_canonical_id):
            continue
        peering_pairs.add((
            (_canonical_resource_id(src_rid) or src_rid),
            (_canonical_resource_id(tgt_rid) or tgt_rid),
        ))

    for edge in connect_edges:
        src_rid, tgt_rid = _edge_resource_ids(edge)
        if "virtualNetworkPeerings" in str(edge.get("evidence") or ""):
            canonical_pair = (
                (_canonical_resource_id(src_rid) or src_rid),
                (_canonical_resource_id(tgt_rid) or tgt_rid),
            )
            if canonical_pair not in peering_pairs or (canonical_pair[1], canonical_pair[0]) not in peering_pairs:
                continue
            if not _peering_edge_allows_virtual_network_access(src_rid, tgt_rid, resources_by_canonical_id):
                continue
            adjacency.setdefault(src_rid, []).append(_TraversalEdge(
                target_resource_id=tgt_rid,
                is_peering=True,
                allow_forwarded_traffic=_peering_edge_allows_forwarded_traffic(src_rid, tgt_rid, resources_by_canonical_id),
            ))
            continue
        adjacency.setdefault(src_rid, []).append(_TraversalEdge(target_resource_id=tgt_rid))
        adjacency.setdefault(tgt_rid, []).append(_TraversalEdge(target_resource_id=src_rid))

    # BFS from source to destination
    source_canonical = _canonical_resource_id(source_id) or ""
    dest_canonical = _canonical_resource_id(dest_id) or ""

    if not source_canonical or not dest_canonical:
        return _TraceResult(hops=())

    # Use canonical IDs for BFS
    canonical_adjacency: dict[str, list[_TraversalEdge]] = {}
    for rid, neighbors in adjacency.items():
        canonical_rid = _canonical_resource_id(rid) or rid
        canonical_neighbors = [
            _TraversalEdge(
                target_resource_id=_canonical_resource_id(edge.target_resource_id) or edge.target_resource_id,
                is_peering=edge.is_peering,
                allow_forwarded_traffic=edge.allow_forwarded_traffic,
            )
            for edge in neighbors
        ]
        canonical_adjacency.setdefault(canonical_rid, []).extend(canonical_neighbors)

    # BFS
    traversal_limit = max(len(resources), 1)
    start_state = (source_canonical, 0, True)
    visited: set[tuple[str, int, bool]] = set()
    parent: dict[tuple[str, int, bool], tuple[str, int, bool]] = {}
    queue = [start_state]
    visited.add(start_state)

    found_state: tuple[str, int, bool] | None = None
    while queue:
        current, peering_hops, forwarded_allowed = queue.pop(0)
        if current == dest_canonical:
            found_state = (current, peering_hops, forwarded_allowed)
            break
        for edge in canonical_adjacency.get(current, []):
            next_peering_hops = peering_hops + (1 if edge.is_peering else 0)
            if next_peering_hops > traversal_limit:
                continue
            next_forwarded_allowed = forwarded_allowed
            if edge.is_peering:
                next_forwarded_allowed = forwarded_allowed and edge.allow_forwarded_traffic is True
            if next_peering_hops > 1 and not next_forwarded_allowed:
                continue
            next_state = (edge.target_resource_id, next_peering_hops, next_forwarded_allowed)
            if next_state not in visited:
                visited.add(next_state)
                parent[next_state] = (current, peering_hops, forwarded_allowed)
                queue.append(next_state)

    if found_state is None:
        return _TraceResult(hops=())

    # Reconstruct path
    path: list[str] = []
    current_state = found_state
    while current_state[0] != source_canonical:
        current = current_state[0]
        path.append(current)
        current_state = parent.get(current_state)
        if current_state is None:
            return _TraceResult(hops=())  # Should not happen if BFS found it
    path.append(source_canonical)
    path.reverse()

    # Determine which path edges are peering crossings.
    # Walk the BFS path and check adjacency to find peering boundary VNet hops.
    peering_boundary_canonical: set[str] = set()
    for i in range(len(path) - 1):
        current_rid = path[i]
        next_rid = path[i + 1]
        for edge in canonical_adjacency.get(current_rid, []):
            if edge.target_resource_id == next_rid and edge.is_peering:
                # The target VNet of a peering edge is a peering boundary
                peering_boundary_canonical.add(next_rid)
                break

    # Extract peering metadata from the found BFS state
    final_peering_hops = found_state[1] if found_state else 0
    is_forwarded: bool | None = None
    if final_peering_hops == 0:
        is_forwarded = None   # intra-VNet
    elif final_peering_hops == 1:
        is_forwarded = False  # direct peering
    else:
        is_forwarded = True   # transitive / forwarded

    # Convert to PathHop list
    hops: list[PathHop] = []
    for rid in path:
        res = resources_by_canonical_id.get(rid)
        if res:
            actual_id = res.get("id", rid)
            rt = _resource_type_lower(res)
            hops.append(PathHop(
                resource_id=actual_id,
                resource_type=rt,
                hop_type=_hop_type_for_resource_type(rt),
                display_name=_resource_display_name(res),
                is_peering_boundary=rid in peering_boundary_canonical,
            ))
        else:
            # Fallback for unknown resource in path
            actual_id = resource_ids.get(rid, rid)
            hops.append(PathHop(
                resource_id=actual_id,
                resource_type="unknown",
                hop_type=HopType.OTHER,
                display_name=actual_id.split("/")[-1] if actual_id else "unknown",
                is_peering_boundary=rid in peering_boundary_canonical,
            ))

    return _TraceResult(
        hops=tuple(hops),
        peering_hop_count=final_peering_hops,
        is_forwarded_traffic=is_forwarded,
        peering_boundary_ids=tuple(sorted(peering_boundary_canonical)),
    )


def _peering_edge_is_connected(
    source_vnet_id: str,
    target_vnet_id: str,
    resources_by_canonical_id: dict[str, dict[str, Any]],
) -> bool:
    source = resources_by_canonical_id.get(_canonical_resource_id(source_vnet_id) or "")
    target_canonical = _canonical_resource_id(target_vnet_id)
    if not source or not target_canonical:
        return False

    for raw in _iter_dicts(_properties(source).get("virtualNetworkPeerings")):
        props = raw.get("properties") if isinstance(raw.get("properties"), dict) else raw
        remote_id = _canonical_resource_id(_id_from_ref(props.get("remoteVirtualNetwork")))
        if remote_id != target_canonical:
            continue
        state = str(props.get("peeringState") or "").strip().lower()
        return state == "connected"
    return False


def _peering_edge_allows_virtual_network_access(
    source_vnet_id: str,
    target_vnet_id: str,
    resources_by_canonical_id: dict[str, dict[str, Any]],
) -> bool:
    source = resources_by_canonical_id.get(_canonical_resource_id(source_vnet_id) or "")
    target_canonical = _canonical_resource_id(target_vnet_id)
    if not source or not target_canonical:
        return False

    for raw in _iter_dicts(_properties(source).get("virtualNetworkPeerings")):
        props = raw.get("properties") if isinstance(raw.get("properties"), dict) else raw
        remote_id = _canonical_resource_id(_id_from_ref(props.get("remoteVirtualNetwork")))
        if remote_id != target_canonical:
            continue
        raw_value = props.get("allowVirtualNetworkAccess")
        return raw_value is not False
    return False


def _peering_edge_allows_forwarded_traffic(
    source_vnet_id: str,
    target_vnet_id: str,
    resources_by_canonical_id: dict[str, dict[str, Any]],
) -> bool | None:
    source = resources_by_canonical_id.get(_canonical_resource_id(source_vnet_id) or "")
    target_canonical = _canonical_resource_id(target_vnet_id)
    if not source or not target_canonical:
        return None

    for raw in _iter_dicts(_properties(source).get("virtualNetworkPeerings")):
        props = raw.get("properties") if isinstance(raw.get("properties"), dict) else raw
        remote_id = _canonical_resource_id(_id_from_ref(props.get("remoteVirtualNetwork")))
        if remote_id != target_canonical:
            continue
        raw_value = props.get("allowForwardedTraffic")
        return raw_value if isinstance(raw_value, bool) else None
    return None
