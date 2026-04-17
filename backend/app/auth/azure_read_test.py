from __future__ import annotations

from dataclasses import dataclass

from app.core.azure_client import AzureClientError, get_json, get_management_token
from app.core.config import Settings


class AzureReadTestError(AzureClientError):
    pass


@dataclass
class AzureReadTestResult:
    ok: bool
    token_acquired: bool
    accessible_subscriptions: list[dict]
    sample_resource_groups: list[dict]
    message: str


def run_azure_read_test(settings: Settings) -> AzureReadTestResult:
    if not settings.auth_runtime_ready:
        raise AzureReadTestError("Missing required Azure settings or certificate path is invalid")

    try:
        token = get_management_token(settings)
    except AzureClientError as exc:
        raise AzureReadTestError(str(exc)) from exc

    subscriptions_payload = get_json(
        "https://management.azure.com/subscriptions?api-version=2020-01-01",
        token,
    )
    subscription_items = subscriptions_payload.get("value", [])
    accessible_subscriptions = [
        {
            "subscription_id": item.get("subscriptionId"),
            "display_name": item.get("displayName"),
            "state": item.get("state"),
            "tenant_id": item.get("tenantId"),
        }
        for item in subscription_items
    ]

    sample_resource_groups: list[dict] = []
    if accessible_subscriptions:
        first_subscription_id = accessible_subscriptions[0].get("subscription_id")
        if first_subscription_id:
            rg_payload = get_json(
                "https://management.azure.com/"
                f"subscriptions/{first_subscription_id}/resourcegroups"
                "?api-version=2021-04-01",
                token,
            )
            sample_resource_groups = [
                {
                    "subscription_id": first_subscription_id,
                    "name": item.get("name"),
                    "location": item.get("location"),
                }
                for item in rg_payload.get("value", [])[:10]
            ]

    return AzureReadTestResult(
        ok=True,
        token_acquired=True,
        accessible_subscriptions=accessible_subscriptions,
        sample_resource_groups=sample_resource_groups,
        message="Azure live read test completed",
    )
