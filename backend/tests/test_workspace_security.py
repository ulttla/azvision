from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.api.workspace_security import (
    WorkspaceAccessContext,
    WorkspaceMembership,
    require_workspace_access,
)


def _context(*memberships: WorkspaceMembership) -> WorkspaceAccessContext:
    return WorkspaceAccessContext(account_id="acct-a", memberships=memberships)


def test_owner_can_read_and_manage_own_workspace():
    membership = WorkspaceMembership(workspace_id="workspace-a", account_id="acct-a", role="owner")

    assert require_workspace_access(_context(membership), "workspace-a", action="read") == membership
    assert require_workspace_access(_context(membership), "workspace-a", action="manage") == membership


def test_cross_workspace_access_is_forbidden_without_identifier_leak():
    context = _context(WorkspaceMembership(workspace_id="workspace-a", account_id="acct-a", role="owner"))

    with pytest.raises(HTTPException) as exc_info:
        require_workspace_access(context, "workspace-b", action="read")

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "Workspace access denied."
    assert "workspace-b" not in exc_info.value.detail


def test_viewer_cannot_perform_write_or_manage_actions():
    context = _context(WorkspaceMembership(workspace_id="workspace-a", account_id="acct-a", role="viewer"))

    assert require_workspace_access(context, "workspace-a", action="read").role == "viewer"
    for action in ("write", "manage"):
        with pytest.raises(HTTPException) as exc_info:
            require_workspace_access(context, "workspace-a", action=action)
        assert exc_info.value.status_code == 403
        assert exc_info.value.detail == "Workspace action denied."


def test_missing_context_requires_authentication():
    with pytest.raises(HTTPException) as exc_info:
        require_workspace_access(None, "workspace-a", action="read")

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Authentication required."
