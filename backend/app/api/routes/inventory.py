import requests
from fastapi import APIRouter, Query

from app.collectors.azure_inventory import AzureInventoryError, resolve_inventory_collection
from app.core.config import get_settings

router = APIRouter(prefix="/workspaces/{workspace_id}", tags=["inventory"])


@router.get("/subscriptions")
def get_subscriptions(workspace_id: str) -> dict:
    settings = get_settings()
    try:
        resolution = resolve_inventory_collection(settings, resource_group_limit=1, resource_limit=1)
        return {
            "workspace_id": workspace_id,
            "mode": resolution.mode,
            "items": resolution.collection.subscriptions,
        }
    except (AzureInventoryError, requests.HTTPError) as exc:
        return {
            "workspace_id": workspace_id,
            "items": [],
            "status": "error",
            "message": str(exc),
        }


@router.get("/resource-groups")
def get_resource_groups(
    workspace_id: str,
    subscription_id: str | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
) -> dict:
    settings = get_settings()
    try:
        resolution = resolve_inventory_collection(
            settings,
            subscription_id=subscription_id,
            resource_group_limit=limit,
            resource_limit=1,
        )
        return {
            "workspace_id": workspace_id,
            "subscription_id": subscription_id,
            "mode": resolution.mode,
            "items": resolution.collection.resource_groups,
        }
    except (AzureInventoryError, requests.HTTPError) as exc:
        return {
            "workspace_id": workspace_id,
            "subscription_id": subscription_id,
            "items": [],
            "status": "error",
            "message": str(exc),
        }


@router.get("/resources")
def get_resources(
    workspace_id: str,
    subscription_id: str | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
) -> dict:
    settings = get_settings()
    try:
        resolution = resolve_inventory_collection(
            settings,
            subscription_id=subscription_id,
            resource_group_limit=1,
            resource_limit=limit,
        )
        return {
            "workspace_id": workspace_id,
            "subscription_id": subscription_id,
            "mode": resolution.mode,
            "items": resolution.collection.resources,
        }
    except (AzureInventoryError, requests.HTTPError) as exc:
        return {
            "workspace_id": workspace_id,
            "subscription_id": subscription_id,
            "items": [],
            "status": "error",
            "message": str(exc),
        }


@router.get("/inventory-summary")
def get_inventory_summary(
    workspace_id: str,
    subscription_id: str | None = Query(default=None),
    resource_group_limit: int = Query(default=200, ge=1, le=500),
    resource_limit: int = Query(default=200, ge=1, le=500),
) -> dict:
    settings = get_settings()
    try:
        resolution = resolve_inventory_collection(
            settings,
            subscription_id=subscription_id,
            resource_group_limit=resource_group_limit,
            resource_limit=resource_limit,
        )
        collection = resolution.collection
        return {
            "workspace_id": workspace_id,
            "subscription_id": subscription_id,
            "mode": resolution.mode,
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
    except (AzureInventoryError, requests.HTTPError) as exc:
        return {
            "workspace_id": workspace_id,
            "subscription_id": subscription_id,
            "summary": {
                "subscription_count": 0,
                "resource_group_count": 0,
                "resource_count": 0,
            },
            "items": {
                "subscriptions": [],
                "resource_groups": [],
                "resources": [],
            },
            "status": "error",
            "message": str(exc),
        }
