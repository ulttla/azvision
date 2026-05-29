from __future__ import annotations

import hashlib
import json
import sqlite3
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

from fastapi import Depends, HTTPException, Request, status

from app.core.config import get_settings

WorkspaceRole = Literal["owner", "viewer"]
WorkspaceAction = Literal["read", "write", "manage"]

_ROLE_ACTIONS: dict[WorkspaceRole, set[WorkspaceAction]] = {
    "owner": {"read", "write", "manage"},
    "viewer": {"read"},
}


@dataclass(frozen=True)
class WorkspaceMembership:
    workspace_id: str
    account_id: str
    role: WorkspaceRole


@dataclass(frozen=True)
class WorkspaceAccessContext:
    account_id: str
    memberships: tuple[WorkspaceMembership, ...]


def _resolve_sqlite_path(database_url: str) -> Path:
    prefix = "sqlite:///"
    if not database_url.startswith(prefix):
        raise ValueError(f"Only sqlite URLs are supported for workspace auth lookup: {database_url}")
    return Path(database_url[len(prefix):]).expanduser().resolve()


def _bearer_token(request: Request) -> str | None:
    value = request.headers.get("authorization", "").strip()
    prefix = "Bearer "
    if not value.lower().startswith(prefix.lower()):
        return None
    token = value[len(prefix):].strip()
    return token or None


def _parse_expires_at(value: str | None) -> datetime | None:
    if not value:
        return None
    normalized = value.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed


def _session_context_from_token(token: str) -> WorkspaceAccessContext | None:
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    db_path = _resolve_sqlite_path(get_settings().database_url)
    if not db_path.exists():
        return None

    with sqlite3.connect(str(db_path)) as conn:
        conn.row_factory = sqlite3.Row
        session = conn.execute(
            """
            SELECT s.account_id, s.expires_at, s.revoked_at, a.disabled_at
            FROM sessions s
            JOIN accounts a ON a.id = s.account_id
            WHERE s.token_hash = ?
            """,
            (token_hash,),
        ).fetchone()
        if session is None or session["revoked_at"] or session["disabled_at"]:
            return None
        expires_at = _parse_expires_at(session["expires_at"])
        if expires_at is not None and expires_at <= datetime.now(UTC):
            return None

        rows = conn.execute(
            """
            SELECT workspace_id, account_id, role
            FROM workspace_members
            WHERE account_id = ?
            """,
            (session["account_id"],),
        ).fetchall()

    memberships: list[WorkspaceMembership] = []
    for row in rows:
        role = row["role"]
        if role not in _ROLE_ACTIONS:
            continue
        memberships.append(
            WorkspaceMembership(
                workspace_id=row["workspace_id"],
                account_id=row["account_id"],
                role=role,
            )
        )

    return WorkspaceAccessContext(
        account_id=session["account_id"],
        memberships=tuple(memberships),
    )


def _local_demo_context() -> WorkspaceAccessContext:
    settings = get_settings()
    return WorkspaceAccessContext(
        account_id="local-demo-account",
        memberships=(
            WorkspaceMembership(
                workspace_id=settings.workspace_default_id,
                account_id="local-demo-account",
                role="owner",
            ),
        ),
    )


def record_audit_event(
    *,
    event_type: str,
    outcome: str,
    workspace_id: str | None = None,
    account_id: str | None = None,
    request_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> str | None:
    """Append a best-effort audit event without leaking sensitive values."""
    db_path = _resolve_sqlite_path(get_settings().database_url)
    if not db_path.exists():
        return None

    event_id = f"audit_{uuid.uuid4().hex}"
    metadata_json = json.dumps(metadata or {}, sort_keys=True, separators=(",", ":"))
    with sqlite3.connect(str(db_path)) as conn:
        conn.execute(
            """
            INSERT INTO audit_events(id, workspace_id, account_id, event_type, request_id, outcome, metadata_json)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (event_id, workspace_id, account_id, event_type, request_id, outcome, metadata_json),
        )
        conn.commit()
    return event_id


def get_workspace_access_context(request: Request) -> WorkspaceAccessContext:
    """Return session-backed workspace access, falling back to local-demo.

    This is the public-beta auth seam: route contracts already depend on this
    function, so a real login/session implementation can replace the source of
    account memberships without changing protected routes. Until login routes
    exist, requests without a bearer token retain local-demo compatibility.
    """
    token = _bearer_token(request)
    if token is None:
        return _local_demo_context()

    context = _session_context_from_token(token)
    if context is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session.",
        )
    return context


async def require_workspace_membership(
    workspace_id: str,
    context: WorkspaceAccessContext = Depends(get_workspace_access_context),
) -> WorkspaceMembership:
    """Route-agnostic workspace membership check.

    Designed as a router-level dependency (dependencies=[Depends(require_workspace_membership)]).
    Gates every route under the router with a minimum read-level membership check.
    Individual routes that need write/manage access should add a per-route
    require_workspace_access(..., action="write"/"manage") call on top.
    """
    return require_workspace_access(context, workspace_id, action="read")


async def require_workspace_write_membership(
    workspace_id: str,
    context: WorkspaceAccessContext = Depends(get_workspace_access_context),
) -> WorkspaceMembership:
    """Route-agnostic workspace write check for mutation endpoints."""
    return require_workspace_access(context, workspace_id, action="write")


def require_workspace_access(
    context: WorkspaceAccessContext | None,
    workspace_id: str,
    *,
    action: WorkspaceAction = "read",
) -> WorkspaceMembership:
    """Validate account membership for a workspace-scoped action.

    This helper is intentionally small and side-effect free so route tests can
    lock the public beta isolation contract before session persistence is added.
    It must not leak whether another user's workspace exists.
    """
    if context is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )

    membership = next(
        (
            item
            for item in context.memberships
            if item.workspace_id == workspace_id and item.account_id == context.account_id
        ),
        None,
    )
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Workspace access denied.",
        )

    allowed_actions = _ROLE_ACTIONS[membership.role]
    if action not in allowed_actions:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Workspace action denied.",
        )

    return membership
