import requests
from fastapi import APIRouter, Query

from app.collectors.azure_inventory import (
    AzureInventoryError,
    collect_inventory,
    list_accessible_subscriptions,
    list_resource_groups,
    list_resources,
)
from app.core.config import get_settings

router = APIRouter(prefix="/workspaces/{workspace_id}", tags=["inventory"])


@router.get("/subscriptions")
def get_subscriptions(workspace_id: str) -> dict:
    settings = get_settings()
    try:
        return {
            "workspace_id": workspace_id,
            "items": list_accessible_subscriptions(settings),
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
        items = list_resource_groups(
            settings,
            subscription_id=subscription_id,
            limit=limit,
        )
        return {
            "workspace_id": workspace_id,
            "subscription_id": subscription_id,
            "items": items,
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
        items = list_resources(
            settings,
            subscription_id=subscription_id,
            limit=limit,
        )
        return {
            "workspace_id": workspace_id,
            "subscription_id": subscription_id,
            "items": items,
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
        collection = collect_inventory(
            settings,
            subscription_id=subscription_id,
            resource_group_limit=resource_group_limit,
            resource_limit=resource_limit,
        )
        return {
            "workspace_id": workspace_id,
            "subscription_id": subscription_id,
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
