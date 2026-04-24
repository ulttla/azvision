# AzVision Data Model

## 설계 원칙
- 자동 수집 데이터와 수동 입력 데이터를 분리하되, 화면에서는 하나의 graph로 합친다
- 모든 데이터는 workspace 단위로 분리한다
- 현재 workspace는 single-user deployment 안의 프로젝트/scope 분리 단위이며, user/account/permission boundary가 아니다
- 관계는 source와 confidence를 가진다
- 그래프 node는 `node_type` + `node_ref`로 식별한다

> **Phase 1A 범위:** 아래 엔티티 중 Phase 1A core만 포함.
> **2026-04-10 update:** Phase 1B 중 `SnapshotRecord` persistence는 구현 반영 완료. CostSnapshot, SimulationRun, ExportJob은 여전히 future phase 참조용이다.

## 핵심 엔티티 (Phase 1A core)

### Workspace
- `id`
- `name`
- `company_name`
- `description`
- `created_at`

### CredentialProfile
- `id`
- `workspace_id`
- `provider` : Azure (1A 기준 고정)
- `auth_type` : app-only, certificate
- `metadata` : encrypted JSON (tenant, client, cert info)
- `created_at`

> Note: 1A에서는 API 범위가 아니다. 서버 설정으로 관리하며 API는 diagnostic endpoint만 노출.

### ScanRun
- `id`
- `workspace_id`
- `started_at`
- `finished_at`
- `status`
- `scope`
- `notes`

### Subscription
- `id` — 내부 PK
- `workspace_id`
- `subscription_id` — Azure 구독 ID (external)
- `display_name`
- `state`
- `tenant_id`

### ResourceGroup
- `id` — 내부 PK
- `workspace_id`
- `subscription_id` — Subscription.id (internal FK)
- `name`
- `location`
- `tags_json`
- `resource_id` — Azure ARM resource ID (external, node_ref용)

### ResourceNode
- `id` — 내부 PK
- `workspace_id`
- `subscription_id` — Subscription.id (internal FK)
- `resource_group_id` — ResourceGroup.id (internal FK, nullable)
- `resource_id` — Azure ARM resource ID (external, node_ref용)
- `resource_type`
- `display_name`
- `location`
- `tags_json`
- `source` — `azure`
- `confidence`

### RelationshipEdge
- `id` — 내부 PK
- `workspace_id`
- `source_node_key` — canonical graph identity (`<node_type>:<node_ref>`)
- `target_node_key` — canonical graph identity (`<node_type>:<node_ref>`)
- `relation_type`
- `source`
- `confidence`
- `notes`

### ManualNode
- `id` — 내부 PK
- `manual_ref` — 외부/public canonical ref (opaque id)
- `workspace_id`
- `display_name`
- `manual_type` — 사용자 정의 타입 (firewall, on-prem server, 3rd-party service 등)
- `vendor`
- `environment`
- `notes`
- `source` : `manual`
- `confidence` — 기본값 `1.0`

### ManualEdge
- `id` — 내부 PK
- `manual_edge_ref` — 외부/public canonical ref (opaque id)
- `workspace_id`
- `source_node_key` — canonical graph identity (`<node_type>:<node_ref>`)
- `target_node_key` — canonical graph identity (`<node_type>:<node_ref>`)
- `relation_type`
- `notes`
- `source` : `manual`
- `confidence` — 기본값 `1.0`

### SnapshotRecord (Phase 1B implemented)
- 목적: topology의 **current view state + metadata** 저장
- 비목적: live Azure topology raw payload 전체 archival
- `id` — snapshot public id
- `workspace_id`
- `preset_version`
- `name`
- `note`
- `compare_refs_json` — SQLite persistence 컬럼, API에서는 `compare_refs: string[]` 로 노출
- `cluster_children`
- `scope` — `visible` | `child-only` | `collapsed-preview`
- `query_text` — SQLite persistence 컬럼, API에서는 `query` 로 노출
- `selected_subscription_id` — snapshot capture 시점 subscription scope
- `resource_group_name` — snapshot capture 시점 RG scope
- `topology_generated_at`
- `visible_node_count`
- `loaded_node_count`
- `edge_count`
- `thumbnail_data_url` — optional, inline data URL
- `captured_at` — immutable capture time
- `created_at`
- `updated_at` — rename/note/pin/archive 변경 시점
- `last_restored_at` — 마지막 restore 시점
- `restore_count` — restore usage count
- `is_pinned`
- `archived_at`
- 후속 history foundation 메모는 `docs/SNAPSHOT_HISTORY_FOUNDATION_PLAN.md` 참조
- API 응답 메모
  - snapshot list는 summary record를 사용하며 `thumbnail_data_url` 를 제외하고 `has_thumbnail` 를 포함한다
  - single snapshot GET은 `thumbnail_data_url` 를 포함한다

