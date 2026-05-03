# AzVision Architecture View MVP Plan

## 목적
- 현재의 탐색용 `Topology View`와 별도로, 사람이 읽기 쉬운 **presentation-friendly Architecture View**를 추가한다.
- 사용자가 첨부한 Azure architecture diagram 스타일처럼 **좌→우 흐름**, **zone/group box**, **단순화된 edge**, **Azure icon 중심 표현**을 기본 방향으로 삼는다.
- 초기 버전은 **자동 생성(auto-generated) 중심**으로 제공하되, 이후 **수동 수정(manual override)** 이 가능한 구조를 처음부터 고려한다.

## 왜 별도 View가 필요한가
현재 `Topology View`는 실제 리소스 관계 탐색에 최적화되어 있다.
하지만 사용자가 원하는 화면은 아래 성격이 강하다.

- 설명/발표용
- 계층/단계 중심
- 좌→우 data flow 중심
- 인프라 세부정보 축약
- 사람이 빠르게 이해할 수 있는 다이어그램

즉, 단순 Cytoscape style 교체만으로는 부족하고, **Topology View와 Architecture View를 분리**하는 것이 맞다.

## 목표 사용자 경험
### Topology View
- 실제 리소스 관계 탐색
- node detail / expand / compare / filter 중심
- 운영/디버깅용

### Architecture View
- Source → Ingest → Process → Store → Serve 흐름 표현
- 복잡한 network edge는 축약 또는 overlay 처리
- 발표/설명/문서 export용
- 나중에는 수동 조정 가능한 최종본 편집 대상으로 확장

## 핵심 원칙
1. **원본 topology 데이터는 그대로 유지**
2. Architecture View는 **별도 view-model 변환층**으로 생성
3. 초기 버전은 **auto-generated 결과**를 먼저 제공
4. 이후 수동 수정은 **manual override layer**로 덮어쓴다
5. 수동 수정값은 전체 복사본이 아니라 **delta(바뀐 값만)** 저장한다
6. export(PNG/PDF)는 Architecture View에도 동일하게 제공한다

## MVP 범위
### 포함
- `Topology View` / `Architecture View` 탭 또는 모드 전환
- 좌→우 pipeline layout
- stage/zone container 렌더링
- Azure resource type 기반 자동 stage 분류
- 단순화된 architecture edge 생성
- Azure icon or type badge 표시
- export(PNG/PDF) 지원
- frontend-only auto-generated rendering 1차 구현

### 제외
- drag-and-drop 편집 UI
- custom edge 수동 추가
- annotation box 편집
- multi-user collaborative editing
- server persistence of architecture overrides
- pixel-perfect Visio급 editor

## 원하는 시각 스타일 기준
### 공통 특징
- 큰 구획 박스(zone / tier / stage)
- 좌→우 흐름
- 직각(orthogonal) 또는 단순한 곡선 화살표
- Azure icon 중심
- 리소스 개별 나열보다 **논리 그룹** 우선
- 설명력이 낮은 인프라 상세는 기본 축약

### AzVision에 맞는 변환 원칙
- 리소스 탐색용 detail은 Topology View에 남긴다
- Architecture View에서는 같은 성격의 리소스를 group node로 축약할 수 있다
- network/security 리소스는 기본 lane에서 분리하거나 overlay 처리한다

## 화면 구조 초안
### 상단
- view mode toggle
  - `Topology View`
  - `Architecture View`

### Architecture View 좌측/상단 control
- stage grouping mode
  - default: `pipeline-ltr`
- detail density
  - default: `compact`
  - `balanced`
  - `expanded`
- network overlay toggle
- label density toggle
- export actions

### 본문
- stage container row/column
  - Source
  - Ingest
  - Process
  - Store
  - Serve
  - optional: Network / Security / Operations
- stage 내부 node/group node 렌더링
- stage 간 simplified edge 렌더링

## 분류 규칙 초안
### 기본 stage
- `source`
- `ingest`
- `process`
- `store`
- `serve`
- `infra` (optional overlay lane)
- `unclassified` (fallback)

