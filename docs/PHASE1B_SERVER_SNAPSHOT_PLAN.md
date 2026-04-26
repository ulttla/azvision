# AzVision Phase 1B — Server-backed Snapshot / History Plan

## 목적
- browser localStorage 기반 snapshot UX를 서버 저장 기반으로 확장
- 브라우저별 저장 한계와 세션 손실 리스크를 줄이고, 일관된 snapshot/history 복원 경로를 제공
- Phase 1A에서 확정한 원칙(`snapshot = live data 자체 저장이 아니라 current view state + metadata 복원`)은 유지

## 현재 기준
- Phase 1A snapshot UX는 usable 상태
- save / restore / rename / delete / export / import / thumbnail / active badge 완료
- localStorage-first 1차 운영 + storage hardening 반영 완료
- `TopologyPage.tsx` 공통 로직은 아래 모듈로 분리 완료
  - `frontend/src/pages/topology/model.ts`
  - `frontend/src/pages/topology/storage.ts`
  - `frontend/src/pages/topology/search.ts`
  - `frontend/src/pages/topology/topology-helpers.ts`
  - `frontend/src/pages/topology/cytoscape.ts`
- VERA 재검수 기준으로 blocking issue 없음, Phase 1A snapshot line closeout 가능 판정
- **2026-04-10 구현 상태**
  - backend snapshot CRUD 구현 완료
  - SQLite `snapshots` table + index 반영 완료
  - frontend snapshot storage provider를 local/server dual-mode로 확장 완료
  - dev 기준 `frontend/.env.local`에서 `VITE_TOPOLOGY_SNAPSHOT_BACKEND=server` 활성화 확인
  - browser fresh tab 기준 UI save → backend persistence → restore smoke 확인
- **2026-04-20 same-line polish**
  - `Saved Snapshots` 패널에 sort field / sort order control 추가
  - 정렬 후보: `Last Restored` / `Captured` / `Updated`
  - direction toggle: newest first / oldest first
  - `Recent` tab은 fixed semantics 유지를 위해 sort control 숨김
- **2026-04-21 regression follow-up**
  - backend regression tests로 `captured_at asc/desc`, `updated_at desc`, `last_restored_at desc`, route query parsing 경로를 추가 고정
  - frontend helper + `scripts/snapshot_sort_semantics_smoke.mts`를 추가해 `Saved` custom sort와 `Recent` fixed semantics를 browser 없이도 빠르게 smoke 가능하게 정리
  - `scripts/snapshot_sort_api_smoke.sh`를 추가해 live backend 기준 `captured_at` / `updated_at` / `last_restored_at` / `pinned_first` / `include_archived` 조합을 빠르게 재검증할 수 있게 함
  - `scripts/snapshot_sort_visual_smoke.mjs`를 추가해 local Chrome CDP 기준 actual UI visual smoke와 `Recent` tab sort-control hidden 상태까지 재검증 가능하게 정리
  - browser tool의 local/private URL navigation policy block은 남아 있지만, same-line visual verification blocker는 해소
- **2026-04-22 same-line UX follow-up**
  - snapshot guide에 현재 storage mode 기준 guard hint를 추가해 server validation/guard checks와 local guard checks/browser storage pressure 때문에 thumbnail preview가 빠질 수 있음을 저장 전에 미리 안내
  - browser storage pressure 기반 pre-save thumbnail drop은 local mode에만 남기고, server mode는 thumbnail을 backend guard/validation까지 전달하도록 정렬
  - 기존 save-after warning surface(local-only pre-save sanitize + server-side blank thumbnail 커버)와 함께 pre-save expectation setting까지 맞춰 current guard contract의 UX drift를 좁힘
  - server save-after warning copy도 `server validation or thumbnail guard checks` 기준으로 정렬했고, `scripts/snapshot_thumbnail_guard_copy_smoke.mts` 로 guide/warning copy drift뿐 아니라 shared thumbnail max-length와 API contract sanitize wording까지 빠르게 smoke 가능하게 정리

