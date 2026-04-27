"""API routes for network path analysis.

Provides source→destination path analysis using topology edges, NSG rules,
and route table data from the workspace inventory.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query

from app.collectors.azure_inventory import (
    AzureInventoryError,
    resolve_inventory_collection,
)
from app.core.config import get_settings
from app.services.path_analysis import PathVerdict, analyze_path

router = APIRouter(prefix="/workspaces/{workspace_id}/path-analysis", tags=["path-analysis"])


def _path_analysis_to_dict(result: Any) -> dict[str, Any]:
    """Serialize a PathAnalysisResult to a JSON-friendly dict."""
    path_candidates: list[dict[str, Any]] = []
    for candidate in result.path_candidates:
        hops: list[dict[str, Any]] = []
        for hop in candidate.hops:
            hop_dict: dict[str, Any] = {
                "resource_id": hop.resource_id,
                "resource_type": hop.resource_type,
                "hop_type": hop.hop_type.value if hasattr(hop.hop_type, "value") else str(hop.hop_type),
                "display_name": hop.display_name,
            }
            if hop.nsg_verdict is not None:
                hop_dict["nsg_verdict"] = hop.nsg_verdict.value if hasattr(hop.nsg_verdict, "value") else str(hop.nsg_verdict)
            if hop.nsg_name is not None:
                hop_dict["nsg_name"] = hop.nsg_name
            if hop.nsg_rule_name is not None:
                hop_dict["nsg_rule_name"] = hop.nsg_rule_name
            if hop.nsg_direction is not None:
                hop_dict["nsg_direction"] = hop.nsg_direction
            if hop.nsg_outbound_verdict is not None:
                hop_dict["nsg_outbound_verdict"] = hop.nsg_outbound_verdict.value if hasattr(hop.nsg_outbound_verdict, "value") else str(hop.nsg_outbound_verdict)
            if hop.nsg_outbound_name is not None:
                hop_dict["nsg_outbound_name"] = hop.nsg_outbound_name
            if hop.nsg_outbound_rule_name is not None:
                hop_dict["nsg_outbound_rule_name"] = hop.nsg_outbound_rule_name
            if hop.route_verdict is not None:
                hop_dict["route_verdict"] = hop.route_verdict.value if hasattr(hop.route_verdict, "value") else str(hop.route_verdict)
            if hop.route_table_name is not None:
                hop_dict["route_table_name"] = hop.route_table_name
            if hop.route_name is not None:
                hop_dict["route_name"] = hop.route_name
            if hop.route_next_hop_type is not None:
                hop_dict["route_next_hop_type"] = hop.route_next_hop_type
            if hop.route_next_hop_ip is not None:
                hop_dict["route_next_hop_ip"] = hop.route_next_hop_ip
            hops.append(hop_dict)

        path_candidates.append({
            "source_resource_id": candidate.source_resource_id,
            "destination_resource_id": candidate.destination_resource_id,
            "verdict": candidate.verdict.value if hasattr(candidate.verdict, "value") else str(candidate.verdict),
            "hops": hops,
            "reason": candidate.reason,
        })

    return {
        "ok": True,
        "source_resource_id": result.source_resource_id,
        "destination_resource_id": result.destination_resource_id,
        "overall_verdict": result.overall_verdict.value if hasattr(result.overall_verdict, "value") else str(result.overall_verdict),
        "path_candidates": path_candidates,
        "warnings": result.warnings,
    }


@router.get("")
def get_path_analysis(
    workspace_id: str,
    source_resource_id: str = Query(..., description="ARM resource ID of the source"),
    destination_resource_id: str = Query(..., description="ARM resource ID of the destination"),
    subscription_id: str | None = Query(default=None),
    resource_group_name: str | None = Query(default=None),
    resource_limit: int = Query(default=500, ge=1, le=2000),
    protocol: str | None = Query(default=None, description="Optional protocol filter for NSG evaluation, e.g. Tcp"),
    source_address_prefix: str | None = Query(default=None, description="Optional source address prefix/IP for NSG evaluation"),
    destination_address_prefix: str | None = Query(default=None, description="Optional destination address prefix/IP for NSG evaluation"),
    source_port: int | None = Query(default=None, ge=0, le=65535, description="Optional source port for NSG evaluation"),
    destination_port: int | None = Query(default=None, ge=0, le=65535, description="Optional destination port for NSG evaluation"),
) -> dict[str, Any]:
    settings = get_settings()
    resolution = resolve_inventory_collection(
        settings,
        subscription_id=subscription_id,
        resource_group_name=resource_group_name,
        resource_limit=resource_limit,
    )

    result = analyze_path(
        resolution.collection.resources,
        source_resource_id=source_resource_id,
        destination_resource_id=destination_resource_id,
        protocol=protocol,
        source_address_prefix=source_address_prefix,
        destination_address_prefix=destination_address_prefix,
        source_port=source_port,
        destination_port=destination_port,
    )

    return _path_analysis_to_dict(result)