from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request

from app.api.workspace_security import (
    WorkspaceAccessContext,
    _resolve_sqlite_path,
    get_workspace_access_context,
    record_audit_event,
    require_workspace_access,
)
from app.core.config import get_settings

router = APIRouter(prefix="/workspaces", tags=["workspaces"])

_SENSITIVE_METADATA_KEYS = {
    "client_secret",
    "password",
    "private_key",
    "secret",
    "token",
}


def _default_workspace() -> dict[str, Any]:
    settings = get_settings()
    return {
        "id": settings.workspace_default_id,
        "name": settings.workspace_default_name,
        "company_name": "Demo Company",
        "description": "Phase 1A scaffold workspace",
    }


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(_resolve_sqlite_path(get_settings().database_url)))
    conn.row_factory = sqlite3.Row
    return conn


def _reject_sensitive_metadata(metadata: Any) -> dict[str, Any]:
    if metadata is None:
        return {}
    if not isinstance(metadata, dict):
        raise HTTPException(status_code=400, detail="metadata must be an object")
    for key in metadata:
        if str(key).lower() in _SENSITIVE_METADATA_KEYS:
            raise HTTPException(status_code=400, detail="credential metadata must not include secret values")
    return metadata


def _credential_profile_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "workspace_id": row["workspace_id"],
        "owner_account_id": row["owner_account_id"],
        "provider": row["provider"],
        "auth_type": row["auth_type"],
        "secret_ref": row["secret_ref"],
        "metadata": json.loads(row["metadata_json"] or "{}"),
        "created_at": row["created_at"],
        "disabled_at": row["disabled_at"],
    }


