from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query, Request

from app.api.workspace_security import (
    WorkspaceAccessContext,
    get_workspace_access_context,
    record_audit_event,
    require_workspace_access,
)
from app.collectors.azure_inventory import resolve_inventory_collection
from app.core.config import get_settings
from app.services.copilot import (
    build_copilot_context,
    get_configured_copilot_provider,
    list_copilot_providers,
    probe_provider_health,
)

router = APIRouter(tags=["copilot"])


def _resolve_resources(
    *,
    subscription_id: str | None,
    resource_group_name: str | None,
    resource_group_limit: int,
    resource_limit: int,
):
    return resolve_inventory_collection(
        get_settings(),
        subscription_id=subscription_id,
        resource_group_name=resource_group_name,
        resource_group_limit=resource_group_limit,
        resource_limit=resource_limit,
    )


def _answer_payload(
    *,
    workspace_id: str,
    payload: dict[str, Any],
    subscription_id: str | None,
    resource_group_name: str | None,
    resource_group_limit: int,
    resource_limit: int,
) -> dict[str, Any]:
    settings = get_settings()
    message = str(payload.get("message") or "")
    provider_override = payload.get("provider")
    resolution = _resolve_resources(
        subscription_id=subscription_id,
        resource_group_name=resource_group_name,
        resource_group_limit=resource_group_limit,
        resource_limit=resource_limit,
    )
    view_context = payload.get("view_context")
    context = build_copilot_context(
        resolution.collection.resources,
        workspace_id=workspace_id,
        current_view=str(payload.get("current_view") or payload.get("context_scope") or "unknown"),
        current_language=str(payload.get("current_language") or "en"),
        selected_resource_id=payload.get("selected_resource_id"),
        view_context=view_context if isinstance(view_context, dict) else None,
    )
    provider = get_configured_copilot_provider(settings, str(provider_override) if provider_override else None)
    answer = provider.answer(message, resolution.collection.resources, context)
    response: dict[str, Any] = {
        "ok": True,
        "workspace_id": workspace_id,
        "mode": resolution.mode,
        "read_only": True,
        **answer,
    }
    if resolution.warning:
        response["warning"] = resolution.warning
    return response


def _chat_audit_metadata(payload: dict[str, Any], response: dict[str, Any]) -> dict[str, Any]:
    message = str(payload.get("message") or "")
    provider_override = payload.get("provider")
    model_value = payload.get("model")
    return {
        "provider": str(response.get("provider") or provider_override or "unknown"),
        "provider_override_present": provider_override is not None,
        "model_present": bool(model_value),
        "prompt_chars": len(message),
    }


@router.get("/copilot/providers")
def get_copilot_providers(health_smoke: bool = Query(default=False)) -> dict[str, Any]:
    settings = get_settings()
    result: dict[str, Any] = {
        "ok": True,
        "enabled": settings.copilot_enabled,
        "default_provider": settings.copilot_default_provider,
        "read_only": True,
        "providers": list_copilot_providers(settings),
    }
    if health_smoke:
        result["provider_health"] = probe_provider_health(settings)
    return result


@router.post("/copilot/chat")
def post_provider_aware_copilot_message(
    payload: dict[str, Any],
    request: Request,
    subscription_id: str | None = Query(default=None),
    resource_group_name: str | None = Query(default=None),
    resource_group_limit: int = Query(default=200, ge=1, le=1000),
    resource_limit: int = Query(default=500, ge=1, le=5000),
    context: WorkspaceAccessContext = Depends(get_workspace_access_context),
) -> dict[str, Any]:
    workspace_id = str(payload.get("workspace_id") or get_settings().workspace_default_id)
    membership = require_workspace_access(context, workspace_id, action="read")
    response = _answer_payload(
        workspace_id=workspace_id,
        payload=payload,
        subscription_id=subscription_id,
        resource_group_name=resource_group_name,
        resource_group_limit=resource_group_limit,
        resource_limit=resource_limit,
    )
    record_audit_event(
        event_type="copilot.chat.requested",
        outcome="success",
        workspace_id=workspace_id,
        account_id=membership.account_id,
        request_id=request.headers.get("x-request-id"),
        metadata=_chat_audit_metadata(payload, response),
    )
    return response


@router.post("/workspaces/{workspace_id}/chat")
def post_copilot_message(
    workspace_id: str,
    payload: dict[str, Any],
    request: Request,
    subscription_id: str | None = Query(default=None),
    resource_group_name: str | None = Query(default=None),
    resource_group_limit: int = Query(default=200, ge=1, le=1000),
    resource_limit: int = Query(default=500, ge=1, le=5000),
    context: WorkspaceAccessContext = Depends(get_workspace_access_context),
) -> dict[str, Any]:
    membership = require_workspace_access(context, workspace_id, action="read")
    response = _answer_payload(
        workspace_id=workspace_id,
        payload=payload,
        subscription_id=subscription_id,
        resource_group_name=resource_group_name,
        resource_group_limit=resource_group_limit,
        resource_limit=resource_limit,
    )
    record_audit_event(
        event_type="copilot.chat.requested",
        outcome="success",
        workspace_id=workspace_id,
        account_id=membership.account_id,
        request_id=request.headers.get("x-request-id"),
        metadata=_chat_audit_metadata(payload, response),
    )
    return response
