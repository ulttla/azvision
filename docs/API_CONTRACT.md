# AzVision API Contract

> **MVP note:** 초기는 이 계약의 하위 집합만 구현한다. topology / manual modeling / PNG export부터 먼저 연다.
> **2026-04-10 update:** Phase 1B 중 `snapshot persistence` endpoint는 구현 반영 완료. 그 외 Phase 1B / Phase 2 / Phase 3 endpoint는 future section에 참조로만 기록.

## Base
- `/api/v1`

## Phase 1A core endpoints

### Workspaces
- `GET /workspaces`
- `POST /workspaces`
- `GET /workspaces/{workspace_id}`
- `PATCH /workspaces/{workspace_id}`

### Auth diagnostics
> 1A에서 credential은 server-side configured profile로 관리. API는 진단용 read만.
- `GET /auth/config-check`
- `GET /auth/read-test`

### Scans
- `POST /workspaces/{workspace_id}/scans`
- `GET /workspaces/{workspace_id}/scans`
- `GET /workspaces/{workspace_id}/scans/{scan_id}`

### Inventory
- `GET /workspaces/{workspace_id}/subscriptions`
- `GET /workspaces/{workspace_id}/resources`
- `GET /workspaces/{workspace_id}/resource-groups`

### Topology
- `GET /workspaces/{workspace_id}/topology`
  - 응답: `nodes` / `edges` 구조
  - 각 node 필수 필드: `node_key`, `node_type`, `node_ref`, `display_name`, `source`, `confidence`
  - 각 edge 필수 필드: `source_node_key`, `target_node_key`, `relation_type`, `source`, `confidence`
- `GET /workspaces/{workspace_id}/topology/node-detail?node_type={node_type}&node_ref={node_ref}`
  - topology detail 조회는 canonical identity 기준
  - 내부 PK는 public API에 노출하지 않음
- `POST /workspaces/{workspace_id}/topology/manual-nodes`
- `POST /workspaces/{workspace_id}/topology/manual-edges`
- `PATCH /workspaces/{workspace_id}/topology/manual-nodes/{manual_node_ref}`
  - `manual_node_ref`는 DB PK가 아니라 `ManualNode.manual_ref`
- `PATCH /workspaces/{workspace_id}/topology/manual-edges/{manual_edge_ref}`
  - `manual_edge_ref`는 DB PK가 아니라 `ManualEdge.manual_edge_ref`
- `DELETE /workspaces/{workspace_id}/topology/manual-nodes/{manual_node_ref}`
- `DELETE /workspaces/{workspace_id}/topology/manual-edges/{manual_edge_ref}`

### Export
- `POST /workspaces/{workspace_id}/exports`
  - format: `png` | `pdf`
  - request body: `format`, `image_data_url` (base64 data URL; PNG image for `png`, PDF data URL for `pdf`)
  - 응답: `format`, `status`, `output_path`
- `GET /workspaces/{workspace_id}/exports`
  - 모든 형식(png, pdf)의 export 목록 반환
- `GET /workspaces/{workspace_id}/exports/{export_id}`
  - export_id에 해당하는 형식 자동 감지

### Snapshots (Phase 1B implemented)
- `GET /workspaces/{workspace_id}/snapshots`
  - 응답: `items[]` (`SnapshotRecord`)
- `POST /workspaces/{workspace_id}/snapshots`
  - request: `preset_version`, `name`, `note`, `compare_refs`, `cluster_children`, `scope`, `query`, `resource_group_name`, `topology_generated_at`, `visible_node_count`, `loaded_node_count`, `edge_count`, `thumbnail_data_url`
  - 응답: `SnapshotRecord`
- `GET /workspaces/{workspace_id}/snapshots/{snapshot_id}`
  - 응답: `SnapshotRecord`
- `PATCH /workspaces/{workspace_id}/snapshots/{snapshot_id}`
  - patch 가능 필드: `name`, `note`
  - 응답: `SnapshotRecord`
- `DELETE /workspaces/{workspace_id}/snapshots/{snapshot_id}`
  - 응답: `workspace_id`, `snapshot_id`, `status=deleted`

## Future phase endpoints (참조용)

### Cost (Phase 2)
- `GET /workspaces/{workspace_id}/cost/summary`
- `GET /workspaces/{workspace_id}/cost/resources`
- `POST /workspaces/{workspace_id}/cost/recommendations`

### Simulation (Phase 3)
- `POST /workspaces/{workspace_id}/simulations`
- `GET /workspaces/{workspace_id}/simulations`
- `GET /workspaces/{workspace_id}/simulations/{simulation_id}`

### Copilot (Phase 3)
- `POST /workspaces/{workspace_id}/chat`

## Response shape principles
- 모든 핵심 목록 응답은 `items` 배열을 포함한다
- graph 응답은 `nodes` / `edges` 구조를 사용한다
- manual 데이터는 `source = manual` 로 명시한다
- topology node 응답은 `node_key`, `node_type`, `node_ref`, `source`, `confidence` 를 항상 포함한다
- topology edge 응답은 `source_node_key`, `target_node_key`, `relation_type`, `source`, `confidence` 를 항상 포함한다
- manual node의 canonical ref는 `ManualNode.manual_ref`, manual edge의 canonical ref는 `ManualEdge.manual_edge_ref` 를 사용한다
- 비용 응답은 `currency` 와 `period` 를 포함한다 (Phase 2)
- export 응답은 `format`, `status`, `output_path` 를 포함한다
- snapshot list 응답은 `items` 배열을 포함한다
- snapshot record 응답은 `id`, `workspace_id`, `name`, `compare_refs`, `cluster_children`, `scope`, `query`, `resource_group_name`, `topology_generated_at`, `visible_node_count`, `loaded_node_count`, `edge_count`, `created_at`, `updated_at` 를 포함한다
- snapshot delete 응답은 `workspace_id`, `snapshot_id`, `status` 를 포함한다