## Phase 1B 목표
1. snapshot을 browser localStorage 외에도 backend에 저장 가능하게 만들기
2. frontend 저장소 계층을 local / server adapter 구조로 정리하기
3. restore semantics를 유지하면서 server-backed history list와 CRUD를 제공하기
4. 기존 local snapshot은 import/migration/fallback 경로를 남기기

## 핵심 원칙
- snapshot은 계속 **view state + metadata** 중심으로 저장
- live Azure topology raw payload 전체 저장은 1B 기본 범위에서 제외
- restore는 계속
  - saved view state 적용
  - current live topology 재조회
  원칙 유지
- thumbnail은 optional 유지
- large thumbnail/base64 inline 저장은 장기적으로 축소 또는 분리 검토

## MVP 범위
### 포함
- backend snapshot CRUD API
  - list
  - create
  - update(rename / note)
  - delete
  - single read
- snapshot record schema 고정
- frontend storage adapter 도입
  - localStorage adapter
  - server adapter
- 기존 snapshot UI 흐름 유지
  - Save
  - Restore
  - Rename
  - Delete
- local export / import는 당분간 유지

### 제외
- multi-user collaboration
- sharing link
- permission model 세분화
- audit trail
- revision timeline UI
- thumbnail object storage 최적화
- live topology payload archival

## 제안 데이터 모델
### SnapshotRecord
- `id`
- `workspaceId`
- `name`
- `note`
- `compareRefs`
- `clusterChildren`
- `scope`
- `query`
- `resourceGroupName`
- `topologyGeneratedAt`
- `visibleNodeCount`
- `loadedNodeCount`
- `edgeCount`
- `thumbnailDataUrl` (optional)
- `createdAt`
- `updatedAt`
- `storageKind` (`local` | `server`) — frontend view model 수준에서만 사용 가능

## API 초안
### `GET /workspaces/{workspace_id}/snapshots`
- workspace별 snapshot 목록 조회

### `POST /workspaces/{workspace_id}/snapshots`
- snapshot 생성

### `GET /workspaces/{workspace_id}/snapshots/{snapshot_id}`
- snapshot 단건 조회

### `PATCH /workspaces/{workspace_id}/snapshots/{snapshot_id}`
- rename / note 수정

### `DELETE /workspaces/{workspace_id}/snapshots/{snapshot_id}`
- snapshot 삭제

## frontend 설계 초안
### storage adapter
- `loadSnapshots()`
- `saveSnapshot()`
- `renameSnapshot()`
- `deleteSnapshot()`
- `importSnapshots()`
- `exportSnapshots()`

### 구현 순서
1. `storage.ts`를 local-only 유틸에서 adapter entry로 확장
2. server API client 추가
3. save/load/rename/delete 경로를 adapter 경유로 전환
4. local import/export는 별도 fallback 유틸로 유지
5. 필요 시 local → server migration entry 추가

## UX 메모
- Snapshot / Preset 구분은 현재 Phase 1A 카피를 유지
- server-backed 전환 후에도 버튼/카드 구조는 최대한 유지
- restore 시 안내 문구는 계속 유지
- `Saved Snapshots`는 사용자가 working set을 재정렬할 수 있게 하되, `Recent`는 이름 그대로 fixed recent semantics를 유지한다
- local snapshot과 server snapshot이 동시에 존재하면 구분 배지 또는 source meta 추가 검토

## Migration / Import UX 결정안 (2026-04-10)
### 결정
- **자동 migration은 하지 않음**
- server mode에서 browser local snapshot이 감지되면 **명시적 Import CTA**로만 서버로 올린다
- import 성공 후에도 **local 원본은 자동 삭제하지 않음**
- JSON export / import는 fallback 경로로 계속 유지하되, server mode에서는 최종 저장 대상이 server가 되도록 정리한다

### 왜 이 방식이 맞는가
- local snapshot은 브라우저별/세션별 상태라서 사용자가 의도하지 않은 자동 업로드가 생기면 혼란 가능
- snapshot은 archive가 아니라 **view state + metadata** 이므로, migration도 destructive step보다 review 가능한 사용자 액션이 안전
- 현재 backend API는 단건 create 중심이라, 명시적 import가 구현/검증 범위 관리에 유리

