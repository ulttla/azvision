from typing import Any

from fastapi import APIRouter, Depends

from app.api.workspace_security import (
    WorkspaceAccessContext,
    WorkspaceMembership,
    require_workspace_access,
)
from app.core.config import get_settings

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


def get_workspace_access_context() -> WorkspaceAccessContext:
    """Return the local-demo access context until session auth is wired.

    Public beta will replace this dependency with session-backed account and
    workspace membership lookup. Keeping it as a FastAPI dependency lets tests
    override it without exposing any public auth surface yet.
    """
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


def _default_workspace() -> dict[str, Any]:
    settings = get_settings()
    return {
        "id": settings.workspace_default_id,
        "name": settings.workspace_default_name,
        "company_name": "Demo Company",
        "description": "Phase 1A scaffold workspace",
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
    require_workspace_access(context, workspace["id"], action="manage")
    return workspace


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
    context: WorkspaceAccessContext = Depends(get_workspace_access_context),
) -> dict[str, Any]:
    require_workspace_access(context, workspace_id, action="manage")
    workspace = _default_workspace()
    workspace["id"] = workspace_id
    workspace.update(payload)
    return workspace