### resource type → stage 예시
| resource type prefix | 기본 stage | 비고 |
|---|---|---|
| `microsoft.storage/storageaccounts` | `source` 또는 `store` | name/tag/kind로 lake vs serving storage 보정 가능 |
| `microsoft.datafactory/factories` | `ingest` | data movement 중심 |
| `microsoft.databricks/workspaces` | `process` | compute/process |
| `microsoft.synapse/workspaces` | `process` | serverless/sql pool 포함 process 우선 |
| `microsoft.sql/managedinstances` | `store` | serving DB가 아니면 store 우선 |
| `microsoft.sql/servers` | `store` | database 계열 |
| `microsoft.analysisservices/servers` | `serve` 또는 `store` | semantic serving이면 serve 우선 |
| `microsoft.machinelearningservices/*` | `serve` | ML inferencing/serving |
| `microsoft.web/sites` | `serve` | app/API serving |
| `microsoft.keyvault/vaults` | `infra` | shared security support |
| `microsoft.insights/*` | `infra` | Application Insights, alerting, workbooks 등 monitoring support |
| `microsoft.operationalinsights/workspaces` | `infra` | Log Analytics workspace |
| `microsoft.operationsmanagement/solutions` | `infra` | OMS solution |
| `microsoft.network/*` | `infra` | overlay 또는 별도 lane |
| `microsoft.compute/virtualmachines` | `process` | VM 기반 workload |
| `microsoft.app/containerapps` | `source`, `serve`, 또는 `process` | frontend/API/worker 이름 기반 보정 |
| `microsoft.containerinstance/containergroups` | `process` | short-lived/container workload |
| `microsoft.containerservice/managedclusters` | `process` | AKS/container compute |

### 보정 규칙
- tag / name token / kind 기반으로 stage 재분류 허용
- 예: `*-landing`, `*-raw`, `*-bronze` → source/store 쪽 가중
- 예: `*-etl`, `*-job`, `*-transform` → process 가중
- 예: `*-api`, `*-portal`, `*-dashboard`, `*-bi` → serve 가중
- 어느 규칙으로도 자신 있게 분류되지 않으면 `unclassified`로 둔다

### group node 축약 기준 (MVP)
- 기본은 individual node 유지
- 아래 조건을 모두 만족하면 group node로 축약 가능
  - 동일 stage
  - 동일 resource type family
  - 동일 naming cluster 또는 동일 parent/workload group
  - 개수 3개 이상
- 위 조건을 만족하지 않으면 개별 node 유지

## 데이터 모델 초안
### 1) auto-generated layer
```ts
export type ArchitectureStageKey = 'source' | 'ingest' | 'process' | 'store' | 'serve' | 'infra' | 'unclassified'

export type ArchitectureNode = {
  id: string
  sourceNodeKeys: string[]
  stageKey: ArchitectureStageKey
  displayName: string
  shortLabel?: string
  resourceType?: string
  iconKey?: string
  nodeKind: 'resource' | 'group' | 'external' | 'service'
  collapsedChildrenCount?: number
  metadata?: Record<string, unknown>
}

export type ArchitectureEdge = {
  id: string
  sourceId: string
  targetId: string
  edgeKind: 'data_flow' | 'dependency' | 'network_overlay'
  label?: string
  confidence?: number
  derivedFrom: string[]
}

export type ArchitectureViewGenerated = {
  workspaceId: string
  topologyGeneratedAt: string
  layoutKind: 'pipeline-ltr'
  stages: ArchitectureStageKey[]
  nodes: ArchitectureNode[]
  edges: ArchitectureEdge[]
}
```

### 2) manual override layer
```ts
export type ArchitectureNodeOverride = {
  position?: { x: number; y: number }
  stageKey?: ArchitectureStageKey
  displayName?: string
  hidden?: boolean
  accentColor?: string
  pinned?: boolean
}

export type ArchitectureEdgeOverride = {
  hidden?: boolean
  label?: string
  emphasis?: 'normal' | 'strong' | 'faint'
}

export type ArchitectureStageOverride = {
  displayName?: string
  order?: number
  hidden?: boolean
}

export type ArchitectureAnnotation = {
  id: string
  text: string
  x: number
  y: number
  width?: number
  tone?: 'note' | 'warning' | 'info'
}

export type ArchitectureViewOverrideState = {
  version: 1
  workspaceId: string
  nodeOverrides: Record<string, ArchitectureNodeOverride>
  edgeOverrides: Record<string, ArchitectureEdgeOverride>
  stageOverrides: Record<string, ArchitectureStageOverride>
  annotations: ArchitectureAnnotation[]
}
```

