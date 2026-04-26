from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query

from app.collectors.azure_inventory import resolve_inventory_collection
from app.core.config import get_settings
from app.services.copilot import build_rule_based_copilot_answer

router = APIRouter(prefix="/workspaces/{workspace_id}/chat", tags=["copilot"])


@router.post("")
def post_copilot_message(
    workspace_id: str,
    payload: dict[str, Any],
    subscription_id: str | None = Query(default=None),
    resource_group_name: str | None = Query(default=None),
    resource_group_limit: int = Query(default=200, ge=1, le=1000),
    resource_limit: int = Query(default=500, ge=1, le=5000),
) -> dict[str, Any]:
    message = str(payload.get("message") or "")
    resolution = resolve_inventory_collection(
        get_settings(),
        subscription_id=subscription_id,
        resource_group_name=resource_group_name,
        resource_group_limit=resource_group_limit,
        resource_limit=resource_limit,
    )
    answer = build_rule_based_copilot_answer(message, resolution.collection.resources)
    response: dict[str, Any] = {
        "ok": True,
        "workspace_id": workspace_id,
        "mode": resolution.mode,
        **answer,
    }
    if resolution.warning:
        response["warning"] = resolution.warning
    return response
