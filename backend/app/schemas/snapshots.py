from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

SNAPSHOT_NAME_MAX_LENGTH = 120
SNAPSHOT_NOTE_MAX_LENGTH = 2000
SNAPSHOT_THUMBNAIL_MAX_LENGTH = 500 * 1024
VALID_SEARCH_SCOPES = {"visible", "child-only", "collapsed-preview"}


class SnapshotBase(BaseModel):
    preset_version: int = Field(default=1, ge=1)
    name: str = Field(..., min_length=1, max_length=SNAPSHOT_NAME_MAX_LENGTH)
    note: str = Field(default="", max_length=SNAPSHOT_NOTE_MAX_LENGTH)
    compare_refs: list[str] = Field(default_factory=list)
    cluster_children: bool = True
    scope: Literal["visible", "child-only", "collapsed-preview"] = "visible"
    query: str = ""
    selected_subscription_id: str = ""
    resource_group_name: str = ""
    topology_generated_at: str = ""
    visible_node_count: int = Field(default=0, ge=0)
    loaded_node_count: int = Field(default=0, ge=0)
    edge_count: int = Field(default=0, ge=0)
    thumbnail_data_url: str = ""

    @field_validator(
        "name",
        "note",
        "query",
        "selected_subscription_id",
        "resource_group_name",
        "topology_generated_at",
        mode="before",
    )
    @classmethod
    def _normalize_strings(cls, value: object) -> str:
        return str(value or "").strip()

    @field_validator("compare_refs", mode="before")
    @classmethod
    def _normalize_compare_refs(cls, value: object) -> list[str]:
        if not isinstance(value, list):
            return []

        seen: set[str] = set()
        refs: list[str] = []
        for item in value:
            ref = str(item or "").strip()
            if not ref or ref in seen:
                continue
            seen.add(ref)
            refs.append(ref)
        return refs

    @field_validator("thumbnail_data_url", mode="before")
    @classmethod
    def _normalize_thumbnail(cls, value: object) -> str:
        thumbnail_data_url = str(value or "").strip()
        if not thumbnail_data_url:
            return ""
        if not thumbnail_data_url.startswith("data:image/"):
            return ""
        if len(thumbnail_data_url) > SNAPSHOT_THUMBNAIL_MAX_LENGTH:
            return ""
        return thumbnail_data_url


class SnapshotCreateRequest(SnapshotBase):
    # Optional: caller may supply the original capture timestamp (e.g. on local→server import).
    # When omitted the service uses the current UTC time.
    captured_at: str | None = None


class SnapshotUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=SNAPSHOT_NAME_MAX_LENGTH)
    note: str | None = Field(default=None, max_length=SNAPSHOT_NOTE_MAX_LENGTH)
    is_pinned: bool | None = None
    archived: bool | None = None

    @field_validator("name", "note", mode="before")
    @classmethod
    def _normalize_optional_strings(cls, value: object) -> str | None:
        if value is None:
            return None
        return str(value).strip()


class SnapshotRecord(SnapshotBase):
    id: str
    workspace_id: str
    captured_at: str
    created_at: str
    updated_at: str
    last_restored_at: str = ""
    restore_count: int = Field(default=0, ge=0)
    is_pinned: bool = False
    archived_at: str = ""


class SnapshotListQuery(BaseModel):
    sort_by: Literal["updated_at", "captured_at", "last_restored_at"] = "last_restored_at"
    sort_order: Literal["asc", "desc"] = "desc"
    include_archived: bool = True
    pinned_first: bool = True


class SnapshotSummaryRecord(BaseModel):
    """Snapshot record without thumbnail_data_url for list responses."""
    id: str
    workspace_id: str
    preset_version: int = 1
    name: str
    note: str = ""
    compare_refs: list[str] = Field(default_factory=list)
    cluster_children: bool = True
    scope: str = "visible"
    query: str = ""
    selected_subscription_id: str = ""
    resource_group_name: str = ""
    topology_generated_at: str = ""
    visible_node_count: int = 0
    loaded_node_count: int = 0
    edge_count: int = 0
    has_thumbnail: bool = False
    captured_at: str = ""
    created_at: str = ""
    updated_at: str = ""
    last_restored_at: str = ""
    restore_count: int = 0
    is_pinned: bool = False
    archived_at: str = ""


class SnapshotListResponse(BaseModel):
    ok: bool = True
    workspace_id: str
    items: list[SnapshotSummaryRecord]


class SnapshotCompareRequest(BaseModel):
    base_snapshot_id: str = Field(..., min_length=1)
    target_snapshot_id: str = Field(..., min_length=1)

    @field_validator("base_snapshot_id", "target_snapshot_id", mode="before")
    @classmethod
    def _normalize_snapshot_ids(cls, value: object) -> str:
        return str(value or "").strip()


class SnapshotCompareRefDelta(BaseModel):
    added: list[str] = Field(default_factory=list)
    removed: list[str] = Field(default_factory=list)
    unchanged: list[str] = Field(default_factory=list)


class SnapshotCompareCountDelta(BaseModel):
    visible_node_count: int = 0
    loaded_node_count: int = 0
    edge_count: int = 0


class SnapshotCompareScopeDelta(BaseModel):
    scope_changed: bool = False
    query_changed: bool = False
    subscription_changed: bool = False
    resource_group_changed: bool = False


class SnapshotCompareResponse(BaseModel):
    ok: bool = True
    workspace_id: str
    base_snapshot_id: str
    target_snapshot_id: str
    base_name: str
    target_name: str
    base_captured_at: str
    target_captured_at: str
    count_delta: SnapshotCompareCountDelta
    scope_delta: SnapshotCompareScopeDelta
    compare_refs_delta: SnapshotCompareRefDelta
    summary: list[str] = Field(default_factory=list)
