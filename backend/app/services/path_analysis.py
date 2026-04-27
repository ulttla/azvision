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
from typing import Any

from app.services.service_tags import address_prefix_matches_tag, is_service_tag


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


@dataclass(frozen=True)
class PathCandidate:
    """A single source→destination path candidate with verdict."""
    source_resource_id: str
    destination_resource_id: str
    verdict: PathVerdict
    hops: tuple[PathHop, ...]
    reason: str


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
    """Parse an NSG and add Azure defaults if the payload omitted them."""
    rules = parse_nsg_rules(resource)
    if not _iter_dicts(_properties(resource).get("defaultSecurityRules")):
        rules.extend(_azure_default_nsg_rules())
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
    destination_port: int | None = None,
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

    matching = _matching_nsg_rules(
        rules,
        direction=direction,
        protocol=protocol,
        source_address_prefix=source_address_prefix,
        destination_address_prefix=destination_address_prefix,
        destination_port=destination_port,
    )
    if not matching:
        return PathVerdict.UNKNOWN

    top_rule = matching[0]

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
    destination_port: int | None = None,
) -> list[NSGRule]:
    matching = [
        r for r in rules
        if r.direction == direction
        and _protocol_matches(r.protocol, protocol)
        and _address_prefix_matches(r.source_address_prefix, source_address_prefix)
        and _address_prefix_matches(r.destination_address_prefix, destination_address_prefix)
        and _port_matches(r.destination_port_range, destination_port)
    ]
    return sorted(matching, key=lambda r: r.priority)


def _protocol_matches(rule_protocol: str | None, requested_protocol: str | None) -> bool:
    if not requested_protocol:
        return True
    if not rule_protocol or str(rule_protocol).strip() in {"", "*"}:
        return True
    return str(rule_protocol).strip().lower() == requested_protocol.strip().lower()


def _address_prefix_matches(rule_value: Any, requested_prefix: str | None) -> bool:
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
    if not requested_prefix:
        return True
    if rule_value is None:
        return True

    values = rule_value if isinstance(rule_value, list) else [rule_value]
    requested = requested_prefix.strip().lower()
    for value in values:
        text = str(value).strip().lower()
        if text in {"", "*"} or text == requested:
            return True

        # --- Service tag resolution ---
        # If the rule value is a known service tag, expand it and check
        # whether the requested prefix falls within the tag's ranges.
        if is_service_tag(text):
            tag_match = address_prefix_matches_tag(text, requested)
            if tag_match is True:
                return True
            if tag_match is False:
                continue  # not covered by this tag; try next value
            # tag_match is None → unknown tag, fall through to CIDR
            # (which will also fail), then return False at end

        # --- CIDR containment ---
        try:
            rule_network = ipaddress.ip_network(text, strict=False)
            requested_network = ipaddress.ip_network(requested, strict=False)
        except ValueError:
            continue
        if rule_network.version == requested_network.version and requested_network.subnet_of(rule_network):
            return True
    return False


