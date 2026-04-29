"""Tests for the snapshot CRUD API and service layer.

Covers:
- Service-layer CRUD (no HTTP) — fast unit tests
- Route-layer integration via TestClient — verifies HTTP status codes,
  response shapes, and the error contract.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.repositories.snapshots import SnapshotRepository
from app.schemas.snapshots import (
    SNAPSHOT_THUMBNAIL_MAX_LENGTH,
    SnapshotCreateRequest,
    SnapshotUpdateRequest,
)
from app.services.snapshots import SnapshotNotFoundError, SnapshotService


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_create_request(**kwargs) -> SnapshotCreateRequest:
    defaults = dict(
        name="Test Snapshot",
        note="",
        preset_version=1,
        compare_refs=[],
        cluster_children=True,
        scope="visible",
        query="",
        selected_subscription_id="",
        resource_group_name="",
        topology_generated_at="2026-04-20T00:00:00Z",
        visible_node_count=10,
        loaded_node_count=15,
        edge_count=5,
        thumbnail_data_url="",
    )
    defaults.update(kwargs)
    return SnapshotCreateRequest(**defaults)


def _create_payload(**kwargs) -> dict:
    """Return a JSON-serializable dict suitable for POST /snapshots."""
    req = _make_create_request(**kwargs)
    return req.model_dump()


WORKSPACE = "ws-test-001"


# ===========================================================================
# Service-layer unit tests (no HTTP)
# ===========================================================================

class TestSnapshotServiceCreate:
    def test_returns_record_with_all_fields(self, snapshot_service: SnapshotService):
        req = _make_create_request(name="My Snapshot", note="a note")
        record = snapshot_service.create_snapshot(WORKSPACE, req)

        assert record.id.startswith("snap_")
        assert record.workspace_id == WORKSPACE
        assert record.name == "My Snapshot"
        assert record.note == "a note"
        assert record.captured_at != ""
        assert record.created_at != ""
        assert record.restore_count == 0
        assert record.is_pinned is False
        assert record.archived_at == ""

    def test_captured_at_preserved_from_request(self, snapshot_service: SnapshotService):
        captured = "2025-01-01T12:00:00+00:00"
        req = _make_create_request(captured_at=captured)
        record = snapshot_service.create_snapshot(WORKSPACE, req)
        assert record.captured_at == captured

    def test_captured_at_defaults_to_now_if_omitted(self, snapshot_service: SnapshotService):
        req = _make_create_request()
        record = snapshot_service.create_snapshot(WORKSPACE, req)
        assert record.captured_at != ""
        assert record.captured_at != "2025-01-01T12:00:00+00:00"

    def test_compare_refs_deduplication(self, snapshot_service: SnapshotService):
        req = _make_create_request(compare_refs=["ref-a", "ref-b", "ref-a"])
        record = snapshot_service.create_snapshot(WORKSPACE, req)
        assert record.compare_refs == ["ref-a", "ref-b"]

    def test_thumbnail_rejected_if_not_data_url(self, snapshot_service: SnapshotService):
        req = _make_create_request(thumbnail_data_url="not-a-data-url")
        record = snapshot_service.create_snapshot(WORKSPACE, req)
        assert record.thumbnail_data_url == ""

    def test_thumbnail_accepted_if_valid_data_url(self, snapshot_service: SnapshotService):
        thumb = "data:image/jpeg;base64,/9j/abc"
        req = _make_create_request(thumbnail_data_url=thumb)
        record = snapshot_service.create_snapshot(WORKSPACE, req)
        assert record.thumbnail_data_url == thumb

    def test_thumbnail_rejected_if_oversized(self, snapshot_service: SnapshotService):
        oversized_thumb = f"data:image/png;base64,{'a' * SNAPSHOT_THUMBNAIL_MAX_LENGTH}"
        req = _make_create_request(thumbnail_data_url=oversized_thumb)
        record = snapshot_service.create_snapshot(WORKSPACE, req)
        assert record.thumbnail_data_url == ""


class TestSnapshotServiceList:
    def test_empty_workspace_returns_empty_list(self, snapshot_service: SnapshotService):
        results = snapshot_service.list_snapshots("unknown-workspace")
        assert results == []

    def test_lists_only_own_workspace(self, snapshot_service: SnapshotService):
        snapshot_service.create_snapshot(WORKSPACE, _make_create_request(name="A"))
        snapshot_service.create_snapshot("other-ws", _make_create_request(name="B"))

        results = snapshot_service.list_snapshots(WORKSPACE)
        assert len(results) == 1
        assert results[0].name == "A"

    def test_summary_has_no_thumbnail_data_url(self, snapshot_service: SnapshotService):
        thumb = "data:image/jpeg;base64,/9j/abc"
        snapshot_service.create_snapshot(WORKSPACE, _make_create_request(thumbnail_data_url=thumb))

        results = snapshot_service.list_snapshots(WORKSPACE)
        assert len(results) == 1
        summary = results[0]
        assert not hasattr(summary, "thumbnail_data_url") or not summary.model_fields.get("thumbnail_data_url")
        assert summary.has_thumbnail is True

    def test_pinned_first_ordering(self, snapshot_service: SnapshotService):
        a = snapshot_service.create_snapshot(WORKSPACE, _make_create_request(name="A"))
        b = snapshot_service.create_snapshot(WORKSPACE, _make_create_request(name="B"))
        # Pin B
        snapshot_service.update_snapshot(WORKSPACE, b.id, SnapshotUpdateRequest(is_pinned=True))

        from app.schemas.snapshots import SnapshotListQuery
        results = snapshot_service.list_snapshots(WORKSPACE, SnapshotListQuery(pinned_first=True))
        assert results[0].id == b.id
        assert results[1].id == a.id

    def test_archived_excluded_when_include_archived_false(self, snapshot_service: SnapshotService):
        a = snapshot_service.create_snapshot(WORKSPACE, _make_create_request(name="Active"))
        b = snapshot_service.create_snapshot(WORKSPACE, _make_create_request(name="Archived"))
        snapshot_service.update_snapshot(WORKSPACE, b.id, SnapshotUpdateRequest(archived=True))

        from app.schemas.snapshots import SnapshotListQuery
        results = snapshot_service.list_snapshots(WORKSPACE, SnapshotListQuery(include_archived=False))
        ids = [r.id for r in results]
        assert a.id in ids
        assert b.id not in ids

    def test_archived_included_by_default(self, snapshot_service: SnapshotService):
        b = snapshot_service.create_snapshot(WORKSPACE, _make_create_request(name="Archived"))
        snapshot_service.update_snapshot(WORKSPACE, b.id, SnapshotUpdateRequest(archived=True))

        from app.schemas.snapshots import SnapshotListQuery
        results = snapshot_service.list_snapshots(WORKSPACE, SnapshotListQuery(include_archived=True))
        ids = [r.id for r in results]
        assert b.id in ids

    def test_sort_by_captured_at_desc_orders_newest_first(self, snapshot_service: SnapshotService):
        older = snapshot_service.create_snapshot(
            WORKSPACE,
            _make_create_request(name="Older", captured_at="2026-04-20T10:00:00+00:00"),
        )
        newer = snapshot_service.create_snapshot(
            WORKSPACE,
            _make_create_request(name="Newer", captured_at="2026-04-20T11:00:00+00:00"),
        )

        from app.schemas.snapshots import SnapshotListQuery
        results = snapshot_service.list_snapshots(
            WORKSPACE,
            SnapshotListQuery(sort_by="captured_at", sort_order="desc", pinned_first=False),
        )
        assert [r.id for r in results[:2]] == [newer.id, older.id]

    def test_sort_by_captured_at_asc_orders_oldest_first(self, snapshot_service: SnapshotService):
        older = snapshot_service.create_snapshot(
            WORKSPACE,
            _make_create_request(name="Older", captured_at="2026-04-20T10:00:00+00:00"),
        )
        newer = snapshot_service.create_snapshot(
            WORKSPACE,
            _make_create_request(name="Newer", captured_at="2026-04-20T11:00:00+00:00"),
        )

        from app.schemas.snapshots import SnapshotListQuery
        results = snapshot_service.list_snapshots(
            WORKSPACE,
            SnapshotListQuery(sort_by="captured_at", sort_order="asc", pinned_first=False),
        )
        assert [r.id for r in results[:2]] == [older.id, newer.id]

    def test_sort_by_updated_at_desc_orders_newest_update_first(self, snapshot_service: SnapshotService):
        older_update = snapshot_service.create_snapshot(
            WORKSPACE,
            _make_create_request(name="Older update", captured_at="2026-04-20T10:00:00+00:00"),
        )
        newer_update = snapshot_service.create_snapshot(
            WORKSPACE,
            _make_create_request(name="Newer update", captured_at="2026-04-20T10:00:00+00:00"),
        )
        snapshot_service.update_snapshot(WORKSPACE, newer_update.id, SnapshotUpdateRequest(note="updated"))

        from app.schemas.snapshots import SnapshotListQuery
        results = snapshot_service.list_snapshots(
            WORKSPACE,
            SnapshotListQuery(sort_by="updated_at", sort_order="desc", pinned_first=False),
        )
        assert [r.id for r in results[:2]] == [newer_update.id, older_update.id]

    def test_sort_by_last_restored_at_desc_prefers_restored_and_pushes_never_restored_last(
        self,
        snapshot_service: SnapshotService,
    ):
        never_restored = snapshot_service.create_snapshot(WORKSPACE, _make_create_request(name="Never"))
        restored_older = snapshot_service.create_snapshot(WORKSPACE, _make_create_request(name="Older restore"))
        restored_newer = snapshot_service.create_snapshot(WORKSPACE, _make_create_request(name="Newer restore"))

        snapshot_service.record_restore_event(WORKSPACE, restored_older.id)
        snapshot_service.record_restore_event(WORKSPACE, restored_newer.id)

        from app.schemas.snapshots import SnapshotListQuery
        results = snapshot_service.list_snapshots(
            WORKSPACE,
            SnapshotListQuery(sort_by="last_restored_at", sort_order="desc", pinned_first=False),
        )
        assert [r.id for r in results[:3]] == [restored_newer.id, restored_older.id, never_restored.id]


class TestSnapshotServiceGet:
    def test_get_existing_snapshot(self, snapshot_service: SnapshotService):
        created = snapshot_service.create_snapshot(WORKSPACE, _make_create_request(name="X"))
        fetched = snapshot_service.get_snapshot(WORKSPACE, created.id)
        assert fetched.id == created.id
        assert fetched.name == "X"

    def test_get_includes_thumbnail(self, snapshot_service: SnapshotService):
        thumb = "data:image/jpeg;base64,/9j/abc"
        created = snapshot_service.create_snapshot(
            WORKSPACE, _make_create_request(thumbnail_data_url=thumb)
        )
        fetched = snapshot_service.get_snapshot(WORKSPACE, created.id)
        assert fetched.thumbnail_data_url == thumb

    def test_get_nonexistent_raises(self, snapshot_service: SnapshotService):
        with pytest.raises(SnapshotNotFoundError):
            snapshot_service.get_snapshot(WORKSPACE, "snap_does_not_exist")

    def test_get_wrong_workspace_raises(self, snapshot_service: SnapshotService):
        created = snapshot_service.create_snapshot(WORKSPACE, _make_create_request())
        with pytest.raises(SnapshotNotFoundError):
            snapshot_service.get_snapshot("other-ws", created.id)


class TestSnapshotServiceUpdate:
    def test_rename(self, snapshot_service: SnapshotService):
        created = snapshot_service.create_snapshot(WORKSPACE, _make_create_request(name="Old Name"))
        updated = snapshot_service.update_snapshot(
            WORKSPACE, created.id, SnapshotUpdateRequest(name="New Name")
        )
        assert updated.name == "New Name"
        assert updated.updated_at != created.updated_at

    def test_update_note(self, snapshot_service: SnapshotService):
        created = snapshot_service.create_snapshot(WORKSPACE, _make_create_request())
        updated = snapshot_service.update_snapshot(
            WORKSPACE, created.id, SnapshotUpdateRequest(note="new note")
        )
        assert updated.note == "new note"

    def test_pin_snapshot(self, snapshot_service: SnapshotService):
        created = snapshot_service.create_snapshot(WORKSPACE, _make_create_request())
        assert created.is_pinned is False
        updated = snapshot_service.update_snapshot(
            WORKSPACE, created.id, SnapshotUpdateRequest(is_pinned=True)
        )
        assert updated.is_pinned is True

    def test_archive_sets_archived_at(self, snapshot_service: SnapshotService):
        created = snapshot_service.create_snapshot(WORKSPACE, _make_create_request())
        updated = snapshot_service.update_snapshot(
            WORKSPACE, created.id, SnapshotUpdateRequest(archived=True)
        )
        assert updated.archived_at != ""

    def test_unarchive_clears_archived_at(self, snapshot_service: SnapshotService):
        created = snapshot_service.create_snapshot(WORKSPACE, _make_create_request())
        snapshot_service.update_snapshot(WORKSPACE, created.id, SnapshotUpdateRequest(archived=True))
        unarchived = snapshot_service.update_snapshot(
            WORKSPACE, created.id, SnapshotUpdateRequest(archived=False)
        )
        assert unarchived.archived_at == ""

    def test_update_nonexistent_raises(self, snapshot_service: SnapshotService):
        with pytest.raises(SnapshotNotFoundError):
            snapshot_service.update_snapshot(
                WORKSPACE, "snap_missing", SnapshotUpdateRequest(name="X")
            )

    def test_captured_at_immutable_after_rename(self, snapshot_service: SnapshotService):
        captured = "2025-06-01T10:00:00+00:00"
        created = snapshot_service.create_snapshot(
            WORKSPACE, _make_create_request(captured_at=captured)
        )
        snapshot_service.update_snapshot(WORKSPACE, created.id, SnapshotUpdateRequest(name="Renamed"))
        refetched = snapshot_service.get_snapshot(WORKSPACE, created.id)
        assert refetched.captured_at == captured


class TestSnapshotServiceRestoreEvent:
    def test_increments_restore_count(self, snapshot_service: SnapshotService):
        created = snapshot_service.create_snapshot(WORKSPACE, _make_create_request())
        assert created.restore_count == 0
        updated = snapshot_service.record_restore_event(WORKSPACE, created.id)
        assert updated.restore_count == 1
        updated2 = snapshot_service.record_restore_event(WORKSPACE, created.id)
        assert updated2.restore_count == 2

    def test_sets_last_restored_at(self, snapshot_service: SnapshotService):
        created = snapshot_service.create_snapshot(WORKSPACE, _make_create_request())
        assert created.last_restored_at == ""
        updated = snapshot_service.record_restore_event(WORKSPACE, created.id)
        assert updated.last_restored_at != ""

    def test_restore_nonexistent_raises(self, snapshot_service: SnapshotService):
        with pytest.raises(SnapshotNotFoundError):
            snapshot_service.record_restore_event(WORKSPACE, "snap_gone")


class TestSnapshotServiceDelete:
    def test_delete_removes_snapshot(self, snapshot_service: SnapshotService):
        created = snapshot_service.create_snapshot(WORKSPACE, _make_create_request())
        snapshot_service.delete_snapshot(WORKSPACE, created.id)
        with pytest.raises(SnapshotNotFoundError):
            snapshot_service.get_snapshot(WORKSPACE, created.id)

    def test_delete_nonexistent_raises(self, snapshot_service: SnapshotService):
        with pytest.raises(SnapshotNotFoundError):
            snapshot_service.delete_snapshot(WORKSPACE, "snap_gone")


# ===========================================================================
# Route-layer integration tests
# ===========================================================================

class TestSnapshotRouteCreate:
    def test_post_returns_201_or_200_with_id(self, client: TestClient):
        resp = client.post(f"/api/v1/workspaces/{WORKSPACE}/snapshots", json=_create_payload())
        assert resp.status_code in (200, 201)
        body = resp.json()
        assert body["id"].startswith("snap_")
        assert body["workspace_id"] == WORKSPACE

    def test_post_missing_name_returns_422(self, client: TestClient):
        payload = _create_payload()
        del payload["name"]
        resp = client.post(f"/api/v1/workspaces/{WORKSPACE}/snapshots", json=payload)
        assert resp.status_code == 422
        body = resp.json()
        assert body["ok"] is False
        assert body["status"] == "http-422"
        assert "message" in body

    def test_post_empty_name_returns_422(self, client: TestClient):
        # Build payload manually (bypassing Pydantic) so we can send an empty name
        payload = _create_payload(name="Valid")
        payload["name"] = ""  # override after construction
        resp = client.post(
            f"/api/v1/workspaces/{WORKSPACE}/snapshots",
            json=payload,
        )
        assert resp.status_code == 422


class TestSnapshotRouteList:
    def test_list_returns_200_with_items(self, client: TestClient):
        client.post(f"/api/v1/workspaces/{WORKSPACE}/snapshots", json=_create_payload(name="S1"))
        resp = client.get(f"/api/v1/workspaces/{WORKSPACE}/snapshots")
        assert resp.status_code == 200
        body = resp.json()
        assert body["ok"] is True
        assert body["workspace_id"] == WORKSPACE
        assert isinstance(body["items"], list)
        assert len(body["items"]) == 1

    def test_list_items_have_no_thumbnail_data_url(self, client: TestClient):
        thumb = "data:image/jpeg;base64,/9j/abc"
        client.post(
            f"/api/v1/workspaces/{WORKSPACE}/snapshots",
            json=_create_payload(thumbnail_data_url=thumb),
        )
        resp = client.get(f"/api/v1/workspaces/{WORKSPACE}/snapshots")
        item = resp.json()["items"][0]
        assert "thumbnail_data_url" not in item
        assert item["has_thumbnail"] is True

    def test_list_empty_workspace_returns_empty_items(self, client: TestClient):
        resp = client.get("/api/v1/workspaces/no-such-ws/snapshots")
        assert resp.status_code == 200
        assert resp.json()["items"] == []

    def test_list_respects_sort_by_and_sort_order_query(self, client: TestClient):
        client.post(
            f"/api/v1/workspaces/{WORKSPACE}/snapshots",
            json=_create_payload(name="Older", captured_at="2026-04-20T10:00:00+00:00"),
        )
        client.post(
            f"/api/v1/workspaces/{WORKSPACE}/snapshots",
            json=_create_payload(name="Newer", captured_at="2026-04-20T11:00:00+00:00"),
        )

        resp = client.get(
            f"/api/v1/workspaces/{WORKSPACE}/snapshots",
            params={"sort_by": "captured_at", "sort_order": "asc", "pinned_first": "false"},
        )
        assert resp.status_code == 200
        names = [item["name"] for item in resp.json()["items"]]
        assert names[:2] == ["Older", "Newer"]


class TestSnapshotRouteGet:
    def test_post_oversized_thumbnail_returns_record_without_thumbnail(self, client: TestClient):
        oversized_thumb = f"data:image/png;base64,{'a' * SNAPSHOT_THUMBNAIL_MAX_LENGTH}"
        resp = client.post(
            f"/api/v1/workspaces/{WORKSPACE}/snapshots",
            json=_create_payload(thumbnail_data_url=oversized_thumb),
        )
        assert resp.status_code == 200
        assert resp.json()["thumbnail_data_url"] == ""

    def test_get_returns_thumbnail(self, client: TestClient):
        thumb = "data:image/jpeg;base64,/9j/abc"
        created = client.post(
            f"/api/v1/workspaces/{WORKSPACE}/snapshots",
            json=_create_payload(thumbnail_data_url=thumb),
        ).json()

        resp = client.get(f"/api/v1/workspaces/{WORKSPACE}/snapshots/{created['id']}")
        assert resp.status_code == 200
        assert resp.json()["thumbnail_data_url"] == thumb

    def test_get_nonexistent_returns_404(self, client: TestClient):
        resp = client.get(f"/api/v1/workspaces/{WORKSPACE}/snapshots/snap_nope")
        assert resp.status_code == 404
        body = resp.json()
        assert body["ok"] is False
        assert body["status"] == "http-404"
        assert "message" in body


class TestSnapshotRoutePatch:
    def test_patch_name(self, client: TestClient):
        created = client.post(
            f"/api/v1/workspaces/{WORKSPACE}/snapshots", json=_create_payload(name="Before")
        ).json()
        resp = client.patch(
            f"/api/v1/workspaces/{WORKSPACE}/snapshots/{created['id']}",
            json={"name": "After"},
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "After"

    def test_patch_pin(self, client: TestClient):
        created = client.post(
            f"/api/v1/workspaces/{WORKSPACE}/snapshots", json=_create_payload()
        ).json()
        resp = client.patch(
            f"/api/v1/workspaces/{WORKSPACE}/snapshots/{created['id']}",
            json={"is_pinned": True},
        )
        assert resp.status_code == 200
        assert resp.json()["is_pinned"] is True

    def test_patch_nonexistent_returns_404(self, client: TestClient):
        resp = client.patch(
            f"/api/v1/workspaces/{WORKSPACE}/snapshots/snap_gone",
            json={"name": "X"},
        )
        assert resp.status_code == 404
        body = resp.json()
        assert body["ok"] is False
        assert body["status"] == "http-404"


class TestSnapshotRouteRestoreEvent:
    def test_post_restore_event_increments_count(self, client: TestClient):
        created = client.post(
            f"/api/v1/workspaces/{WORKSPACE}/snapshots", json=_create_payload()
        ).json()
        resp = client.post(
            f"/api/v1/workspaces/{WORKSPACE}/snapshots/{created['id']}/restore-events"
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["restore_count"] == 1
        assert body["last_restored_at"] != ""

    def test_post_restore_event_nonexistent_returns_404(self, client: TestClient):
        resp = client.post(
            f"/api/v1/workspaces/{WORKSPACE}/snapshots/snap_gone/restore-events"
        )
        assert resp.status_code == 404
        assert resp.json()["status"] == "http-404"


class TestSnapshotRouteDelete:
    def test_delete_returns_deleted_status(self, client: TestClient):
        created = client.post(
            f"/api/v1/workspaces/{WORKSPACE}/snapshots", json=_create_payload()
        ).json()
        resp = client.delete(
            f"/api/v1/workspaces/{WORKSPACE}/snapshots/{created['id']}"
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "deleted"
        assert body["snapshot_id"] == created["id"]

    def test_delete_nonexistent_returns_404(self, client: TestClient):
        resp = client.delete(f"/api/v1/workspaces/{WORKSPACE}/snapshots/snap_gone")
        assert resp.status_code == 404
        assert resp.json()["status"] == "http-404"

    def test_get_after_delete_returns_404(self, client: TestClient):
        created = client.post(
            f"/api/v1/workspaces/{WORKSPACE}/snapshots", json=_create_payload()
        ).json()
        client.delete(f"/api/v1/workspaces/{WORKSPACE}/snapshots/{created['id']}")
        resp = client.get(f"/api/v1/workspaces/{WORKSPACE}/snapshots/{created['id']}")
        assert resp.status_code == 404


class TestSnapshotListSortFilter:
    """Verify list query params (sort_by, pinned_first, include_archived)."""

    def _snap(self, client: TestClient, name: str) -> dict:
        return client.post(
            f"/api/v1/workspaces/{WORKSPACE}/snapshots", json=_create_payload(name=name)
        ).json()

    def test_pinned_first_true(self, client: TestClient):
        a = self._snap(client, "A")
        b = self._snap(client, "B")
        # Pin B
        client.patch(
            f"/api/v1/workspaces/{WORKSPACE}/snapshots/{b['id']}",
            json={"is_pinned": True},
        )
        resp = client.get(
            f"/api/v1/workspaces/{WORKSPACE}/snapshots",
            params={"pinned_first": "true"},
        )
        items = resp.json()["items"]
        assert items[0]["id"] == b["id"]

    def test_include_archived_false_hides_archived(self, client: TestClient):
        a = self._snap(client, "Active")
        b = self._snap(client, "Archived")
        client.patch(
            f"/api/v1/workspaces/{WORKSPACE}/snapshots/{b['id']}",
            json={"archived": True},
        )
        resp = client.get(
            f"/api/v1/workspaces/{WORKSPACE}/snapshots",
            params={"include_archived": "false"},
        )
        ids = [item["id"] for item in resp.json()["items"]]
        assert a["id"] in ids
        assert b["id"] not in ids


class TestSnapshotServiceCompare:
    def test_compare_returns_metadata_deltas(self, snapshot_service: SnapshotService):
        base = snapshot_service.create_snapshot(
            WORKSPACE,
            _make_create_request(
                name="Base",
                compare_refs=["node-a", "node-b"],
                selected_subscription_id="sub-a",
                resource_group_name="rg-a",
                visible_node_count=10,
                loaded_node_count=12,
                edge_count=5,
            ),
        )
        target = snapshot_service.create_snapshot(
            WORKSPACE,
            _make_create_request(
                name="Target",
                compare_refs=["node-b", "node-c"],
                selected_subscription_id="sub-a",
                resource_group_name="rg-b",
                visible_node_count=14,
                loaded_node_count=15,
                edge_count=9,
            ),
        )

        result = snapshot_service.compare_snapshots(WORKSPACE, base.id, target.id)

        assert result.base_snapshot_id == base.id
        assert result.target_snapshot_id == target.id
        assert result.count_delta.visible_node_count == 4
        assert result.count_delta.loaded_node_count == 3
        assert result.count_delta.edge_count == 4
        assert result.scope_delta.resource_group_changed is True
        assert result.scope_delta.subscription_changed is False
        assert result.compare_refs_delta.added == ["node-c"]
        assert result.compare_refs_delta.removed == ["node-a"]
        assert result.compare_refs_delta.unchanged == ["node-b"]
        assert "compare_refs +1 / -1" in result.summary

    def test_compare_missing_snapshot_raises(self, snapshot_service: SnapshotService):
        base = snapshot_service.create_snapshot(WORKSPACE, _make_create_request())
        with pytest.raises(SnapshotNotFoundError):
            snapshot_service.compare_snapshots(WORKSPACE, base.id, "snap_missing")


class TestSnapshotRouteCompare:
    def test_post_compare_returns_deltas(self, client: TestClient):
        base = client.post(
            f"/api/v1/workspaces/{WORKSPACE}/snapshots",
            json=_create_payload(
                name="Base",
                compare_refs=["node-a", "node-b"],
                visible_node_count=5,
                loaded_node_count=6,
                edge_count=3,
            ),
        ).json()
        target = client.post(
            f"/api/v1/workspaces/{WORKSPACE}/snapshots",
            json=_create_payload(
                name="Target",
                compare_refs=["node-b", "node-c"],
                visible_node_count=8,
                loaded_node_count=10,
                edge_count=4,
            ),
        ).json()

        resp = client.post(
            f"/api/v1/workspaces/{WORKSPACE}/snapshots/compare",
            json={"base_snapshot_id": base["id"], "target_snapshot_id": target["id"]},
        )

        assert resp.status_code == 200
        body = resp.json()
        assert body["ok"] is True
        assert body["base_snapshot_id"] == base["id"]
        assert body["target_snapshot_id"] == target["id"]
        assert body["count_delta"]["visible_node_count"] == 3
        assert body["count_delta"]["loaded_node_count"] == 4
        assert body["count_delta"]["edge_count"] == 1
        assert body["compare_refs_delta"]["added"] == ["node-c"]
        assert body["compare_refs_delta"]["removed"] == ["node-a"]

    def test_post_compare_missing_snapshot_returns_404(self, client: TestClient):
        base = client.post(
            f"/api/v1/workspaces/{WORKSPACE}/snapshots", json=_create_payload()
        ).json()
        resp = client.post(
            f"/api/v1/workspaces/{WORKSPACE}/snapshots/compare",
            json={"base_snapshot_id": base["id"], "target_snapshot_id": "snap_missing"},
        )
        assert resp.status_code == 404
        assert resp.json()["status"] == "http-404"


# ===========================================================================
# Topology Archive integration tests
# ===========================================================================

WORKSPACE = "local-demo"


class TestTopologyArchiveRoute:
    """Tests for POST /snapshots/{id}/topology-archive."""

    def test_store_topology_archive_returns_200(self, client: TestClient):
        snap = client.post(
            f"/api/v1/workspaces/{WORKSPACE}/snapshots",
            json=_create_payload(name="WithTopology"),
        ).json()

        topology = {
            "nodes": [
                {"node_key": "a", "display_name": "Node A", "source": "azure", "resource_type": "vm"},
                {"node_key": "b", "display_name": "Node B", "source": "azure", "resource_type": "db"},
            ],
            "edges": [
                {"source_node_key": "a", "target_node_key": "b", "relation_type": "contains", "source": "azure"},
            ],
        }

        resp = client.post(
            f"/api/v1/workspaces/{WORKSPACE}/snapshots/{snap['id']}/topology-archive",
            json={"topology": topology},
        )

        assert resp.status_code == 200
        body = resp.json()
        assert body["snapshot_id"] == snap["id"]
        assert body["workspace_id"] == WORKSPACE
        assert body["status"] == "stored"
        assert body["node_count"] == 2
        assert body["edge_count"] == 1
        assert body["topology_hash"] != ""

    def test_store_topology_archive_with_empty_topo(self, client: TestClient):
        snap = client.post(
            f"/api/v1/workspaces/{WORKSPACE}/snapshots",
            json=_create_payload(name="EmptyTopo"),
        ).json()

        resp = client.post(
            f"/api/v1/workspaces/{WORKSPACE}/snapshots/{snap['id']}/topology-archive",
            json={"topology": {"nodes": [], "edges": []}},
        )

        assert resp.status_code == 200
        body = resp.json()
        assert body["node_count"] == 0
        assert body["edge_count"] == 0

    def test_store_topology_archive_deterministic_hash(self, client: TestClient):
        snap = client.post(
            f"/api/v1/workspaces/{WORKSPACE}/snapshots",
            json=_create_payload(name="HashTest"),
        ).json()

        topology = {
            "nodes": [
                {"node_key": "b", "display_name": "B"},
                {"node_key": "a", "display_name": "A"},
            ],
            "edges": [{"source_node_key": "a", "target_node_key": "b", "relation_type": "contains"}],
        }

        resp1 = client.post(
            f"/api/v1/workspaces/{WORKSPACE}/snapshots/{snap['id']}/topology-archive",
            json={"topology": topology},
        )
        resp2 = client.post(
            f"/api/v1/workspaces/{WORKSPACE}/snapshots/{snap['id']}/topology-archive",
            json={"topology": topology},
        )

        assert resp1.status_code == 200
        assert resp2.status_code == 200
        # Same input → same hash (idempotent replace)
        assert resp1.json()["topology_hash"] == resp2.json()["topology_hash"]


class TestTopologyCompareRoute:
    """Tests for POST /snapshots/compare/topology."""

    def _snap(self, client: TestClient, name: str, topology=None) -> dict:
        payload = _create_payload(name=name)
        if topology:
            payload["topology"] = topology
        return client.post(
            f"/api/v1/workspaces/{WORKSPACE}/snapshots", json=payload
        ).json()

    def test_compare_topology_available(self, client: TestClient):
        snap_a = self._snap(client, "Base", {
            "nodes": [{"node_key": "a", "display_name": "A", "source": "azure"}],
            "edges": [{"source_node_key": "a", "target_node_key": "a", "relation_type": "self"}],
        })
        snap_b = self._snap(client, "Target", {
            "nodes": [
                {"node_key": "a", "display_name": "A", "source": "azure"},
                {"node_key": "b", "display_name": "B", "source": "azure"},
            ],
            "edges": [{"source_node_key": "a", "target_node_key": "b", "relation_type": "contains"}],
        })

        # Store archives
        client.post(
            f"/api/v1/workspaces/{WORKSPACE}/snapshots/{snap_a['id']}/topology-archive",
            json={"topology": {"nodes": [{"node_key": "a", "display_name": "A", "source": "azure"}], "edges": [{"source_node_key": "a", "target_node_key": "a", "relation_type": "self"}]}},
        )
        client.post(
            f"/api/v1/workspaces/{WORKSPACE}/snapshots/{snap_b['id']}/topology-archive",
            json={"topology": {"nodes": [{"node_key": "a", "display_name": "A", "source": "azure"}, {"node_key": "b", "display_name": "B", "source": "azure"}], "edges": [{"source_node_key": "a", "target_node_key": "b", "relation_type": "contains"}]}},
        )

        resp = client.post(
            f"/api/v1/workspaces/{WORKSPACE}/snapshots/compare/topology",
            json={"base_snapshot_id": snap_a["id"], "target_snapshot_id": snap_b["id"]},
        )

        assert resp.status_code == 200
        body = resp.json()
        assert body["ok"] is True
        assert body["archive_status"] == "available"
        assert body["base_snapshot_id"] == snap_a["id"]
        assert body["target_snapshot_id"] == snap_b["id"]
        assert len(body["node_delta"]["added"]) == 1
        assert body["node_delta"]["added"][0]["node_key"] == "b"
        assert any("+1" in s for s in body["summary"])

    def test_compare_topology_missing_archive_fallback(self, client: TestClient):
        snap_a = self._snap(client, "NoArchiveA")
        snap_b = self._snap(client, "NoArchiveB")

        resp = client.post(
            f"/api/v1/workspaces/{WORKSPACE}/snapshots/compare/topology",
            json={"base_snapshot_id": snap_a["id"], "target_snapshot_id": snap_b["id"]},
        )

        assert resp.status_code == 200
        body = resp.json()
        assert body["ok"] is False
        assert body["archive_status"] == "missing"
        assert any("archive" in s.lower() for s in body["summary"])

    def test_compare_topology_one_missing_archive(self, client: TestClient):
        snap_a = self._snap(client, "WithArchive", {
            "nodes": [{"node_key": "a", "display_name": "A"}],
            "edges": [],
        })
        snap_b = self._snap(client, "NoArchive", {
            "nodes": [{"node_key": "b", "display_name": "B"}],
            "edges": [],
        })

        # Only archive snap_a
        client.post(
            f"/api/v1/workspaces/{WORKSPACE}/snapshots/{snap_a['id']}/topology-archive",
            json={"topology": {"nodes": [{"node_key": "a", "display_name": "A"}], "edges": []}},
        )

        resp = client.post(
            f"/api/v1/workspaces/{WORKSPACE}/snapshots/compare/topology",
            json={"base_snapshot_id": snap_a["id"], "target_snapshot_id": snap_b["id"]},
        )

        assert resp.status_code == 200
        body = resp.json()
        assert body["archive_status"] == "missing"
