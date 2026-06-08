from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request

from app.api.rate_limiter import rate_limit_readiness_summary
from app.api.workspace_security import WorkspaceAccessContext, _bearer_token, get_workspace_access_context, record_audit_event
from app.auth.azure_read_test import AzureReadTestError, run_azure_read_test
from app.auth.oidc_login import (
    OIDCLoginError,
    OIDCNotConfiguredError,
    oidc_workspace_map_summary,
    resolve_oidc_workspace_grant,
    verify_oidc_id_token,
)
from app.auth.session_issuer import disable_account_sessions, issue_workspace_session, revoke_workspace_session, stable_dev_account_id
from app.core.config import get_settings

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/config-check")
def config_check() -> dict:
    settings = get_settings()
    workspace_map = oidc_workspace_map_summary(settings)
    rate_limit = rate_limit_readiness_summary(settings)
    payload = {
        "status": "ok",
        "phase": "1A-live-read-prep",
        "auth_ready": settings.auth_runtime_ready,
        "checks": {
            "tenant_id_present": bool(settings.azure_tenant_id),
            "client_id_present": bool(settings.azure_client_id),
            "certificate_path_present": bool(settings.azure_certificate_path),
            "certificate_thumbprint_present": bool(settings.azure_certificate_thumbprint),
            "azure_cloud": settings.azure_cloud,
            "oidc": {
                "login_enabled": bool(getattr(settings, "auth_oidc_login_enabled", False)),
                "issuer_present": bool(getattr(settings, "auth_oidc_issuer", "")),
                "audience_present": bool(getattr(settings, "auth_oidc_audience", "")),
                "jwks_url_present": bool(getattr(settings, "auth_oidc_jwks_url", "")),
                "workspace_map_present": workspace_map["present"],
                "workspace_map_valid": workspace_map["valid"],
                "mapped_user_count": workspace_map["mapped_user_count"],
                "grant_count": workspace_map["grant_count"],
            },
            "rate_limit": rate_limit,
        },
        "note": "server-side configured credential profile, diagnostics read only. Preferred env file is project root .env; backend/.env is also supported.",
    }
    if settings.debug:
        payload["checks"].update(
            {
                "certificate_path_exists": settings.certificate_path_exists,
                "certificate_password_present": bool(settings.azure_certificate_password),
            }
        )
        payload["diagnostics"] = {
            "env_file_candidates": settings.env_file_candidates,
            "discovered_env_files": settings.discovered_env_files,
        }
    return payload