## 왜 override layer 방식이 맞는가
- live topology 재조회 후에도 **수동 조정값을 최대한 유지**할 수 있음
- 전체 view를 복사하지 않아도 되므로 저장량이 작음
- 사용자 수정과 자동 생성 로직을 분리 가능
- 추후 server persistence 도입 시 snapshot과 비슷한 CRUD 패턴으로 확장 가능

## 식별자 안정성 규칙
수동 수정값이 유지되려면 ID가 안정적이어야 한다.

### 권장
- architecture node id
  - 단일 리소스 기반이면 `resource:{node_key}`
  - group node면 `group:{stage}:{normalized-name}`
- architecture edge id
  - `edge:{sourceId}:{targetId}:{edgeKind}`
- stage key는 고정 enum 사용

## 생성 파이프라인 초안
1. 기존 topology response 수신
2. resource type / tag / name 기반 stage 분류
3. groupable resource를 architecture node로 통합
4. topology edge를 simplified architecture edge로 축약
   - 동일 source stage → target stage 흐름이 중복되면 병합
   - presentation 가치가 낮은 중복 edge는 제거
   - network/security edge는 기본 flow edge와 분리
5. network/security edge는 overlay로 분리
6. layout 적용 (`pipeline-ltr`)
7. manual override가 있으면 generated view 위에 덮어쓰기
8. 렌더링 + export

## 렌더링 전략
### 1차 권장
- 기존 Cytoscape runtime을 재사용
- 다만 `Architecture View` 전용 요소 생성 함수와 style set을 별도로 둔다
- container box / lane header / simplified edge를 별도 renderer helper에서 생성
- stage container는 pure Cytoscape compound node로 시작하되, layout 품질이 부족하면 HTML overlay hybrid로 전환 가능하도록 renderer 경계를 분리한다

### 예상 신규 파일
- `frontend/src/pages/architecture/model.ts`
- `frontend/src/pages/architecture/derive.ts`
- `frontend/src/pages/architecture/layout.ts`
- `frontend/src/pages/architecture/render.ts`
- `frontend/src/pages/architecture/overrides.ts`
- `frontend/src/pages/architecture/style.ts`
- `frontend/src/pages/ArchitectureView.tsx`

### 기존 연결 지점
- `TopologyPage.tsx`에서 탭 분리 또는 상위 page shell 분리
- export 로직은 재사용 가능
- API는 MVP에서 신규 backend 추가 없이 기존 topology response 재사용 가능

## 구현 단계 제안
### A1. topology heuristic 정밀화
- live topology edge precision 추가 개선
- Architecture View 입력 데이터 품질 확보

### A1.5. page shell 분리
- `TopologyPage.tsx`에 직접 기능을 덧쌓지 않고
- 상위 shell에서 `Topology View` / `Architecture View` 전환을 담당하도록 분리
- 기존 topology panel은 가능한 한 독립 유지

### A2. Architecture View MVP
- auto-generated architecture stage 분류
- `unclassified` fallback 포함
- pipeline-ltr layout
- stage box + simplified edge + icon/badge
- export 연결
- 최소 수동 액션 1개 포함
  - 1순위 후보: node hide/show toggle
  - 대안: stage 간 node 이동
- edit-ready data model 반영

### A3. document / repo update
- README / docs에 새 view 목적과 운영법 반영

### A4. manual override phase
- local override state 저장 고도화
- drag reposition
- rename / hide / stage move
- annotation 1차
- 필요 시 backend persistence 확장

## 저장 전략 제안
### MVP
- persistence 없음 또는 browser-local 임시 persistence
- 목표는 렌더링/분류 품질 검증

### manual override phase
- localStorage 또는 server-backed `architecture_view_state`로 확장
- snapshot과 혼합 저장하지 않고 별도 구조 권장
- 이유:
  - snapshot은 current topology view state 의미가 강함
  - architecture view override는 presentation artifact 성격이 다름

