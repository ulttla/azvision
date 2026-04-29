# AzVision Snapshot History Foundation Plan

## 목적
- 현재의 snapshot CRUD를 **실사용 가능한 history foundation**으로 정리한다.
- 단순히 "저장된 카드 목록"이 아니라, 사용자가
  - 어떤 scope에서 저장했는지
  - 언제 캡처했고
  - 언제 복원했는지
  - 무엇이 최근 작업 기준인지
  빠르게 판단할 수 있는 구조를 설계한다.
- 기존 원칙인 **view state + metadata restore** 모델은 유지한다.

## 현재 기준선
AzVision은 이미 아래를 구현한 상태다.
- backend snapshot CRUD + SQLite persistence
- frontend local/server dual-mode snapshot storage
- explicit local → server import CTA
- snapshot별 `selected_subscription_id`, `resource_group_name` 저장
- thumbnail / note / rename / delete / restore 흐름
- `captured_at / last_restored_at / restore_count / is_pinned / archived_at` 운영 메타 반영
- `POST /snapshots/{snapshot_id}/restore-events` 반영
- server mode에서 workspace 기준 history list 조회
- snapshot list query parity 1차 반영
  - `sort_by`
  - `sort_order`
  - `include_archived`
  - `pinned_first`
- snapshot compare first-pass endpoint 반영
  - `POST /workspaces/{workspace_id}/snapshots/compare`
  - saved view-state metadata 기준 count/scope/compare_refs delta 반환
  - raw Azure topology archival diff는 여전히 비목표
- `Saved Snapshots` 패널에 sort field / sort order control 추가
  - `Last Restored` / `Captured` / `Updated`
  - newest / oldest
  - `Recent` tab은 fixed semantics 유지를 위해 별도 sort control 숨김

즉, **"server-backed snapshots + history foundation H1"은 usable baseline까지 구현 완료** 상태다.
현재 남은 핵심은 아래다.
- `Saved Snapshots` custom sort와 `Recent` fixed semantics 조합이 실제 working set 판단에 충분한지 추가 검증
- rename/note update와 usage history 체감이 충분히 분리되는지 확인
- pinned/recent/archived filter UX와 card meta 표현 미세조정
- 이후 history를 revision system으로 비대화하지 않고 working set 중심으로 유지

## 문제 정의
현재 snapshot은 저장/복원은 가능하지만, 장기적으로는 아래 질문에 답하기 어렵다.
- 최근에 실제로 자주 보는 snapshot은 무엇인가?
- 마지막으로 복원한 scope는 무엇이었는가?
- rename만 한 record와 실제 새로 캡처한 record를 어떻게 구분할 것인가?
- 목록이 늘어났을 때 active working set과 archive를 어떻게 나눌 것인가?

## 비목표
아래는 이번 foundation 범위에서 제외한다.
- live Azure raw topology payload 전체 archival
- full revision timeline viewer
- full snapshot diff viewer
- multi-user collaboration / permission model
- object storage 기반 thumbnail 분리
- scan result 자체의 immutable audit log

## 핵심 원칙
1. snapshot은 계속 **view state + metadata**만 저장
2. restore는 계속 **saved state 적용 + current topology 재조회**
3. history foundation은 **운영 메타 보강** 중심으로 확장
4. raw scan archive와 snapshot history를 섞지 않음
5. schema 확장은 backward-compatible migration 우선

## 현재 SnapshotRecord와 보완 필요점
### 현재 저장 필드
- `id`
- `workspace_id`
- `preset_version`
- `name`
- `note`
- `compare_refs`
- `cluster_children`
- `scope`
- `query`
- `selected_subscription_id`
- `resource_group_name`
- `topology_generated_at`
- `visible_node_count`
- `loaded_node_count`
- `edge_count`
- `thumbnail_data_url`
- `created_at`
- `updated_at`

### 부족한 운영 메타
- `captured_at`
  - 최초 저장 시점의 immutable timestamp
  - rename/note update와 분리 필요
