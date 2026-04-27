# AzVision API Contract

> **MVP note:** 초기는 이 계약의 하위 집합만 구현한다. topology / manual modeling / PNG export부터 먼저 연다.
> **2026-04-10 update:** Phase 1B 중 `snapshot persistence` endpoint는 구현 반영 완료. 그 외 Phase 1B / Phase 2 / Phase 3 endpoint는 future section에 참조로만 기록.
> **2026-04-15 update:** local dev 기준 `frontend/vite.config.ts`의 `envDir: '..'` 경로와 server snapshot empty-state copy 보정이 반영되어, root `.env` 기반 server snapshot mode 검증 흐름과 현재 문서 상태가 다시 일치한다.

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
- `GET /workspaces/{workspace_id}/inventory-summary`
  - query: `subscription_id`, `resource_group_name`, `resource_group_limit`, `resource_limit`
  - 응답: `summary.subscription_count`, `summary.resource_group_count`, `summary.resource_count` + `items.subscriptions[]`, `items.resource_groups[]`, `items.resources[]`

### Topology
- `GET /workspaces/{workspace_id}/topology`
  - 응답: `nodes` / `edges` 구조
  - 각 node 필수 필드: `node_key`, `node_type`, `node_ref`, `display_name`, `source`, `confidence`
  - 각 edge 필수 필드: `source_node_key`, `target_node_key`, `relation_type`, `source`, `confidence`
  - Azure ID 기반 명시 관계는 `source=azure-explicit`, `confidence=1.0`, `resolver=network-explicit-v1`, `evidence[]` 를 포함한다. 현재 명시 관계 resolver는 ARM property의 resource ID reference에서 양 끝 node가 모두 현재 topology resource set에 있을 때만 edge를 만든다. 포함 범위: VM↔NIC, NIC↔Subnet/Public IP, NSG↔NIC/Subnet, Route Table↔Subnet, VNet↔Subnet/peering, Private Endpoint↔Subnet/target, LB/AppGW frontend/backend references.
  - live inventory 수집은 network/compute 주요 타입에 대해 detail GET을 best-effort로 수행해 relationship property를 보강한다. detail 조회 실패는 base inventory 실패로 승격하지 않고 resource-level `detail_warning` 으로 보존한다.
  - 이름/타입 기반 추론 관계는 `include_network_inference=true`일 때만 추가되며, 동일한 `source_node_key`/`target_node_key`/`relation_type` 명시 edge가 있으면 중복 추론 edge는 생략한다.
- `GET /workspaces/{workspace_id}/topology/node-detail?node_type={node_type}&node_ref={node_ref}`
  - topology detail 조회는 canonical identity 기준
  - 내부 PK는 public API에 노출하지 않음
- `GET /workspaces/{workspace_id}/topology/manual-nodes`
  - workspace 기준 manual node 목록 조회
  - 응답: `workspace_id`, `items[]`
- `POST /workspaces/{workspace_id}/topology/manual-nodes`
- `GET /workspaces/{workspace_id}/topology/manual-edges`
  - workspace 기준 manual edge 목록 조회
  - 응답: `workspace_id`, `items[]`
- `POST /workspaces/{workspace_id}/topology/manual-edges`
- `PATCH /workspaces/{workspace_id}/topology/manual-nodes/{manual_node_ref}`
  - `manual_node_ref`는 DB PK가 아니라 `ManualNode.manual_ref`
- `PATCH /workspaces/{workspace_id}/topology/manual-edges/{manual_edge_ref}`
  - `manual_edge_ref`는 DB PK가 아니라 `ManualEdge.manual_edge_ref`
- `DELETE /workspaces/{workspace_id}/topology/manual-nodes/{manual_node_ref}`
- `DELETE /workspaces/{workspace_id}/topology/manual-edges/{manual_edge_ref}`