## 리스크 / 주의사항
- 과도한 자동 그룹화는 실제 관계를 숨겨서 오해를 만들 수 있음
- Azure resource type만으로 workload 역할이 확정되지 않는 경우가 있음
- 따라서 stage 분류는 `resource type + name/tag heuristic + future manual override` 조합이 안전
- 완전한 diagram editor를 1차 범위에 넣으면 일정이 급격히 커짐
- MVP는 **auto-generated but edit-ready** 원칙 유지가 중요

## 완료 기준 (A2 MVP)
- 사용자가 `Architecture View`로 전환 가능
- topology response에서 architecture stage 분류 결과를 렌더링 가능
- Source / Ingest / Process / Store / Serve 기본 zone 노출
- 분류 애매한 node는 `unclassified`로 안전하게 표시됨
- 대표 edge가 좌→우 구조로 표현됨
- density 기본값은 `compact`
- PNG/PDF export 가능
- 최소 수동 액션 1개(node hide/show 또는 stage move)가 동작함
- 향후 수동 수정용 override schema가 문서와 코드 구조에 반영됨

## 현재 구현 상태 메모 (2026-04-30 LWW c1)
- 이 섹션은 Architecture View 라인 기준 상태 메모다. snapshot/raw diff, error response contract, inventory/auth Azure error normalization 후속은 `README.md`, `docs/API_CONTRACT.md`, `docs/RAW_TOPOLOGY_DIFF_PLAN.md` 기준 최신 상태를 따른다.
- `Topology View / Architecture View` 탭 전환 반영 완료
- frontend 전용 architecture view-model + stage bucket + simplified edge 생성 반영 완료
- `ArchitecturePage`에서 SVG 기반 compact diagram / zone board / flow summary / selected card 패널 구성 완료
- browser-local override delta 저장/복원 반영 완료
  - hide/show: `hiddenSourceNodeKeys`
  - presentation label override: `displayNameOverride`
  - presentation stage move: `stageKeyOverride`
  - presentation annotations: `annotations[]` with note/info/warning tone
  - presentation order: `position.order` with drag/drop plus Earlier/Later controls
  - scale/scroll viewing controls: `100 / 90 / 80 / 67 / 55%`, default 80%, with horizontal scroll fallback for smaller displays
  - scope reset: `Reset all overrides`
- infra overlay lane toggle 반영 완료. 발표/export용으로 infra lane을 숨겨도 원본 topology는 변경하지 않음
- presentation notes panel 반영 완료. 짧은 발표용 메모를 topology source와 분리된 local override delta로 저장함
- presentation notes는 export-safe SVG에도 함께 렌더링되어 PNG/PDF/clipboard 출력에 포함됨
- Zone Board 화면 잘림 방지 pass 반영 완료. stage board/card action/chip overflow를 정리했고, 작은 화면에서는 축소 후 필요 시 스크롤로 이동 가능함
- export PNG/PDF, clipboard PNG copy, group threshold, network inference toggle 연결 완료
- lightweight readiness badges 반영 완료. backend health, auth readiness, topology generated time을 Architecture View 상단에서 확인 가능
- label readability pass 반영 완료
  - domain token split / acronym prettify / singleton label polish 적용
  - short-only compact alias 2차 적용(`Synapse WS`, `MI`, `MI Support Net`, `SQL MI SW Dev Net`, `Pricing Calculator CDN` 류)
- 검증 상태: `npm --prefix frontend run build`, `npm --prefix frontend run smoke:semantics`, `scripts/personal_use_acceptance.sh` PASS
- Browser/CDP evidence: channel profile `azvision-dev`에서 Architecture View live render, layout clipping fix, scale/scroll UX smoke 확인. 관련 screenshot은 `tmp/architecture-view-layout-fix-smoke.png`, `tmp/architecture-view-scale-scroll-smoke.png`.

## reviewer check 요청 포인트
### UX / Product
- 이 view가 실제로 발표/설명용으로 충분히 읽기 쉬운가
- zone/stage naming이 적절한가
- detail density 기본값이 적절한가

### Implementation / Architecture
- Topology View와 과도하게 결합되지 않는가
- override schema가 장기 확장에 적합한가
- Cytoscape reuse가 MVP에 충분한가

## 한 줄 결론
AzVision의 다음 단계는 단순 graph style tweak가 아니라, **auto-generated + edit-ready Architecture View**를 별도 모드로 추가하는 방향이 가장 안전하고 확장 가능하다.