### 권장 UX 흐름
1. page 진입 후 `server` mode이면 현재 workspace 기준 local snapshot 존재 여부를 확인
2. local snapshot이 1개 이상 있으면 상단 callout 또는 snapshot panel 내 notice 표시
3. notice 문구 예시
   - `This browser has 4 local snapshots for this workspace.`
   - `Import them to server storage to keep them outside browser-local storage.`
4. CTA
   - `Import local snapshots`
   - `Export JSON`
   - `Dismiss`
5. import 완료 후 summary toast / message 표시
   - `Imported 3 snapshots, skipped 1 duplicate.`

### 중복 처리 원칙
- MVP에서는 **best-effort dedup** 적용
- 아래 필드가 모두 같으면 duplicate 후보로 간주
  - `name`
  - `scope`
  - `query`
  - `resource_group_name`
  - `topology_generated_at`
  - `compare_refs` (정렬 기준 비교)
  - `visible_node_count`
  - `loaded_node_count`
  - `edge_count`
- duplicate 후보는 기본 동작에서 **skip** 하고 결과 요약에 개수만 표시
- note / thumbnail 차이까지 완전 비교하는 정교한 fingerprint는 후속으로 미룸

### 비범위
- first load 시 silent auto-import
- import 후 local snapshot 자동 삭제
- local/server 양방향 sync
- server batch import 전용 API 추가
- dedup conflict resolution dialog

### 구현 순서 권장안
1. `storage.ts`에 workspace 기준 local snapshot 탐지 helper 추가
2. server mode일 때 local snapshot import 함수 추가 (기존 create endpoint 순차 호출)
3. `TopologyPage.tsx`에 notice + CTA 연결
4. import 결과 summary(성공/중복 skip/실패) 표시
5. 후속 polish로 source badge/local-server meta 표시까지 반영 완료

## 리스크 / 주의사항
- thumbnail을 계속 inline base64로 저장하면 서버 저장소/응답 크기 부담 가능
  - **2026-04-19 cleanup 반영:** list 응답은 summary-only(`thumbnail_data_url` 제외), single snapshot GET만 thumbnail 포함으로 분리
  - frontend snapshot card preview는 missing thumbnail에 한해 detail lazy hydration으로 복원
- history 범위를 너무 넓히면 revision/timeline 요구로 번질 수 있으므로 1B MVP는 CRUD + restore 위주로 제한
- local snapshot migration은 자동보다 명시적 import가 안전

## 다음 액션
1. snapshot payload smoke(`scripts/snapshot_payload_smoke.sh`), sort API smoke(`scripts/snapshot_sort_api_smoke.sh`), visual smoke(`scripts/snapshot_sort_visual_smoke.mjs`), guard copy/threshold/API contract smoke(`scripts/snapshot_thumbnail_guard_copy_smoke.mts`)를 같이 유지하며 invalid/oversized thumbnail sanitize 경로 포함 회귀 체크 지속
2. 반복 import dedup 경고 / cleanup UX 검토
3. 남은 장기 과제는 thumbnail object storage / size guard 방향 재검토
4. current baseline은 save-after warning surface(local-only pre-save sanitize + server-side blank thumbnail 커버) + pre-save storage-mode guard hint + guard copy/threshold/API contract alignment smoke 조합으로 유지
5. reviewer 필요 시
   - VERA: spec/범위 정합성
   - AEGIS: 저장 경계/노출면 점검

## 검증 메모
- browser automation 기준 React controlled input에는 `fill`보다 `type`이 더 안정적으로 동작함
- `fill`로 보였던 snapshot name/note 미반영은 앱 저장 로직 버그가 아니라 automation 입력 방식 이슈로 확인
- test snapshot은 smoke 후 정리 완료

## 한 줄 결론
- Phase 1B는 `server-backed snapshot/history`를 추가하되, Phase 1A에서 확정한 `view state + metadata restore` 모델을 그대로 유지하는 방향이 가장 안전하며, **현재 1차 구현과 E2E smoke까지 통과한 상태**임.
