from __future__ import annotations

from dataclasses import dataclass

import requests

from app.auth.azure_read_test import AzureReadTestError, get_json, get_management_token
from app.core.config import Settings


class AzureInventoryError(RuntimeError):
    pass


@dataclass
class AzureInventoryCollection:
    subscriptions: list[dict]
    resource_groups: list[dict]
    resources: list[dict]


def _truncate(items: list[dict], limit: int) -> list[dict]:
    return items[: max(limit, 0)]


def _get_paginated_items(url: str, token: str, *, max_pages: int = 20) -> list[dict]:
    items: list[dict] = []
    next_url: str | None = url
    page = 0

    while next_url and page < max_pages:
        payload = get_json(next_url, token)
        items.extend(payload.get("value", []))
        next_url = payload.get("nextLink")
        page += 1

    return items


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
        payload_items = _get_paginated_items(
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

        payload_items = _get_paginated_items(
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
    try:
        subscriptions = list_accessible_subscriptions(settings)
        resource_groups = list_resource_groups(
            settings,
            subscription_id=subscription_id,
            limit=resource_group_limit,
        )
        resources = list_resources(
            settings,
            subscription_id=subscription_id,
            resource_group_name=resource_group_name,
            limit=resource_limit,
        )
    except AzureReadTestError as exc:
        raise AzureInventoryError(str(exc)) from exc
    except requests.HTTPError as exc:
        response = exc.response
        detail = response.text[:500] if response is not None else str(exc)
        raise AzureInventoryError(detail) from exc

    return AzureInventoryCollection(
        subscriptions=subscriptions,
        resource_groups=resource_groups,
        resources=resources,
    )
