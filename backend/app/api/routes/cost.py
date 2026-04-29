from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query

from app.collectors.azure_inventory import resolve_inventory_collection
from app.core.config import get_settings
from app.services.cost_analysis import (
    build_cost_recommendations,
    build_cost_report_markdown,
    build_cost_resource_rows,
    build_cost_summary,
)
from app.services.cost_ingestion import get_default_cost_ingestion_provider

router = APIRouter(prefix="/workspaces/{workspace_id}/cost", tags=["cost"])


def _inventory_resources(
    *,
    subscription_id: str | None,
    resource_group_name: str | None,
    resource_group_limit: int,
    resource_limit: int,
):
    resolution = resolve_inventory_collection(
        get_settings(),
        subscription_id=subscription_id,
        resource_group_name=resource_group_name,
        resource_group_limit=resource_group_limit,
        resource_limit=resource_limit,
    )
    return resolution.collection.resources, resolution


def _cost_payload_base(workspace_id: str, resolution) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "ok": True,
        "workspace_id": workspace_id,
        "mode": resolution.mode,
    }
    if resolution.warning:
        payload["warning"] = resolution.warning
    return payload


@router.get("/summary")
def get_cost_summary(
    workspace_id: str,
    subscription_id: str | None = Query(default=None),
    resource_group_name: str | None = Query(default=None),
    resource_group_limit: int = Query(default=200, ge=1, le=1000),
    resource_limit: int = Query(default=500, ge=1, le=5000),
) -> dict[str, Any]:
    resources, resolution = _inventory_resources(
        subscription_id=subscription_id,
        resource_group_name=resource_group_name,
        resource_group_limit=resource_group_limit,
        resource_limit=resource_limit,
    )
    recommendations = build_cost_recommendations(resources)
    cost_snapshot = get_default_cost_ingestion_provider().get_cost_snapshot(resources)
    return {
        **_cost_payload_base(workspace_id, resolution),
        "summary": build_cost_summary(resources, recommendations, cost_snapshot),
    }


@router.get("/resources")
def get_cost_resources(
    workspace_id: str,
    subscription_id: str | None = Query(default=None),
    resource_group_name: str | None = Query(default=None),
    resource_group_limit: int = Query(default=200, ge=1, le=1000),
    resource_limit: int = Query(default=500, ge=1, le=5000),
) -> dict[str, Any]:
    resources, resolution = _inventory_resources(
        subscription_id=subscription_id,
        resource_group_name=resource_group_name,
        resource_group_limit=resource_group_limit,
        resource_limit=resource_limit,
    )
    recommendations = build_cost_recommendations(resources)
    return {
        **_cost_payload_base(workspace_id, resolution),
        "items": build_cost_resource_rows(resources, recommendations),
    }


@router.get("/report")
def get_cost_report(
    workspace_id: str,
    subscription_id: str | None = Query(default=None),
    resource_group_name: str | None = Query(default=None),
    resource_group_limit: int = Query(default=200, ge=1, le=1000),
    resource_limit: int = Query(default=500, ge=1, le=5000),
) -> dict[str, Any]:
    resources, resolution = _inventory_resources(
        subscription_id=subscription_id,
        resource_group_name=resource_group_name,
        resource_group_limit=resource_group_limit,
        resource_limit=resource_limit,
    )
    recommendations = build_cost_recommendations(resources)
    cost_snapshot = get_default_cost_ingestion_provider().get_cost_snapshot(resources)
    summary = build_cost_summary(resources, recommendations, cost_snapshot)
    return {
        **_cost_payload_base(workspace_id, resolution),
        "report_type": "markdown",
        "title": f"AzVision Cost Summary — {workspace_id}",
        "content": build_cost_report_markdown(workspace_id, summary, recommendations, resources),
        "warnings": [
            "Rule-based report only; Azure Cost Management dollar ingestion is not configured yet."
        ],
    }


@router.post("/recommendations")
def post_cost_recommendations(
    workspace_id: str,
    subscription_id: str | None = Query(default=None),
    resource_group_name: str | None = Query(default=None),
    resource_group_limit: int = Query(default=200, ge=1, le=1000),
    resource_limit: int = Query(default=500, ge=1, le=5000),
) -> dict[str, Any]:
    resources, resolution = _inventory_resources(
        subscription_id=subscription_id,
        resource_group_name=resource_group_name,
        resource_group_limit=resource_group_limit,
        resource_limit=resource_limit,
    )
    recommendations = build_cost_recommendations(resources)
    return {
        **_cost_payload_base(workspace_id, resolution),
        "items": recommendations,
    }
