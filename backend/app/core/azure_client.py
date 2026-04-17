from __future__ import annotations

from pathlib import Path

import requests
from azure.identity import CertificateCredential

from app.core.config import Settings


class AzureClientError(RuntimeError):
    pass


def build_credential(settings: Settings) -> CertificateCredential:
    if settings.azure_cloud != "public":
        raise AzureClientError(
            f"Unsupported Azure cloud for Sprint 0 live wiring: {settings.azure_cloud}"
        )

    certificate_path = Path(settings.azure_certificate_path).expanduser().resolve()
    if not certificate_path.exists():
        raise AzureClientError(f"Certificate file not found: {certificate_path}")

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


def get_paginated_items(url: str, token: str, *, max_pages: int = 20) -> list[dict]:
    items: list[dict] = []
    next_url: str | None = url
    page = 0

    while next_url and page < max_pages:
        payload = get_json(next_url, token)
        items.extend(payload.get("value", []))
        next_url = payload.get("nextLink")
        page += 1

    return items