### Network path analysis (MVP first-pass implemented)
- `GET /workspaces/{workspace_id}/path-analysis`
  - query: `source_resource_id`, `destination_resource_id`, optional `subscription_id`, `resource_group_name`, `resource_limit`, `protocol`, `source_address_prefix`, `destination_address_prefix`, `destination_port`
  - 응답: `ok`, `source_resource_id`, `destination_resource_id`, `overall_verdict`, `path_candidates[]`, `warnings[]`
  - `overall_verdict`: `allowed` | `blocked` | `unknown`
  - 현재 MVP는 Azure explicit topology edge 중 traffic-carrying `connects_to` 관계만 path tracing에 사용하고, NSG `secures` / route table `routes` 관계는 hop classification의 control data로만 사용한다.
  - NSG rule은 source 쪽 outbound와 destination 쪽 inbound를 모두 평가한다. NIC와 subnet에 NSG가 함께 연결된 경우 둘 다 effective NSG evidence로 반영하며, 둘 중 하나라도 `blocked`면 path를 `blocked`로 본다. `defaultSecurityRules`가 inventory payload에 없으면 Azure 기본 NSG rule을 내부적으로 보강한다.
  - optional `protocol` / `source_address_prefix` / `destination_address_prefix` / `destination_port`가 들어오면 rule의 protocol, source/destination prefix, destination port/range를 보수적으로 필터링한다. hop 응답에는 기존 `nsg_verdict` 외에 `nsg_direction`, `nsg_outbound_verdict`, `nsg_outbound_name`, `nsg_outbound_rule_name`가 포함될 수 있다.
  - Azure service tag는 `VirtualNetwork`, `Internet`, `AzureLoadBalancer`, `Storage` 등 주요 tag에 대해 static approximation으로 해석한다. 모르는 tag나 해석 불가능한 prefix는 `unknown` 쪽으로 남긴다.
  - route table은 `properties.routes[]`를 읽고 `nextHopType=None` black-hole route를 `blocked`로 본다. CIDR 포함 관계는 Python stdlib `ipaddress` 기반으로 해석하며, route table address prefix의 주요 Azure service tag도 같은 방식으로 해석한다. 고급 next-hop semantics는 future work이다.
  - source/destination 미발견, path 미발견, NSG/route data 부족 또는 해석 불확실성은 `unknown`으로 반환한다. 즉, 데이터가 없을 때 `allowed`로 가정하지 않는다.

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
  - query: `sort_by=updated_at|captured_at|last_restored_at`, `sort_order=asc|desc`, `include_archived=true|false`, `pinned_first=true|false`
  - 기본값: `sort_by=last_restored_at`, `sort_order=desc`, `include_archived=true`, `pinned_first=true`
  - `include_archived=true` 기본값은 frontend tab badge count를 위해 전체 목록이 필요하므로 유지. client-side에서 tab별 filtering 수행
  - 응답: `ok`, `workspace_id`, `items[]` (`SnapshotSummaryRecord` — `thumbnail_data_url` 제외, `has_thumbnail` 포함, payload 절감)
- `POST /workspaces/{workspace_id}/snapshots`
  - request: `preset_version`, `name`, `note`, `compare_refs`, `cluster_children`, `scope`, `query`, `selected_subscription_id`, `resource_group_name`, `topology_generated_at`, `visible_node_count`, `loaded_node_count`, `edge_count`, `thumbnail_data_url`, `captured_at` (optional — when provided, preserved as-is; used on local→server import to carry the original capture timestamp)
  - thumbnail guard: backend는 `thumbnail_data_url` 이 `data:image/` 로 시작하지 않거나 문자열 길이가 `512000` (`500 * 1024`)를 초과하면 값을 `""` 로 sanitize 하고 snapshot 저장 자체는 계속 진행한다. caller는 create/detail 응답의 `thumbnail_data_url=""` 와 list summary의 `has_thumbnail=false` 로 sanitize 결과를 확인할 수 있다
  - 응답: `SnapshotRecord` (thumbnail 포함)
- `GET /workspaces/{workspace_id}/snapshots/{snapshot_id}`
  - 응답: `SnapshotRecord` (thumbnail 포함)
- `PATCH /workspaces/{workspace_id}/snapshots/{snapshot_id}`
  - patch 가능 필드: `name`, `note`, `is_pinned`, `archived`
  - `archived=true`면 `archived_at` 설정, `archived=false`면 archive 해제
  - 응답: `SnapshotRecord`
- `POST /workspaces/{workspace_id}/snapshots/{snapshot_id}/restore-events`
  - snapshot restore usage 기록
  - side effect: `last_restored_at`, `restore_count` 갱신
  - 응답: `SnapshotRecord`
- `DELETE /workspaces/{workspace_id}/snapshots/{snapshot_id}`
  - 응답: `workspace_id`, `snapshot_id`, `status=deleted`

## Future phase endpoints (참조용)

### Cost (Phase 2 first-pass implemented)
- `GET /workspaces/{workspace_id}/cost/summary`
  - query: `subscription_id`, `resource_group_name`, `resource_group_limit`, `resource_limit`
  - 응답: `ok`, `workspace_id`, `mode`, `summary`
  - 현재 `summary.estimated_monthly_cost` 와 `summary.currency` 는 실제 Azure Cost Management 수집 전까지 `null` 이며, `cost_status=unknown-cost-data` 로 명시한다
  - `summary.cost_driver_counts` 와 `summary.governance_gap_count` 로 금액 추정 없이 비용 검토 우선순위 signal을 제공한다
  - `summary.cost_ingestion_provider=noop`, `summary.cost_ingestion_configured=false` 로 향후 Azure Cost Management provider 교체 지점을 명시한다
- `GET /workspaces/{workspace_id}/cost/resources`
  - 응답: `items[]` with `resource_id`, `resource_name`, `resource_type`, `cost_status`, `cost_driver_labels[]`, `recommendation_count`
- `POST /workspaces/{workspace_id}/cost/recommendations`
  - 응답: rule-based recommendation `items[]` with `rule_id`, `category`, `severity`, `resource_id`, `title`, `recommendation`, `evidence`, `confidence`
  - 현재는 Azure Cost Management 금액 수집이 아니라 topology/inventory 기반 triage recommendation이다