- `last_restored_at`
  - 사용자가 마지막으로 restore한 시점
- `restore_count`
  - 실제 사용 빈도 판단용
- `is_pinned`
  - 자주 쓰는 working set 고정
- `archived_at`
  - soft archive 기준

## 제안 데이터 모델
### SnapshotRecord vNext
```ts
SnapshotRecord {
  id: string
  workspace_id: string
  preset_version: number
  name: string
  note: string
  compare_refs: string[]
  cluster_children: boolean
  scope: 'visible' | 'child-only' | 'collapsed-preview'
  query: string
  selected_subscription_id: string
  resource_group_name: string
  topology_generated_at: string
  visible_node_count: number
  loaded_node_count: number
  edge_count: number
  thumbnail_data_url: string

  captured_at: string        // immutable capture time
  created_at: string         // persistence row create time (legacy compatible)
  updated_at: string         // rename/note/pin/archive update time
  last_restored_at?: string
  restore_count: number
  is_pinned: boolean
  archived_at?: string
}
```

### 해석 규칙
- `captured_at`
  - 사용자가 snapshot을 처음 저장한 시점
  - import 시에는 원본 `created_at`를 최대한 승계하고, 없으면 import 시각 사용
- `created_at`
  - DB row 생성 시점 유지
  - legacy 호환용으로 계속 유지 가능
- `updated_at`
  - rename / note / pin / archive 변경 시 갱신
- `last_restored_at`
  - restore 성공 시 갱신
- `restore_count`
  - restore 성공 시 증가
- `archived_at`
  - null이면 active, 값이 있으면 archived

## API 제안
### 유지
- `GET /workspaces/{workspace_id}/snapshots`
- `POST /workspaces/{workspace_id}/snapshots`
- `GET /workspaces/{workspace_id}/snapshots/{snapshot_id}`
- `PATCH /workspaces/{workspace_id}/snapshots/{snapshot_id}`
- `DELETE /workspaces/{workspace_id}/snapshots/{snapshot_id}`

### 확장 제안
#### 1) list query
- `sort_by=updated_at|captured_at|last_restored_at`
- `sort_order=asc|desc`
- `include_archived=true|false`
- `pinned_first=true|false`
- 상태: **1차 구현 완료**, 이후 실제 UI/정렬 체감 검증 단계

#### 2) patch field 확장
- `name`
- `note`
- `is_pinned`
- `archived` (boolean UI alias)

#### 3) restore event endpoint
- `POST /workspaces/{workspace_id}/snapshots/{snapshot_id}/restore-events`
- 목적:
  - `last_restored_at`
  - `restore_count`
  업데이트를 명시적으로 처리
- response:
  - updated `SnapshotRecord`

### 왜 restore event를 분리하는가
- 단순 `GET` 또는 client-side load만으로 restore 사용 이력을 올리면 노이즈가 생김
- 실제로 사용자가 `Load snapshot`을 눌렀을 때만 usage 메타를 기록하는 것이 맞음
- 향후 최근 사용 목록, favorite 정렬, reopen workflow로 확장하기 쉬움

## DB migration 제안
### 최소 추가 컬럼
- `captured_at TEXT NOT NULL DEFAULT ''`
- `last_restored_at TEXT`
- `restore_count INTEGER NOT NULL DEFAULT 0`
- `is_pinned INTEGER NOT NULL DEFAULT 0`
- `archived_at TEXT`

### legacy row backfill
- 기존 row는
  - `captured_at = created_at`
  - `restore_count = 0`
  - `is_pinned = 0`
  - `archived_at = NULL`
로 보정

## Frontend UX 제안
### snapshot card meta 우선순위
1. scope meta
   - subscription / RG scope
2. capture meta
   - `Captured ...`
3. usage meta
   - `Restored ...` 또는 `Never restored`
4. storage/source meta
   - `Server snapshot`

