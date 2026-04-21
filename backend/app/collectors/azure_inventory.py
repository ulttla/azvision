from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, TypeVar

import requests

from app.core.azure_client import AzureClientError, get_management_token, get_paginated_items, get_json
from app.core.config import Settings


class AzureInventoryError(AzureClientError):
    pass


@dataclass
class AzureInventoryCollection:
    subscriptions: list[dict]
    resource_groups: list[dict]
    resources: list[dict]


@dataclass
class InventoryResolution:
    collection: AzureInventoryCollection
    mode: str
    warning: str | None = None


@dataclass
class InventoryItemsResolution:
    items: list[dict]
    mode: str
    warning: str | None = None


T = TypeVar("T")


def _truncate(items: list[dict], limit: int) -> list[dict]:
    return items[: max(limit, 0)]


def _mock_resource_id(subscription_id: str, resource_group_name: str, provider_path: str) -> str:
    return f"/subscriptions/{subscription_id}/resourceGroups/{resource_group_name}/providers/{provider_path}"


def _inventory_error_message(exc: AzureInventoryError | AzureClientError | requests.HTTPError) -> str:
    if isinstance(exc, requests.HTTPError):
        response = exc.response
        return response.text[:500] if response is not None else str(exc)
    return str(exc)


def _run_live_inventory(operation: Callable[[], T]) -> T:
    try:
        return operation()
    except AzureInventoryError:
        raise
    except (AzureClientError, requests.HTTPError) as exc:
        raise AzureInventoryError(_inventory_error_message(exc)) from exc