def _port_matches(rule_value: Any, requested_port: int | None) -> bool:
    if requested_port is None:
        return True
    if rule_value is None:
        return True

    raw_values = rule_value if isinstance(rule_value, list) else [rule_value]
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
    path_hops = _trace_path(
        source_res,
        dest_res,
        resources,
        resources_by_canonical_id,
        resource_ids,
    )

    if not path_hops:
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
        destination_port=destination_port,
    )

    classified_hops: list[PathHop] = []
    for idx, hop in enumerate(path_hops):
        classified_hop = _classify_hop(
            hop,
            resources_by_canonical_id,
            resource_ids,
            path_hops=path_hops,
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
        verdict = classify_nsg_verdict(
            rules,
            direction=direction,
            protocol=nsg_params.protocol,
            source_address_prefix=nsg_params.source_address_prefix,
            destination_address_prefix=nsg_params.destination_address_prefix,
            destination_port=nsg_params.destination_port,
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
                destination_port=nsg_params.destination_port,
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


def _matching_nsg_rule_name(
    rules: list[NSGRule],
    *,
    direction: str,
    protocol: str | None = None,
    source_address_prefix: str | None = None,
    destination_address_prefix: str | None = None,
    destination_port: int | None = None,
) -> str | None:
    matching = _matching_nsg_rules(
        rules,
        direction=direction,
        protocol=protocol,
        source_address_prefix=source_address_prefix,
        destination_address_prefix=destination_address_prefix,
        destination_port=destination_port,
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
            f"{hop.display_name}("
            f"inNSG={hop.nsg_verdict.value if hop.nsg_verdict else 'N/A'}, "
            f"outNSG={hop.nsg_outbound_verdict.value if hop.nsg_outbound_verdict else 'N/A'}, "
            f"route={hop.route_verdict.value if hop.route_verdict else 'N/A'})"
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
            f"{hop.display_name}("
            f"inNSG={hop.nsg_verdict.value if hop.nsg_verdict else 'N/A'}, "
            f"outNSG={hop.nsg_outbound_verdict.value if hop.nsg_outbound_verdict else 'N/A'}, "
            f"route={hop.route_verdict.value if hop.route_verdict else 'N/A'})"
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
    hop_names = ", ".join(hop.display_name for hop in unknown_hops)
    return f"Insufficient NSG/route data for hops: {hop_names}"


# ---------------------------------------------------------------------------
# Path tracing (BFS)
# ---------------------------------------------------------------------------

def _trace_path(
    source: dict[str, Any],
    destination: dict[str, Any],
    resources: list[dict[str, Any]],
    resources_by_canonical_id: dict[str, dict[str, Any]],
    resource_ids: dict[str, str],
) -> list[PathHop]:
    """Trace a network path from source resource to destination resource.

    Uses topology inference (ARM ID references) to follow VNet→Subnet→NIC
    chains. This is a simplified BFS-style path finder for MVP scope.
    """
    from app.services.topology_inference import infer_explicit_network_relationship_edges

    source_id = source.get("id", "")
    dest_id = destination.get("id", "")

    # Build adjacency from explicit traffic-carrying edges only.
    # NSG ``secures`` and route-table ``routes`` edges describe controls that
    # attach to a path hop; they are not traffic path hops themselves.
    edges = infer_explicit_network_relationship_edges(resources)

    # Build adjacency list (undirected for MVP path-finding over connectivity edges).
    adjacency: dict[str, list[str]] = {}
    for edge in edges:
        if edge.get("relation_type") != "connects_to":
            continue
        src_key = edge["source_node_key"]
        tgt_key = edge["target_node_key"]
        # Strip "resource:" prefix for adjacency
        src_rid = src_key.replace("resource:", "", 1) if src_key.startswith("resource:") else src_key
        tgt_rid = tgt_key.replace("resource:", "", 1) if tgt_key.startswith("resource:") else tgt_key
        adjacency.setdefault(src_rid, []).append(tgt_rid)
        adjacency.setdefault(tgt_rid, []).append(src_rid)

    # BFS from source to destination
    source_canonical = _canonical_resource_id(source_id) or ""
    dest_canonical = _canonical_resource_id(dest_id) or ""

    if not source_canonical or not dest_canonical:
        return []

    # Use canonical IDs for BFS
    canonical_adjacency: dict[str, list[str]] = {}
    for rid, neighbors in adjacency.items():
        canonical_rid = _canonical_resource_id(rid) or rid
        canonical_neighbors = [_canonical_resource_id(n) or n for n in neighbors]
        canonical_adjacency.setdefault(canonical_rid, []).extend(canonical_neighbors)

    # BFS
    visited: set[str] = set()
    parent: dict[str, str] = {}
    queue = [source_canonical]
    visited.add(source_canonical)

    found = False
    while queue:
        current = queue.pop(0)
        if current == dest_canonical:
            found = True
            break
        for neighbor in canonical_adjacency.get(current, []):
            if neighbor not in visited:
                visited.add(neighbor)
                parent[neighbor] = current
                queue.append(neighbor)

    if not found:
        return []

    # Reconstruct path
    path: list[str] = []
    current = dest_canonical
    while current != source_canonical:
        path.append(current)
        current = parent.get(current)
        if current is None:
            return []  # Should not happen if BFS found it
    path.append(source_canonical)
    path.reverse()

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
            ))
        else:
            # Fallback for unknown resource in path
            actual_id = resource_ids.get(rid, rid)
            hops.append(PathHop(
                resource_id=actual_id,
                resource_type="unknown",
                hop_type=HopType.OTHER,
                display_name=actual_id.split("/")[-1] if actual_id else "unknown",
            ))

    return hops