def _fetch_credential_profile(conn: sqlite3.Connection, workspace_id: str, profile_id: str) -> sqlite3.Row:
    row = conn.execute(
        """
        SELECT * FROM credential_profiles
        WHERE workspace_id = ? AND id = ? AND disabled_at IS NULL
        """,
        (workspace_id, profile_id),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Credential profile not found.")
    return row


def _demo_workspace_status() -> dict[str, Any]:
    settings = get_settings()
    workspace_id = settings.workspace_default_id
    with _connect() as conn:
        node_count = conn.execute(
            "SELECT COUNT(*) FROM resource_nodes WHERE workspace_id = ?",
            (workspace_id,),
        ).fetchone()[0]
        edge_count = conn.execute(
            "SELECT COUNT(*) FROM relationship_edges WHERE workspace_id = ?",
            (workspace_id,),
        ).fetchone()[0]
    mode = settings.topology_mode_resolved
    return {
        "workspace_id": workspace_id,
        "is_demo": workspace_id == "local-demo",
        "mode": mode,
        "has_topology": bool(node_count or edge_count or mode == "mock"),
        "node_count": int(node_count),
        "edge_count": int(edge_count),
    }


@router.get("")
def list_workspaces(
    context: WorkspaceAccessContext = Depends(get_workspace_access_context),
) -> dict[str, list[dict[str, Any]]]:
    workspace = _default_workspace()
    require_workspace_access(context, workspace["id"], action="read")
    return {"items": [workspace]}


@router.post("")
def create_workspace(
    payload: dict[str, Any],
    request: Request,
    context: WorkspaceAccessContext = Depends(get_workspace_access_context),
) -> dict[str, Any]:
    workspace = _default_workspace()
    workspace.update(
        {
            "id": payload.get("id", workspace["id"]),
            "name": payload.get("name", workspace["name"]),
            "company_name": payload.get("company_name", workspace["company_name"]),
            "description": payload.get("description", workspace["description"]),
        }
    )
    membership = require_workspace_access(context, workspace["id"], action="manage")
    record_audit_event(
        event_type="workspace.created",
        outcome="success",
        workspace_id=workspace["id"],
        account_id=membership.account_id,
        request_id=request.headers.get("x-request-id"),
        metadata={"fields": sorted(payload.keys())},
    )
    return workspace


@router.get("/demo-status")
def get_demo_workspace_status(
    context: WorkspaceAccessContext = Depends(get_workspace_access_context),
) -> dict[str, Any]:
    settings = get_settings()
    require_workspace_access(context, settings.workspace_default_id, action="read")
    return _demo_workspace_status()


@router.post("/demo-bootstrap")
def bootstrap_demo_workspace(
    request: Request,
    context: WorkspaceAccessContext = Depends(get_workspace_access_context),
) -> dict[str, Any]:
    settings = get_settings()
    workspace = _default_workspace()
    membership = require_workspace_access(context, workspace["id"], action="manage")
    with _connect() as conn:
        cursor = conn.execute(
            """
            INSERT OR IGNORE INTO workspaces(id, name, company_name, description)
            VALUES (?, ?, ?, ?)
            """,
            (
                workspace["id"],
                workspace["name"],
                workspace["company_name"],
                workspace["description"],
            ),
        )
        conn.commit()
    outcome = "success" if cursor.rowcount else "skipped"
    record_audit_event(
        event_type="workspace.demo_bootstrapped",
        outcome=outcome,
        workspace_id=settings.workspace_default_id,
        account_id=membership.account_id,
        request_id=request.headers.get("x-request-id"),
        metadata={"workspace_id": settings.workspace_default_id},
    )
    return {**_demo_workspace_status(), "status": "ready", "bootstrap_outcome": outcome}


@router.get("/{workspace_id}")
def get_workspace(
    workspace_id: str,
    context: WorkspaceAccessContext = Depends(get_workspace_access_context),
) -> dict[str, Any]:
    require_workspace_access(context, workspace_id, action="read")
    workspace = _default_workspace()
    workspace["id"] = workspace_id
    return workspace


@router.patch("/{workspace_id}")
def update_workspace(
    workspace_id: str,
    payload: dict[str, Any],
    request: Request,
    context: WorkspaceAccessContext = Depends(get_workspace_access_context),
) -> dict[str, Any]:
    membership = require_workspace_access(context, workspace_id, action="manage")
    workspace = _default_workspace()
    workspace["id"] = workspace_id
    workspace.update(payload)
    record_audit_event(
        event_type="workspace.updated",
        outcome="success",
        workspace_id=workspace_id,
        account_id=membership.account_id,
        request_id=request.headers.get("x-request-id"),
        metadata={"fields": sorted(payload.keys())},
    )
    return workspace


@router.get("/{workspace_id}/credential-profiles")
def list_credential_profiles(
    workspace_id: str,
    context: WorkspaceAccessContext = Depends(get_workspace_access_context),
) -> dict[str, list[dict[str, Any]]]:
    require_workspace_access(context, workspace_id, action="read")
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT * FROM credential_profiles
            WHERE workspace_id = ? AND disabled_at IS NULL
            ORDER BY created_at DESC, id DESC
            """,
            (workspace_id,),
        ).fetchall()
    return {"items": [_credential_profile_row(row) for row in rows]}


@router.post("/{workspace_id}/credential-profiles")
def create_credential_profile(
    workspace_id: str,
    payload: dict[str, Any],
    request: Request,
    context: WorkspaceAccessContext = Depends(get_workspace_access_context),
) -> dict[str, Any]:
    membership = require_workspace_access(context, workspace_id, action="manage")
    metadata = _reject_sensitive_metadata(payload.get("metadata"))
    secret_ref = str(payload.get("secret_ref") or "").strip()
    if not secret_ref:
        raise HTTPException(status_code=400, detail="secret_ref is required")
    profile_id = str(payload.get("id") or f"cred_{uuid.uuid4().hex}")
    provider = str(payload.get("provider") or "azure").strip()
    auth_type = str(payload.get("auth_type") or "certificate").strip()
    if not provider or not auth_type:
        raise HTTPException(status_code=400, detail="provider and auth_type are required")

    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO credential_profiles(
                id, workspace_id, owner_account_id, provider, auth_type, secret_ref, metadata_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                profile_id,
                workspace_id,
                membership.account_id,
                provider,
                auth_type,
                secret_ref,
                json.dumps(metadata, sort_keys=True, separators=(",", ":")),
            ),
        )
        row = conn.execute("SELECT * FROM credential_profiles WHERE id = ?", (profile_id,)).fetchone()
        conn.commit()

    record_audit_event(
        event_type="credential_profile.created",
        outcome="success",
        workspace_id=workspace_id,
        account_id=membership.account_id,
        request_id=request.headers.get("x-request-id"),
        metadata={"credential_profile_id": profile_id, "provider": provider, "auth_type": auth_type},
    )
    return _credential_profile_row(row)


@router.patch("/{workspace_id}/credential-profiles/{profile_id}")
def update_credential_profile(
    workspace_id: str,
    profile_id: str,
    payload: dict[str, Any],
    request: Request,
    context: WorkspaceAccessContext = Depends(get_workspace_access_context),
) -> dict[str, Any]:
    membership = require_workspace_access(context, workspace_id, action="manage")
    updates: dict[str, Any] = {}
    if "provider" in payload:
        provider = str(payload.get("provider") or "").strip()
        if not provider:
            raise HTTPException(status_code=400, detail="provider must not be empty")
        updates["provider"] = provider
    if "auth_type" in payload:
        auth_type = str(payload.get("auth_type") or "").strip()
        if not auth_type:
            raise HTTPException(status_code=400, detail="auth_type must not be empty")
        updates["auth_type"] = auth_type
    if "secret_ref" in payload:
        secret_ref = str(payload.get("secret_ref") or "").strip()
        if not secret_ref:
            raise HTTPException(status_code=400, detail="secret_ref must not be empty")
        updates["secret_ref"] = secret_ref
    if "metadata" in payload:
        updates["metadata_json"] = json.dumps(
            _reject_sensitive_metadata(payload.get("metadata")),
            sort_keys=True,
            separators=(",", ":"),
        )

    with _connect() as conn:
        _fetch_credential_profile(conn, workspace_id, profile_id)
        if updates:
            set_clause = ", ".join(f"{column} = ?" for column in updates)
            conn.execute(
                f"UPDATE credential_profiles SET {set_clause} WHERE workspace_id = ? AND id = ?",
                (*updates.values(), workspace_id, profile_id),
            )
        row = _fetch_credential_profile(conn, workspace_id, profile_id)
        conn.commit()

    record_audit_event(
        event_type="credential_profile.updated",
        outcome="success",
        workspace_id=workspace_id,
        account_id=membership.account_id,
        request_id=request.headers.get("x-request-id"),
        metadata={"credential_profile_id": profile_id, "fields": sorted(updates.keys())},
    )
    return _credential_profile_row(row)


@router.delete("/{workspace_id}/credential-profiles/{profile_id}")
def delete_credential_profile(
    workspace_id: str,
    profile_id: str,
    request: Request,
    context: WorkspaceAccessContext = Depends(get_workspace_access_context),
) -> dict[str, Any]:
    membership = require_workspace_access(context, workspace_id, action="manage")
    disabled_at = datetime.now(UTC).isoformat()
    with _connect() as conn:
        _fetch_credential_profile(conn, workspace_id, profile_id)
        conn.execute(
            """
            UPDATE credential_profiles
            SET disabled_at = ?
            WHERE workspace_id = ? AND id = ? AND disabled_at IS NULL
            """,
            (disabled_at, workspace_id, profile_id),
        )
        conn.commit()

    record_audit_event(
        event_type="credential_profile.deleted",
        outcome="success",
        workspace_id=workspace_id,
        account_id=membership.account_id,
        request_id=request.headers.get("x-request-id"),
        metadata={"credential_profile_id": profile_id},
    )
    return {"ok": True, "status": "deleted", "id": profile_id}