def _mock_inventory_collection(
    *,
    subscription_id: str | None = None,
    resource_group_name: str | None = None,
    resource_group_limit: int = 200,
    resource_limit: int = 200,
) -> AzureInventoryCollection:
    mock_subscription_id = "00000000-0000-0000-0000-000000000001"

    subscriptions = [
        {
            "subscription_id": mock_subscription_id,
            "display_name": "AzVision Mock Subscription",
            "state": "Enabled",
            "tenant_id": "mock-tenant",
            "source": "mock",
        }
    ]

    resource_groups = [
        {
            "subscription_id": mock_subscription_id,
            "name": "rg-data-platform",
            "location": "canadacentral",
            "id": f"/subscriptions/{mock_subscription_id}/resourceGroups/rg-data-platform",
            "managed_by": None,
            "tags": {"environment": "mock", "domain": "data"},
            "source": "mock",
        },
        {
            "subscription_id": mock_subscription_id,
            "name": "rg-web-platform",
            "location": "canadacentral",
            "id": f"/subscriptions/{mock_subscription_id}/resourceGroups/rg-web-platform",
            "managed_by": None,
            "tags": {"environment": "mock", "domain": "web"},
            "source": "mock",
        },
    ]

    resources = [
        {
            "subscription_id": mock_subscription_id,
            "resource_group": "rg-data-platform",
            "name": "vnet-mi-platform-ops",
            "type": "Microsoft.Network/virtualNetworks",
            "kind": None,
            "location": "canadacentral",
            "id": _mock_resource_id(
                mock_subscription_id,
                "rg-data-platform",
                "Microsoft.Network/virtualNetworks/vnet-mi-platform-ops",
            ),
            "tags": {"environment": "mock"},
            "source": "mock",
        },
        {
            "subscription_id": mock_subscription_id,
            "resource_group": "rg-data-platform",
            "name": "nsg-mi-platform-ops",
            "type": "Microsoft.Network/networkSecurityGroups",
            "kind": None,
            "location": "canadacentral",
            "id": _mock_resource_id(
                mock_subscription_id,
                "rg-data-platform",
                "Microsoft.Network/networkSecurityGroups/nsg-mi-platform-ops",
            ),
            "tags": {"environment": "mock"},
            "source": "mock",
        },
        {
            "subscription_id": mock_subscription_id,
            "resource_group": "rg-data-platform",
            "name": "mi-platform-ops",
            "type": "Microsoft.Sql/managedInstances",
            "kind": None,
            "location": "canadacentral",
            "id": _mock_resource_id(
                mock_subscription_id,
                "rg-data-platform",
                "Microsoft.Sql/managedInstances/mi-platform-ops",
            ),
            "tags": {"environment": "mock", "role": "operations"},
            "source": "mock",
        },
        {
            "subscription_id": mock_subscription_id,
            "resource_group": "rg-data-platform",
            "name": "mi-platform-ops/appdb",
            "type": "Microsoft.Sql/managedInstances/databases",
            "kind": None,
            "location": "canadacentral",
            "id": _mock_resource_id(
                mock_subscription_id,
                "rg-data-platform",
                "Microsoft.Sql/managedInstances/mi-platform-ops/databases/appdb",
            ),
            "tags": {"environment": "mock"},
            "source": "mock",
        },
        {
            "subscription_id": mock_subscription_id,
            "resource_group": "rg-data-platform",
            "name": "mi-platform-ops/auditdb",
            "type": "Microsoft.Sql/managedInstances/databases",
            "kind": None,
            "location": "canadacentral",
            "id": _mock_resource_id(
                mock_subscription_id,
                "rg-data-platform",
                "Microsoft.Sql/managedInstances/mi-platform-ops/databases/auditdb",
            ),
            "tags": {"environment": "mock"},
            "source": "mock",
        },
        {
            "subscription_id": mock_subscription_id,
            "resource_group": "rg-data-platform",
            "name": "mi-analytics",
            "type": "Microsoft.Sql/managedInstances",
            "kind": None,
            "location": "canadacentral",
            "id": _mock_resource_id(
                mock_subscription_id,
                "rg-data-platform",
                "Microsoft.Sql/managedInstances/mi-analytics",
            ),
            "tags": {"environment": "mock", "role": "analytics"},
            "source": "mock",
        },
        {
            "subscription_id": mock_subscription_id,
            "resource_group": "rg-data-platform",
            "name": "mi-analytics/warehouse",
            "type": "Microsoft.Sql/managedInstances/databases",
            "kind": None,
            "location": "canadacentral",
            "id": _mock_resource_id(
                mock_subscription_id,
                "rg-data-platform",
                "Microsoft.Sql/managedInstances/mi-analytics/databases/warehouse",
            ),
            "tags": {"environment": "mock"},
            "source": "mock",
        },
        {
            "subscription_id": mock_subscription_id,
            "resource_group": "rg-web-platform",
            "name": "vnet-web-portal",
            "type": "Microsoft.Network/virtualNetworks",
            "kind": None,
            "location": "canadacentral",
            "id": _mock_resource_id(
                mock_subscription_id,
                "rg-web-platform",
                "Microsoft.Network/virtualNetworks/vnet-web-portal",
            ),
            "tags": {"environment": "mock", "tier": "network"},
            "source": "mock",
        },
        {
            "subscription_id": mock_subscription_id,
            "resource_group": "rg-web-platform",
            "name": "nsg-web-portal",
            "type": "Microsoft.Network/networkSecurityGroups",
            "kind": None,
            "location": "canadacentral",
            "id": _mock_resource_id(
                mock_subscription_id,
                "rg-web-platform",
                "Microsoft.Network/networkSecurityGroups/nsg-web-portal",
            ),
            "tags": {"environment": "mock", "tier": "network"},
            "source": "mock",
        },
        {
            "subscription_id": mock_subscription_id,
            "resource_group": "rg-web-platform",
            "name": "rt-web-portal",
            "type": "Microsoft.Network/routeTables",
            "kind": None,
            "location": "canadacentral",
            "id": _mock_resource_id(
                mock_subscription_id,
                "rg-web-platform",
                "Microsoft.Network/routeTables/rt-web-portal",
            ),
            "tags": {"environment": "mock", "tier": "network"},
            "source": "mock",
        },
        {
            "subscription_id": mock_subscription_id,
            "resource_group": "rg-web-platform",
            "name": "web-portal",
            "type": "Microsoft.Web/sites",
            "kind": "app",
            "location": "canadacentral",
            "id": _mock_resource_id(
                mock_subscription_id,
                "rg-web-platform",
                "Microsoft.Web/sites/web-portal",
            ),
            "tags": {"environment": "mock", "tier": "frontend"},
            "source": "mock",
        },
        {
            "subscription_id": mock_subscription_id,
            "resource_group": "rg-web-platform",
            "name": "pep-stazvisiondiag",
            "type": "Microsoft.Network/privateEndpoints",
            "kind": None,
            "location": "canadacentral",
            "id": _mock_resource_id(
                mock_subscription_id,
                "rg-web-platform",
                "Microsoft.Network/privateEndpoints/pep-stazvisiondiag",
            ),
            "tags": {"environment": "mock", "tier": "network"},
            "source": "mock",
        },
        {
            "subscription_id": mock_subscription_id,
            "resource_group": "rg-web-platform",
            "name": "stazvisiondiag",
            "type": "Microsoft.Storage/storageAccounts",
            "kind": "StorageV2",
            "location": "canadacentral",
            "id": _mock_resource_id(
                mock_subscription_id,
                "rg-web-platform",
                "Microsoft.Storage/storageAccounts/stazvisiondiag",
            ),
            "tags": {"environment": "mock", "tier": "diagnostics"},
            "source": "mock",
        },
    ]

    filtered_subscriptions = [
        item for item in subscriptions if not subscription_id or item.get("subscription_id") == subscription_id
    ]
    filtered_resource_groups = [
        item
        for item in resource_groups
        if (not subscription_id or item.get("subscription_id") == subscription_id)
        and (not resource_group_name or item.get("name") == resource_group_name)
    ]
    filtered_resources = [
        item
        for item in resources
        if (not subscription_id or item.get("subscription_id") == subscription_id)
        and (not resource_group_name or item.get("resource_group") == resource_group_name)
    ]

    return AzureInventoryCollection(
        subscriptions=filtered_subscriptions,
        resource_groups=_truncate(filtered_resource_groups, resource_group_limit),
        resources=_truncate(filtered_resources, resource_limit),
    )