## Graph Node Identity (1A 기준)
- graph의 **public / canonical identity** 는 `node_key = <node_type>:<node_ref>` 이다
- `node_key`는 topology API, edge payload, export payload에서 공통으로 사용한다
- DB 내부 PK(`Subscription.id`, `ResourceGroup.id`, `ResourceNode.id`, `ManualNode.id`)는 persistence 전용이다
- edge는 내부 PK가 아니라 `source_node_key`, `target_node_key`로 node를 참조한다
- `node_type` / `node_ref` 규칙:
  - `subscription` → `node_ref = Subscription.subscription_id`
  - `resourcegroup` → `node_ref = ResourceGroup.resource_id`
  - `resource` → `node_ref = ResourceNode.resource_id`
  - `manual` → `node_ref = ManualNode.manual_ref`
- graph layer는 개별 엔티티 테이블을 합쳐 topology projection을 생성하며, 별도 통합 `GraphNode` 테이블은 1A 범위에 포함하지 않는다

## Topology Projection 기본 규칙
- topology payload의 모든 node는 `source` 와 `confidence` 를 포함한다
- 기본값 규칙:
  - `subscription`: `source = azure`, `confidence = 1.0`
  - `resourcegroup`: `source = azure`, `confidence = 1.0`
  - `resource`: 저장값 사용 (`source`, `confidence`)
  - `manual`: `source = manual`, `confidence = 1.0` 또는 사용자 입력값
- topology payload의 모든 edge는 `source` 와 `confidence` 를 포함한다
- `RelationshipEdge`는 저장값 사용
- `ManualEdge`는 `source = manual`, `confidence = 1.0` 또는 사용자 입력값 사용

## 관계 규칙
- Subscription contains ResourceGroup
- ResourceGroup contains ResourceNode
- ResourceNode connects to ResourceNode
- ManualNode can connect to ResourceNode or ManualNode

## confidence / source 모델
- `source = azure` : Azure API에서 직접 획득
- `source = manual` : 사용자 수동 입력
- `source = arc` : Azure Arc 연결 자산 (Phase 1B)
- `source = inferred` : 관계 추론 결과 (향후)

## Future phase 엔티티 (참조용)

### CostSnapshot
- `id`
- `workspace_id`
- `resource_id`
- `sku`
- `region`
- `estimated_monthly_cost`
- `currency`
- `source`

### SimulationRun
- `id`
- `workspace_id`
- `scenario_name`
- `input_json`
- `result_json`
- `created_at`

### ExportJob
- `id`
- `workspace_id`
- `export_type`
- `format`
- `status`
- `output_path`
- `created_at`

## Snapshot persistence 규칙 (Phase 1B)
- snapshot은 **view state + metadata**만 저장한다
- 현재 metadata에는 `selected_subscription_id`, `resource_group_name` 같은 inventory scope가 포함된다
- restore는 저장된 state를 적용한 뒤 현재 live topology를 다시 사용한다
- `storageKind(local|server)` 구분은 frontend view model/adapter 레벨에서만 사용하며, 현재 backend DB 컬럼에는 포함하지 않는다
- thumbnail은 optional이며, 과도한 base64 payload 장기 보관은 추후 별도 최적화 대상으로 둔다
- history foundation 1차 구현으로 `captured_at`, `last_restored_at`, `restore_count`, `is_pinned`, `archived_at` 운영 메타를 반영했다
- restore usage는 `POST /snapshots/{snapshot_id}/restore-events` 로 명시적으로 기록한다

## 이후 확장 포인트
- historical snapshot timeline
- diff between scans
- multi-tenant isolation (productization 단계 보류)
- role-based access control (productization 단계 보류)