### 목록 동작
- 기본 정렬: `pinned first` + `last_restored_at desc nulls last` + `captured_at desc`
- quick filters
  - `All`
  - `Pinned`
  - `Recent`
  - `Archived`
- badge
  - `Pinned`
  - `Archived`
  - `Never restored`

### 버튼 제안
- `Load`
- `Rename`
- `Pin/Unpin`
- `Archive/Unarchive`
- `Delete`

## 구현 단계 제안
### H1. foundation schema + API
- 상태: **구현 완료**
1. DB migration column 추가
2. schema / repository / service / route 확장
3. list sort/filter query 최소 반영
4. restore-events endpoint 추가

### H2. frontend history UX
- 상태: **1차 usable 반영 + sort control 반영 완료, polish/검증 여지 있음**
1. snapshot card meta 재구성
2. pin/archive action 추가
3. load 시 restore-events 호출
4. recent/pinned/archived filter 추가
5. `Saved Snapshots` sort field / sort order control 추가, `Recent` tab fixed semantics 유지

### H3. optional cleanup
1. thumbnail size/response weight 점검
   - **완료(1차):** snapshot list는 summary-only(`thumbnail_data_url` 제외), single snapshot GET은 thumbnail 포함으로 유지
   - **완료(1차):** frontend snapshot card preview는 missing thumbnail을 detail lazy hydration으로 복원
   - 남은 판단: inline base64 유지 한계, object storage/size guard 필요 여부
2. archive default policy 검토 — **완료**: `include_archived=True` 기본값 유지 결정. 근거: (1) frontend가 tab badge count를 위해 전체 목록이 필요, (2) client-side filtering이 이미 구현됨, (3) default 변경 시 tab count break. backend schema/frontend API call 양쪽 모두 `include_archived=True`로 일관되게 동작 중.
3. import 시 captured_at 승계 규칙 보강 — **완료**: `SnapshotCreateRequest`에 optional `captured_at` 추가, 서비스 레이어 및 frontend `toSnapshotApiCreateRequest` 연결

## 검증 기준
- legacy snapshot row가 migration 후 정상 조회될 것
- rename/note 변경이 capture 시점과 섞이지 않을 것
- snapshot load 후 `last_restored_at`, `restore_count`가 증가할 것
- pinned/archived 상태가 목록 정렬과 badge에 반영될 것
- restore semantics는 기존처럼 current topology 재조회 기반일 것

## 리스크 / 주의사항
- history 기능을 과도하게 넓히면 revision system으로 비대화될 수 있음
- `updated_at` 중심 정렬을 계속 쓰면 실제 usage history와 혼동이 남음
- restore event를 자동 기록으로 처리하면 preview/list render만으로 noise가 쌓일 수 있음
- archive는 hard delete 대체가 아니라 working set 정리 수단으로만 봐야 함

## 권장 다음 순서
1. `scripts/snapshot_sort_visual_smoke.mjs` 기준 visual smoke를 회귀 경로로 유지하고, `scripts/snapshot_thumbnail_guard_copy_smoke.mts` 및 `scripts/snapshot_payload_smoke.sh` 로 guide/warning copy, shared max-length, API contract sanitize wording, invalid/oversized thumbnail sanitize 경로를 함께 점검하면서 추가 snapshot UX polish 범위를 최소 단위로만 검토
2. current baseline은 save-after warning surface(local-only pre-save sanitize + server-side blank thumbnail 커버) + pre-save storage-mode guard hint + guard copy/threshold/API contract alignment smoke + payload sanitize smoke 조합으로 유지하면서 thumbnail guard contract UX drift를 더 좁게 점검
3. thumbnail 장기 저장 전략(object storage / size guard) 재검토
4. history 범위를 revision system으로 넓히지 않고 working set 중심으로 유지할 운영 기준 고정

## 한 줄 결론
- AzVision의 다음 snapshot/history 단계는 raw topology archive가 아니라, **capture / restore / active working set을 구분하는 history foundation**을 추가하는 방향이 가장 안전하다.
