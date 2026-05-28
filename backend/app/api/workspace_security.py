from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from fastapi import HTTPException, status

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


def get_workspace_access_context() -> WorkspaceAccessContext:
    """Return the local-demo access context until session auth is wired."""
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