def list_accessible_subscriptions(settings: Settings) -> list[dict]:
    if not settings.auth_runtime_ready:
        raise AzureInventoryError("Azure auth is not ready")

    token = get_management_token(settings)
    payload = get_json(
        "https://management.azure.com/subscriptions?api-version=2020-01-01",
        token,
    )

    return [
        {
            "subscription_id": item.get("subscriptionId"),
            "display_name": item.get("displayName"),
            "state": item.get("state"),
            "tenant_id": item.get("tenantId"),
            "source": "azure",
        }
        for item in payload.get("value", [])
    ]


def list_resource_groups(
    settings: Settings,
    *,
    subscription_id: str | None = None,
    limit: int = 200,
) -> list[dict]:
    subscriptions = list_accessible_subscriptions(settings)
    token = get_management_token(settings)

    target_subscription_ids = [
        subscription_id
    ] if subscription_id else [item["subscription_id"] for item in subscriptions if item.get("subscription_id")]

    items: list[dict] = []
    for current_subscription_id in target_subscription_ids:
        payload_items = get_paginated_items(
            "https://management.azure.com/"
            f"subscriptions/{current_subscription_id}/resourcegroups"
            "?api-version=2021-04-01",
            token,
            max_pages=10,
        )
        for item in payload_items:
            items.append(
                {
                    "subscription_id": current_subscription_id,
                    "name": item.get("name"),
                    "location": item.get("location"),
                    "id": item.get("id"),
                    "managed_by": item.get("managedBy"),
                    "tags": item.get("tags") or {},
                    "source": "azure",
                }
            )
            if len(items) >= limit:
                return _truncate(items, limit)

    return _truncate(items, limit)


def _extract_resource_group(resource_id: str | None) -> str | None:
    if not resource_id:
        return None

    parts = resource_id.split("/")
    try:
        resource_groups_index = parts.index("resourceGroups")
        return parts[resource_groups_index + 1]
    except (ValueError, IndexError):
        return None


def list_resources(
    settings: Settings,
    *,
    subscription_id: str | None = None,
    resource_group_name: str | None = None,
    limit: int = 200,
) -> list[dict]:
    subscriptions = list_accessible_subscriptions(settings)
    token = get_management_token(settings)

    target_subscription_ids = [
        subscription_id
    ] if subscription_id else [item["subscription_id"] for item in subscriptions if item.get("subscription_id")]

    items: list[dict] = []
    for current_subscription_id in target_subscription_ids:
        if resource_group_name:
            request_url = (
                "https://management.azure.com/"
                f"subscriptions/{current_subscription_id}/resourceGroups/{resource_group_name}/resources"
                "?api-version=2021-04-01"
            )
        else:
            request_url = (
                "https://management.azure.com/"
                f"subscriptions/{current_subscription_id}/resources"
                "?api-version=2021-04-01"
            )

        payload_items = get_paginated_items(
            request_url,
            token,
            max_pages=20,
        )
        for item in payload_items:
            items.append(
                {
                    "subscription_id": current_subscription_id,
                    "resource_group": item.get("resourceGroup") or _extract_resource_group(item.get("id")),
                    "name": item.get("name"),
                    "type": item.get("type"),
                    "kind": item.get("kind"),
                    "location": item.get("location"),
                    "id": item.get("id"),
                    "tags": item.get("tags") or {},
                    "source": "azure",
                }
            )
            if len(items) >= limit:
                return _truncate(items, limit)

    return _truncate(items, limit)