### Simulation (Phase 3 first-pass implemented)
- `POST /workspaces/{workspace_id}/simulations`
  - request: `workload_name`, `environment`, `description` 또는 `message`
  - 응답: `ok`, `workspace_id`, `simulation_id`, `status=generated`, `mode=rule-based`, `recommended_resources[]`, `architecture_notes[]`, `cost_considerations[]`, `security_considerations[]`, `next_actions[]`, `assumptions[]`
  - 현재는 SQLite persistence 기반 first pass이며 deployment template/pricing calculation은 아직 미구현
- `GET /workspaces/{workspace_id}/simulations`
  - workspace별로 저장된 simulation 목록 반환
- `GET /workspaces/{workspace_id}/simulations/{simulation_id}`
- `GET /workspaces/{workspace_id}/simulations/{simulation_id}/template`
  - 응답: `format=bicep-outline`, `deployable=false`, `content`, `resources[]`, `warnings[]`
  - 현재 template은 IaC planning skeleton이며 실제 배포용 템플릿이 아니다.
- `GET /workspaces/{workspace_id}/simulations/{simulation_id}/fit`
  - 현재 inventory resource type과 simulation recommended resource type을 비교해 `covered_count`, `missing_required_count`, `missing_recommended_count`, `items[]` 를 반환한다.
- `GET /workspaces/{workspace_id}/simulations/{simulation_id}/report`
  - 응답: `report_type=markdown`, `title`, `content`, `warnings[]`
  - 현재 report는 simulation 결과 기반 전달용 markdown 초안이다.

### Copilot (Phase 3 first-pass implemented)
- `POST /workspaces/{workspace_id}/chat`
  - request: `message`
  - query: `subscription_id`, `resource_group_name`, `resource_group_limit`, `resource_limit`
  - 응답: `ok`, `workspace_id`, `mode`(inventory mode), `copilot_mode`, `provider`, `llm_status`, `answer`, `suggestions[]`, `context`
  - 현재는 `llm_status=not_configured` 인 rule-based copilot first pass이며, 외부 LLM provider/BYOK 연결은 아직 미구현

## Response shape principles
- 모든 핵심 목록 응답은 `ok`, `workspace_id`, `items` 배열을 기본으로 포함한다
- graph 응답은 `nodes` / `edges` 구조를 사용한다
- manual 데이터는 `source = manual` 로 명시한다
- topology node 응답은 `node_key`, `node_type`, `node_ref`, `source`, `confidence` 를 항상 포함한다
- topology edge 응답은 `source_node_key`, `target_node_key`, `relation_type`, `source`, `confidence` 를 항상 포함한다
- manual node의 canonical ref는 `ManualNode.manual_ref`, manual edge의 canonical ref는 `ManualEdge.manual_edge_ref` 를 사용한다
- 비용 응답은 `currency` 와 `period` 를 포함한다 (Phase 2)
- export 응답은 `format`, `status`, `output_path` 를 포함한다
- snapshot list 응답은 `ok`, `workspace_id`, `items` 배열을 포함한다
- snapshot summary record는 `has_thumbnail` 를 포함하며, list 응답에는 `thumbnail_data_url` 를 싣지 않는다
- snapshot record 응답은 `id`, `workspace_id`, `name`, `compare_refs`, `cluster_children`, `scope`, `query`, `selected_subscription_id`, `resource_group_name`, `topology_generated_at`, `visible_node_count`, `loaded_node_count`, `edge_count`, `thumbnail_data_url`, `captured_at`, `created_at`, `updated_at`, `last_restored_at`, `restore_count`, `is_pinned`, `archived_at` 를 포함한다
- snapshot delete 응답은 `workspace_id`, `snapshot_id`, `status` 를 포함한다
- non-2xx backend 응답은 기본적으로 JSON body `{ ok: false, status, message }` shape를 사용한다
  - `raise HTTPException(status_code=N, detail="...")` 도 동일한 JSON envelope로 정규화된다
  - 예: `404` → `{ ok: false, status: "http-404", message: "Snapshot not found" }`
  - `502` (Azure/upstream failures surfaced through `AzureClientError` subclasses): `{ ok: false, status: "azure-error", message: "<upstream error>" }`
  - `503` (service not configured): `{ ok: false, status: "http-503", message: "<config error>" }`
  - `500` (unexpected): `{ ok: false, status: "http-500", message: "<error>" }`
  - `422` (FastAPI request validation): `{ ok: false, status: "http-422", message: "<field>: <msg>" }` — FastAPI default 422 shape가 아닌 동일 envelope로 정규화됨
  - `AzureClientError` / `AzureInventoryError` / `AzureReadTestError` (subclass): global handler → `502` with `status: "azure-error"`
- **2026-04-19 hardening:** 모든 route에서 `return build_error_response(...)` (HTTP 200 with ok=false) 패턴 제거. 이제 모든 오류는 non-2xx status code를 사용한다. Error response body에는 더 이상 route-specific 필드(`items`, `nodes`, `summary` 등)가 포함되지 않으며 `{ ok, status, message }`만 반환한다. 이 변경은 frontend `fetchJson`의 non-2xx `message` 읽기 패턴과 호환된다.
- frontend `fetchJson`은 non-2xx JSON body의 `message`를 읽어 `ApiError.message`로 surface 한다
