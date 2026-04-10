from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import requests
from azure.identity import CertificateCredential

from app.core.config import Settings


class AzureReadTestError(RuntimeError):
    pass


@dataclass
class AzureReadTestResult:
    ok: bool
    token_acquired: bool
    accessible_subscriptions: list[dict]
    sample_resource_groups: list[dict]
    message: str


def build_credential(settings: Settings) -> CertificateCredential:
    if settings.azure_cloud != "public":
        raise AzureReadTestError(
            f"Unsupported Azure cloud for Sprint 0 live wiring: {settings.azure_cloud}"
        )

    certificate_path = Path(settings.azure_certificate_path).expanduser().resolve()
    if not certificate_path.exists():
        raise AzureReadTestError(f"Certificate file not found: {certificate_path}")

    password = settings.azure_certificate_password or None

    return CertificateCredential(
        tenant_id=settings.azure_tenant_id,
        client_id=settings.azure_client_id,
        certificate_path=str(certificate_path),
        password=password,
    )


def get_management_token(settings: Settings) -> str:
    credential = build_credential(settings)
    token = credential.get_token("https://management.azure.com/.default")
    return token.token


def get_json(url: str, token: str) -> dict:
    response = requests.get(
        url,
        headers={"Authorization": f"Bearer {token}"},
        timeout=20,
    )
    response.raise_for_status()
    return response.json()


def run_azure_read_test(settings: Settings) -> AzureReadTestResult:
    if not settings.auth_runtime_ready:
        raise AzureReadTestError("Missing required Azure settings or certificate path is invalid")

    token = get_management_token(settings)

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
