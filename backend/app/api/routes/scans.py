import hashlib
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Query, Request

from app.api.workspace_security import (
    WorkspaceAccessContext,
    get_workspace_access_context,
    record_audit_event,
    require_workspace_access,
)
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


def _stable_hash(value: str | None) -> str | None:
    if not value:
        return None
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:16]


@router.post("")
def start_scan(
    workspace_id: str,
    request: Request,
    subscription_id: str | None = Query(default=None),
    resource_group_limit: int = Query(default=200, ge=1, le=500),
    resource_limit: int = Query(default=200, ge=1, le=500),
    context: WorkspaceAccessContext = Depends(get_workspace_access_context),
) -> dict[str, Any]:
    membership = require_workspace_access(context, workspace_id, action="manage")
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
    record_audit_event(
        event_type="scan.started",
        outcome="success",
        workspace_id=workspace_id,
        account_id=membership.account_id,
        request_id=request.headers.get("x-request-id"),
        metadata={
            "scan_id": scan_id,
            "subscription_hash": _stable_hash(subscription_id),
            "resource_group_limit": resource_group_limit,
            "resource_limit": resource_limit,
            "resource_count": len(collection.resources),
        },
    )
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
def list_scans(
    workspace_id: str,
    context: WorkspaceAccessContext = Depends(get_workspace_access_context),
) -> dict[str, list[dict[str, Any]]]:
    require_workspace_access(context, workspace_id, action="read")
    return {"items": [_scan_stub(workspace_id)]}


@router.get("/{scan_id}")
def get_scan(
    workspace_id: str,
    scan_id: str,
    context: WorkspaceAccessContext = Depends(get_workspace_access_context),
) -> dict[str, Any]:
    require_workspace_access(context, workspace_id, action="read")
    return _scan_stub(workspace_id, scan_id=scan_id)
