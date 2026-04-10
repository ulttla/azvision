from typing import Any

from fastapi import APIRouter

from app.core.config import get_settings

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


def _default_workspace() -> dict[str, Any]:
    settings = get_settings()
    return {
        "id": settings.workspace_default_id,
        "name": settings.workspace_default_name,
        "company_name": "Demo Company",
        "description": "Phase 1A scaffold workspace",
    }


@router.get("")
def list_workspaces() -> dict[str, list[dict[str, Any]]]:
    return {"items": [_default_workspace()]}


@router.post("")
def create_workspace(payload: dict[str, Any]) -> dict[str, Any]:
    workspace = _default_workspace()
    workspace.update(
        {
            "id": payload.get("id", workspace["id"]),
            "name": payload.get("name", workspace["name"]),
            "company_name": payload.get("company_name", workspace["company_name"]),
            "description": payload.get("description", workspace["description"]),
        }
    )
    return workspace


@router.get("/{workspace_id}")
def get_workspace(workspace_id: str) -> dict[str, Any]:
    workspace = _default_workspace()
    workspace["id"] = workspace_id
    return workspace


@router.patch("/{workspace_id}")
def update_workspace(workspace_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    workspace = _default_workspace()
    workspace["id"] = workspace_id
    workspace.update(payload)
    return workspace
