from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Query

from app.collectors.azure_inventory import collect_inventory
from app.core.config import get_settings

router = APIRouter(prefix="/workspaces/{workspace_id}/scans", tags=["scans"])


def _scan_stub(workspace_id: str, scan_id: str = "scan_bootstrap") -> dict[str, Any]:
    return {
        "id": scan_id,
        "workspace_id": workspace_id,
        "status": "not-started",
        "scope": "subscriptions,resource-groups,resources,network-relationships",
        "started_at": None,
        "finished_at": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


@router.post("")
def start_scan(
    workspace_id: str,
    subscription_id: str | None = Query(default=None),
    resource_group_limit: int = Query(default=200, ge=1, le=500),
    resource_limit: int = Query(default=200, ge=1, le=500),
) -> dict[str, Any]:
    settings = get_settings()
    scan_id = f"scan_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
    started_at = datetime.now(timezone.utc)

    # AzureInventoryError (subclass of AzureClientError) propagates to global 502 handler.
    collection = collect_inventory(
        settings,
        subscription_id=subscription_id,
        resource_group_limit=resource_group_limit,
        resource_limit=resource_limit,
    )
    finished_at = datetime.now(timezone.utc)
    return {
        "ok": True,
        "id": scan_id,
        "workspace_id": workspace_id,
        "status": "completed",
        "scope": "subscriptions,resource-groups,resources,network-relationships",
        "started_at": started_at.isoformat(),
        "finished_at": finished_at.isoformat(),
        "created_at": started_at.isoformat(),
        "summary": {
            "subscription_count": len(collection.subscriptions),
            "resource_group_count": len(collection.resource_groups),
            "resource_count": len(collection.resources),
        },
        "subscription_id": subscription_id,
        "mode": "live-inventory-collector",
    }


@router.get("")
def list_scans(workspace_id: str) -> dict[str, list[dict[str, Any]]]:
    return {"items": [_scan_stub(workspace_id)]}


@router.get("/{scan_id}")
def get_scan(workspace_id: str, scan_id: str) -> dict[str, Any]:
    return _scan_stub(workspace_id, scan_id=scan_id)