@router.post("/dev-session")
def create_dev_session(request: Request, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    """Issue a local development session token when explicitly enabled.

    This is not a public login flow. It exists only to exercise the session
    lookup seam safely before a real identity provider is wired.
    """
    settings = get_settings()
    if not settings.auth_dev_session_enabled:
        raise HTTPException(status_code=404, detail="Not found")

    body = payload or {}
    workspace_id = str(body.get("workspace_id") or settings.workspace_default_id)
    role = str(body.get("role") or "owner")
    if role not in {"owner", "viewer"}:
        raise HTTPException(status_code=400, detail="role must be owner or viewer")
    email = str(body.get("email") or "local-dev@example.test")
    ttl_minutes = max(5, min(int(body.get("ttl_minutes") or 60), 24 * 60))
    issued = issue_workspace_session(
        database_url=settings.database_url,
        workspace_id=workspace_id,
        email=email,
        role=role,
        ttl_minutes=ttl_minutes,
        account_id=stable_dev_account_id(email),
        display_name=body.get("display_name") or email,
    )

    record_audit_event(
        event_type="auth.dev_session.created",
        outcome="success",
        workspace_id=workspace_id,
        account_id=issued.account_id,
        request_id=request.headers.get("x-request-id"),
        metadata={"role": role, "ttl_minutes": ttl_minutes},
    )

    return {
        "ok": True,
        "status": "created",
        "session_id": issued.session_id,
        "account_id": issued.account_id,
        "workspace_id": issued.workspace_id,
        "role": issued.role,
        "expires_at": issued.expires_at,
        "token": issued.token,
        "token_type": issued.token_type,
    }


@router.post("/oidc/session")
def create_oidc_session(request: Request, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    settings = get_settings()
    if not settings.auth_oidc_login_enabled:
        raise HTTPException(status_code=404, detail="Not found")

    body = payload or {}
    id_token = str(body.get("id_token") or "").strip()
    if not id_token:
        raise HTTPException(status_code=400, detail="id_token is required")

    requested_workspace_id = str(body.get("workspace_id") or "").strip() or None
    try:
        identity = verify_oidc_id_token(settings, id_token)
        grant = resolve_oidc_workspace_grant(
            settings,
            identity,
            requested_workspace_id,
            body,
        )
    except OIDCNotConfiguredError as exc:
        record_audit_event(
            event_type="auth.oidc_session.failed",
            outcome="failure",
            workspace_id=requested_workspace_id,
            request_id=request.headers.get("x-request-id"),
            metadata={"reason": "not_configured"},
        )
        raise HTTPException(status_code=503, detail="OIDC login is not configured.") from exc
    except OIDCLoginError as exc:
        record_audit_event(
            event_type="auth.oidc_session.failed",
            outcome="failure",
            workspace_id=requested_workspace_id,
            request_id=request.headers.get("x-request-id"),
            metadata={"reason": "invalid_login"},
        )
        raise HTTPException(status_code=401, detail="Invalid OIDC login.") from exc

    issued = issue_workspace_session(
        database_url=settings.database_url,
        workspace_id=grant.workspace_id,
        email=grant.email,
        role=grant.role,
        ttl_minutes=60,
        account_id=grant.account_id,
        display_name=grant.display_name or grant.email,
    )
    record_audit_event(
        event_type="auth.oidc_session.created",
        outcome="success",
        workspace_id=issued.workspace_id,
        account_id=issued.account_id,
        request_id=request.headers.get("x-request-id"),
        metadata={"issuer": identity.issuer, "subject_hash": issued.account_id},
    )
    return {
        "ok": True,
        "status": "created",
        "session_id": issued.session_id,
        "account_id": issued.account_id,
        "workspace_id": issued.workspace_id,
        "role": issued.role,
        "expires_at": issued.expires_at,
        "token": issued.token,
        "token_type": issued.token_type,
    }


@router.get("/me")
def me(request: Request) -> dict[str, Any]:
    if _bearer_token(request) is None:
        raise HTTPException(status_code=401, detail="Authentication required.")
    context = get_workspace_access_context(request)
    return {
        "ok": True,
        "account_id": context.account_id,
        "memberships": [
            {
                "workspace_id": membership.workspace_id,
                "role": membership.role,
            }
            for membership in context.memberships
        ],
    }


@router.post("/account/disable")
def disable_own_account(
    request: Request,
    context: WorkspaceAccessContext = Depends(get_workspace_access_context),
) -> dict[str, Any]:
    settings = get_settings()
    if not settings.auth_account_management_enabled:
        raise HTTPException(status_code=404, detail="Not found")

    disabled = disable_account_sessions(database_url=settings.database_url, account_id=context.account_id)
    if disabled is None:
        raise HTTPException(status_code=404, detail="Account not found.")

    record_audit_event(
        event_type="auth.account.disabled",
        outcome="success",
        account_id=disabled.account_id,
        request_id=request.headers.get("x-request-id"),
        metadata={"revoked_session_count": disabled.revoked_session_count},
    )
    return {
        "ok": True,
        "status": "disabled",
        "account_id": disabled.account_id,
        "revoked_session_count": disabled.revoked_session_count,
    }


@router.post("/logout")
def logout(request: Request) -> dict[str, Any]:
    token = _bearer_token(request)
    if token is None:
        raise HTTPException(status_code=401, detail="Authentication required.")

    revoked = revoke_workspace_session(database_url=get_settings().database_url, token=token)
    if revoked is None:
        raise HTTPException(status_code=401, detail="Invalid or expired session.")

    record_audit_event(
        event_type="auth.session.revoked",
        outcome="success",
        account_id=revoked.account_id,
        request_id=request.headers.get("x-request-id"),
        metadata={"session_id": revoked.session_id},
    )
    return {"ok": True, "status": "revoked"}


@router.get("/read-test")
def read_test() -> dict:
    settings = get_settings()
    if not settings.auth_runtime_ready:
        raise HTTPException(
            status_code=503,
            detail="Missing required Azure settings or certificate path is invalid. Put Azure values in project root .env or backend/.env and ensure certificate path exists.",
        )

    try:
        result = run_azure_read_test(settings)
        return {
            "ok": result.ok,
            "status": "ok",
            "phase": "1A-live-read-prep",
            "token_acquired": result.token_acquired,
            "accessible_subscriptions": result.accessible_subscriptions,
            "sample_resource_groups": result.sample_resource_groups,
            "message": result.message,
        }
    except AzureReadTestError:
        raise
    except Exception as exc:
        message = str(exc) if settings.debug else "Unexpected auth read test failure."
        raise HTTPException(status_code=500, detail=message) from exc
