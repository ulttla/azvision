"""Contract tests for workspace isolation across all gated routers.

Verifies that every workspace-scoped route group rejects cross-workspace
access with 403, never leaking the denied workspace_id in the response body.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.api.workspace_security import WorkspaceAccessContext, WorkspaceMembership, get_workspace_access_context
from app.main import app


def _restrictive_client() -> TestClient:
    """Return a TestClient that uses the default access context (local-demo only).

    Used for cross-workspace denial tests.
    This bypasses the conftest.py wildcard override.
    """
    from app.main import app as _app
    return TestClient(_app, raise_server_exceptions=True)

# ---------------------------------------------------------------------------
# Router-level gate: deny cross-workspace access
# ---------------------------------------------------------------------------

CROSS_WORKSPACE_403_TESTS = [
    # (method, url_fmt, extra_factory)
    ("get", "/api/v1/workspaces/{workspace_id}/subscriptions", None),
    ("get", "/api/v1/workspaces/{workspace_id}/resources", None),
    ("get", "/api/v1/workspaces/{workspace_id}/inventory-summary", None),
    ("get", "/api/v1/workspaces/{workspace_id}/topology", None),
    ("get", "/api/v1/workspaces/{workspace_id}/topology/node-detail", {"params": {"node_type": "subscription", "node_ref": "sub-x"}}),
    ("post", "/api/v1/workspaces/{workspace_id}/topology/manual-nodes", {"json": {"manual_ref": "n1", "display_name": "test"}}),
    ("get", "/api/v1/workspaces/{workspace_id}/topology/manual-nodes", None),
    ("post", "/api/v1/workspaces/{workspace_id}/topology/manual-edges", {"json": {"source_node_key": "manual:n1", "target_node_key": "manual:n2"}}),
    ("get", "/api/v1/workspaces/{workspace_id}/topology/manual-edges", None),
    ("get", "/api/v1/workspaces/{workspace_id}/simulations", None),
    ("post", "/api/v1/workspaces/{workspace_id}/simulations", {"json": {"name": "s1"}}),
    ("get", "/api/v1/workspaces/{workspace_id}/snapshots", None),
    ("post", "/api/v1/workspaces/{workspace_id}/snapshots", {"json": {"name": "s1"}}),
    ("get", "/api/v1/workspaces/{workspace_id}/path-analysis", {"params": {"source_resource_id": "/test/a", "destination_resource_id": "/test/b"}}),
    ("get", "/api/v1/workspaces/{workspace_id}/cost/summary", None),
    ("post", "/api/v1/workspaces/{workspace_id}/chat", {"json": {"message": "hello"}}),
]


@pytest.mark.parametrize(
    ("method", "url_fmt", "extra_factory"),
    CROSS_WORKSPACE_403_TESTS,
)
def test_router_level_denies_cross_workspace_without_id_leak(
    method: str,
    url_fmt: str,
    extra_factory,
):
    """Cross-workspace access must be denied with 403, no ID leak.

    Uses a fresh TestClient without the conftest wildcard override.
    """
    client = _restrictive_client()
    workspace_b = "workspace-b"
    url = url_fmt.format(workspace_id=workspace_b)
    kwargs = extra_factory.copy() if extra_factory else {}
    response = getattr(client, method)(url, **kwargs)

    assert response.status_code == 403, f"{method.upper()} {url} → {response.status_code} (expected 403)"
    body = response.json()
    assert body.get("status") == "http-403" or body.get("message") == "Workspace access denied."
    assert workspace_b not in response.text, f"{method.upper()} {url} leaked {workspace_b!r} in response"


# ---------------------------------------------------------------------------
# Router-level gate: local-demo routes still work
# ---------------------------------------------------------------------------

LOCAL_DEMO_OK_TESTS = [
    ("get", "/api/v1/workspaces/{workspace_id}/subscriptions", None),
    ("get", "/api/v1/workspaces/{workspace_id}/resources", None),
    ("get", "/api/v1/workspaces/{workspace_id}/inventory-summary", None),
    ("get", "/api/v1/workspaces/{workspace_id}/topology", None),
    ("get", "/api/v1/workspaces/{workspace_id}/simulations", None),
    ("get", "/api/v1/workspaces/{workspace_id}/snapshots", None),
]


@pytest.mark.parametrize(
    ("method", "url_fmt", "extra_factory"),
    LOCAL_DEMO_OK_TESTS,
)
def test_router_level_allows_local_demo_workspace(
    client: TestClient,
    method: str,
    url_fmt: str,
    extra_factory,
):
    workspace_id = "local-demo"
    url = url_fmt.format(workspace_id=workspace_id)
    kwargs = extra_factory.copy() if extra_factory else {}
    response = getattr(client, method)(url, **kwargs)

    assert response.status_code == 200, f"{method.upper()} {url} → {response.status_code} (expected 200)"
    body = response.json()
    assert body.get("ok") is True, f"{method.upper()} {url} returned ok=False"


# ---------------------------------------------------------------------------
# Copilot route with payload-bound workspace_id
# ---------------------------------------------------------------------------

def test_copilot_chat_denies_cross_workspace_in_payload():
    client = _restrictive_client()
    response = client.post(
        "/api/v1/copilot/chat",
        json={"workspace_id": "workspace-b", "message": "hello"},
    )
    assert response.status_code == 403
    assert "workspace-b" not in response.text


def test_copilot_chat_allows_local_demo_in_payload(client: TestClient):
    response = client.post(
        "/api/v1/copilot/chat",
        json={"workspace_id": "local-demo", "message": "hello"},
    )
    # copilot/chat may return 200 or other non-403 depending on copilot config;
    # the key test is that it's not 403
    assert response.status_code != 403


# ---------------------------------------------------------------------------
# Viewer cannot perform write operations on local-demo
# ---------------------------------------------------------------------------

WRITE_GATE_TESTS = [
    ("post", "/api/v1/workspaces/{workspace_id}/topology/manual-nodes", {"json": {"manual_ref": "n1", "display_name": "test"}}),
    ("post", "/api/v1/workspaces/{workspace_id}/topology/manual-edges", {"json": {"source_node_key": "manual:n1", "target_node_key": "manual:n2"}}),
    ("patch", "/api/v1/workspaces/{workspace_id}/topology/manual-nodes/mn_1", {"json": {"display_name": "blocked"}}),
    ("delete", "/api/v1/workspaces/{workspace_id}/topology/manual-nodes/mn_1", None),
    ("post", "/api/v1/workspaces/{workspace_id}/simulations", {"json": {"name": "s1"}}),
    ("delete", "/api/v1/workspaces/{workspace_id}/simulations/sim_1", None),
    ("post", "/api/v1/workspaces/{workspace_id}/snapshots", {"json": {"name": "s1"}}),
    ("patch", "/api/v1/workspaces/{workspace_id}/snapshots/snap_1", {"json": {"name": "blocked"}}),
    ("post", "/api/v1/workspaces/{workspace_id}/snapshots/snap_1/restore-events", None),
    ("delete", "/api/v1/workspaces/{workspace_id}/snapshots/snap_1", None),
]


@pytest.mark.parametrize(
    ("method", "url_fmt", "extra_factory"),
    WRITE_GATE_TESTS,
)
def test_viewer_cannot_write_local_demo(
    method: str,
    url_fmt: str,
    extra_factory,
):
    workspace_id = "local-demo"
    url = url_fmt.format(workspace_id=workspace_id)
    kwargs = extra_factory.copy() if extra_factory else {}

    def _viewer_context() -> WorkspaceAccessContext:
        return WorkspaceAccessContext(
            account_id="viewer-account",
            memberships=(
                WorkspaceMembership(
                    workspace_id=workspace_id,
                    account_id="viewer-account",
                    role="viewer",
                ),
            ),
        )

    app.dependency_overrides[get_workspace_access_context] = _viewer_context
    try:
        with TestClient(app, raise_server_exceptions=True) as client:
            response = getattr(client, method)(url, **kwargs)
    finally:
        app.dependency_overrides.pop(get_workspace_access_context, None)

    assert response.status_code == 403, f"{method.upper()} {url} → {response.status_code} (expected 403)"
    assert response.json().get("message") == "Workspace action denied."
