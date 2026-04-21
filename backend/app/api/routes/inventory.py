from fastapi import APIRouter, Query

from app.collectors.azure_inventory import (
    resolve_inventory_collection,
    resolve_resource_group_items,
    resolve_resource_items,
    resolve_subscription_items,
)
from app.core.config import get_settings

router = APIRouter(prefix="/workspaces/{workspace_id}", tags=["inventory"])


@router.get("/subscriptions")
def get_subscriptions(workspace_id: str) -> dict:
    settings = get_settings()
    resolution = resolve_subscription_items(settings)
    return {
        "ok": True,
        "workspace_id": workspace_id,
        "mode": resolution.mode,
        "warning": resolution.warning,
        "items": resolution.items,
    }


@router.get("/resource-groups")
def get_resource_groups(
    workspace_id: str,
    subscription_id: str | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
) -> dict:
    settings = get_settings()
    resolution = resolve_resource_group_items(
        settings,
        subscription_id=subscription_id,
        limit=limit,
    )
    return {
        "ok": True,
        "workspace_id": workspace_id,
        "subscription_id": subscription_id,
        "mode": resolution.mode,
        "warning": resolution.warning,
        "items": resolution.items,
    }


@router.get("/resources")
def get_resources(
    workspace_id: str,
    subscription_id: str | None = Query(default=None),
    resource_group_name: str | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
) -> dict:
    settings = get_settings()
    resolution = resolve_resource_items(
        settings,
        subscription_id=subscription_id,
        resource_group_name=resource_group_name,
        limit=limit,
    )
    return {
        "ok": True,
        "workspace_id": workspace_id,
        "subscription_id": subscription_id,
        "resource_group_name": resource_group_name,
        "mode": resolution.mode,
        "warning": resolution.warning,
        "items": resolution.items,
    }


@router.get("/inventory-summary")
def get_inventory_summary(
    workspace_id: str,
    subscription_id: str | None = Query(default=None),
    resource_group_name: str | None = Query(default=None),
    resource_group_limit: int = Query(default=200, ge=1, le=500),
    resource_limit: int = Query(default=200, ge=1, le=500),
) -> dict:
    settings = get_settings()
    resolution = resolve_inventory_collection(
        settings,
        subscription_id=subscription_id,
        resource_group_name=resource_group_name,
        resource_group_limit=resource_group_limit,
        resource_limit=resource_limit,
    )
    collection = resolution.collection
    return {
        "ok": True,
        "workspace_id": workspace_id,
        "subscription_id": subscription_id,
        "resource_group_name": resource_group_name,
        "mode": resolution.mode,
        "warning": resolution.warning,
        "summary": {
            "subscription_count": len(collection.subscriptions),
            "resource_group_count": len(collection.resource_groups),
            "resource_count": len(collection.resources),
        },
        "items": {
            "subscriptions": collection.subscriptions,
            "resource_groups": collection.resource_groups,
            "resources": collection.resources,
        },
    }