def collect_inventory(
    settings: Settings,
    *,
    subscription_id: str | None = None,
    resource_group_name: str | None = None,
    resource_group_limit: int = 200,
    resource_limit: int = 200,
) -> AzureInventoryCollection:
    collection = _run_live_inventory(
        lambda: AzureInventoryCollection(
            subscriptions=list_accessible_subscriptions(settings),
            resource_groups=list_resource_groups(
                settings,
                subscription_id=subscription_id,
                limit=resource_group_limit,
            ),
            resources=list_resources(
                settings,
                subscription_id=subscription_id,
                resource_group_name=resource_group_name,
                limit=resource_limit,
            ),
        )
    )

    if resource_group_name:
        collection.resource_groups = [
            item for item in collection.resource_groups if item.get("name") == resource_group_name
        ]

    return collection


def resolve_inventory_collection(
    settings: Settings,
    *,
    subscription_id: str | None = None,
    resource_group_name: str | None = None,
    resource_group_limit: int = 200,
    resource_limit: int = 200,
) -> InventoryResolution:
    mode = settings.topology_mode_resolved

    if mode == "mock":
        return InventoryResolution(
            collection=_mock_inventory_collection(
                subscription_id=subscription_id,
                resource_group_name=resource_group_name,
                resource_group_limit=resource_group_limit,
                resource_limit=resource_limit,
            ),
            mode="mock",
        )

    try:
        return InventoryResolution(
            collection=collect_inventory(
                settings,
                subscription_id=subscription_id,
                resource_group_name=resource_group_name,
                resource_group_limit=resource_group_limit,
                resource_limit=resource_limit,
            ),
            mode="live",
        )
    except AzureInventoryError as exc:
        if mode != "auto":
            raise

        return InventoryResolution(
            collection=_mock_inventory_collection(
                subscription_id=subscription_id,
                resource_group_name=resource_group_name,
                resource_group_limit=resource_group_limit,
                resource_limit=resource_limit,
            ),
            mode="mock",
            warning=str(exc),
        )


def resolve_subscription_items(settings: Settings) -> InventoryItemsResolution:
    mode = settings.topology_mode_resolved

    if mode == "mock":
        return InventoryItemsResolution(
            items=_mock_inventory_collection().subscriptions,
            mode="mock",
        )

    try:
        return InventoryItemsResolution(
            items=_run_live_inventory(lambda: list_accessible_subscriptions(settings)),
            mode="live",
        )
    except AzureInventoryError as exc:
        if mode != "auto":
            raise

        return InventoryItemsResolution(
            items=_mock_inventory_collection().subscriptions,
            mode="mock",
            warning=str(exc),
        )


def resolve_resource_group_items(
    settings: Settings,
    *,
    subscription_id: str | None = None,
    limit: int = 200,
) -> InventoryItemsResolution:
    mode = settings.topology_mode_resolved

    if mode == "mock":
        return InventoryItemsResolution(
            items=_mock_inventory_collection(
                subscription_id=subscription_id,
                resource_group_limit=limit,
            ).resource_groups,
            mode="mock",
        )

    try:
        return InventoryItemsResolution(
            items=_run_live_inventory(
                lambda: list_resource_groups(
                    settings,
                    subscription_id=subscription_id,
                    limit=limit,
                )
            ),
            mode="live",
        )
    except AzureInventoryError as exc:
        if mode != "auto":
            raise

        return InventoryItemsResolution(
            items=_mock_inventory_collection(
                subscription_id=subscription_id,
                resource_group_limit=limit,
            ).resource_groups,
            mode="mock",
            warning=str(exc),
        )


def resolve_resource_items(
    settings: Settings,
    *,
    subscription_id: str | None = None,
    resource_group_name: str | None = None,
    limit: int = 200,
) -> InventoryItemsResolution:
    mode = settings.topology_mode_resolved

    if mode == "mock":
        return InventoryItemsResolution(
            items=_mock_inventory_collection(
                subscription_id=subscription_id,
                resource_group_name=resource_group_name,
                resource_limit=limit,
            ).resources,
            mode="mock",
        )

    try:
        return InventoryItemsResolution(
            items=_run_live_inventory(
                lambda: list_resources(
                    settings,
                    subscription_id=subscription_id,
                    resource_group_name=resource_group_name,
                    limit=limit,
                )
            ),
            mode="live",
        )
    except AzureInventoryError as exc:
        if mode != "auto":
            raise

        return InventoryItemsResolution(
            items=_mock_inventory_collection(
                subscription_id=subscription_id,
                resource_group_name=resource_group_name,
                resource_limit=limit,
            ).resources,
            mode="mock",
            warning=str(exc),
        )
