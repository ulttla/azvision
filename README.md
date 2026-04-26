# AzVision

Azure topology explorer 기반의 AzVision 개발 repo.

## 현재 상태
- 현재 active 기준은 **Phase 1B server-backed snapshot/history + history foundation H1/H2 usable baseline 완료**
- 제품 기준선은 **single-user first** 이다. 현재 `workspace`는 한 사용자/한 배포 안에서 Azure scope와 저장 데이터를 구분하는 프로젝트 단위이며, user login / multi-user / permission model / language toggle은 productization 단계로 보류한다.
- backend
  - SQLite `manual_nodes` / `manual_edges` 기반 DB-backed CRUD 구현 완료
  - topology 응답에 manual node/edge merge 반영 완료
  - SQLite `snapshots` table + 운영 메타 컬럼(`captured_at`, `last_restored_at`, `restore_count`, `is_pinned`, `archived_at`) 반영 완료
  - snapshot CRUD + restore-events endpoint 구현 완료
  - list sort/filter query (`sort_by`, `sort_order`, `include_archived`, `pinned_first`) 구현 완료
  - global exception handling 기준으로 `HTTPException` / `AzureClientError` non-2xx 응답이 `{ ok, status, message }` JSON shape로 정규화됨
  - local runtime smoke 기준 `/` / `/healthz` 200 확인
  - existing `.env` 기준 live auth `config-check` / `read-test` / topology probe 동작 확인
- frontend
  - `TopologyPage`에서 workspace / subscription / resource group scope 제어, Cytoscape canvas, node detail, manual node/edge create/update/delete UI 동작
  - snapshot local/server dual-mode storage adapter 구현 완료
  - server mode에서 local snapshot import CTA + dedup skip 흐름 구현 완료
  - server snapshot list payload는 summary-only(`thumbnail_data_url` 제외)로 유지하고, snapshot card preview는 single snapshot detail lazy hydration으로 복원
  - `Saved Snapshots` 패널에 client-side sort field / sort order control(`Last Restored`, `Captured`, `Updated`; newest/oldest) 반영 완료, `Recent` tab은 고정 recent semantics 유지를 위해 control 숨김
  - snapshot card는 local/server source badge, storage meta, `Updated`, `Archived` 메타를 함께 노출해 capture/restore/update 상태 구분을 더 명확히 표시함
  - snapshot guide는 현재 storage mode 기준으로 thumbnail guard 동작(server validation/guard checks, local guard checks/browser storage pressure)을 인라인 hint로 미리 안내함
  - browser storage pressure 기반 pre-save thumbnail drop은 이제 local mode에만 적용되고, server mode는 thumbnail을 backend guard/validation까지 그대로 전달함
  - server save-after warning copy도 `server validation or thumbnail guard checks` 기준으로 정렬해 guide와 실제 warning 문구 drift를 줄임
  - `fetchJson`이 non-2xx JSON body의 `message`를 `ApiError`로 surface 하도록 정리됨
  - `tsc --noEmit`, `vite build` 통과
- 검증
  - manual node/edge CRUD / PATCH / cleanup smoke 통과
  - manual edge full E2E(create/list/update/delete) smoke 통과
  - manual + scan node mixed topology merge smoke 통과
  - backend compile smoke 통과
  - browser fresh tab 기준 UI save → backend persistence → restore smoke 확인
  - live topology probe PASS
    - auth ready / token acquire / subscription 2개 read 성공 (`Kepion Sub`, `Azure Sub for Select Wines`)
    - sample resource group 7개 확인
    - topology projection `node_count=50`, `edge_count=55`, inferred edge 6개 확인
- 문서/운영 상태
  - `docs/API_CONTRACT.md` 는 current manual CRUD/list envelope + snapshot CRUD/restore-events 구조와 정합
  - `docs/PHASE1A_BUILD_CHECKLIST.md` 는 Phase 1A DoD 전부 완료 기준으로 최신화 완료
  - `docs/PHASE1B_SERVER_SNAPSHOT_PLAN.md` 는 Phase 1B 구현 완료 + snapshot sort UX visual smoke closeout 기준으로 최신화 완료
  - `docs/SNAPSHOT_HISTORY_FOUNDATION_PLAN.md` 는 H1/H2 usable baseline + `Saved Snapshots` sort UX visual smoke 반영 기준으로 최신화 완료
  - `scripts/snapshot_payload_smoke.sh` 로 snapshot list/detail payload 분리(summary list, detail thumbnail 포함)와 invalid/oversized thumbnail sanitize 경로 smoke 가능
  - `scripts/snapshot_sort_visual_smoke.mjs` 로 local Chrome CDP 기준 실제 UI에서 `Saved` custom sort와 `Recent` fixed semantics visual smoke 가능
  - `scripts/snapshot_thumbnail_guard_copy_smoke.mts` 로 storage-mode guide/save-after warning copy, shared thumbnail max-length, API contract sanitize wording이 current thumbnail guard contract와 계속 정렬되는지 빠르게 smoke 가능
  - `docs/MIRROR_POLICY.md` 와 `scripts/check_doc_mirror.sh` 로 repo docs와 workspace docs mirror drift를 visibility-only 방식으로 점검 가능
  - `docs/PERSONAL_USE_RUNBOOK.md`, `docs/PERSONAL_USE_READINESS_PLAN.md`, `scripts/check_personal_use_ready.sh`, `scripts/run_dev.sh`, `scripts/personal_use_smoke.sh`, `scripts/backup_sqlite.sh` 로 Gun 단독 실사용 v0.9 사전점검·실행·검증·백업 경로를 점검 가능
- 참고
  - snapshot list 응답은 `ok`, `workspace_id`, `items` 구조로 general response shape 원칙과 정합됨
  - snapshot detail 응답은 `thumbnail_data_url` 포함, list 응답은 summary-only로 유지
  - 다음 권장 순서: visual smoke + guard copy/threshold/API contract smoke + payload sanitize smoke를 회귀 경로로 유지하고, 추가 UX polish 범위를 최소 단위로만 검토
  - current same-line UX baseline: save 이후 warning surface(local-only pre-save sanitize + server-side blank thumbnail 커버) + save 전 storage-mode guard hint + guard copy/threshold/API contract alignment smoke

## 운영 메모
- canonical working repo: `/Users/gun/dev/azvision`
- legacy copy: `/Users/gun/.openclaw/workspace/projects/azvision` 는 당분간 보존만 하고 새 작업은 이 repo 기준으로 진행
- GitHub remote: `https://github.com/ulttla/azvision`

## 디렉터리 구조
- `backend/` — FastAPI API 서버
- `frontend/` — React/Vite UI
- `docker-compose.yml` — 개발용 compose 초안
- `.env.example` — backend/frontend 환경 변수 예시

## 개인 실사용 v0.9 빠른 실행

Gun 단독 로컬 사용 기준으로는 아래 경로를 우선 사용한다. 자세한 절차는 `docs/PERSONAL_USE_RUNBOOK.md`, 범위/acceptance 기준은 `docs/PERSONAL_USE_READINESS_PLAN.md` 참고.

```bash
cd /Users/gun/dev/azvision
scripts/run_dev.sh
```

실행 후:
- API: `http://127.0.0.1:8000`
- UI: `http://127.0.0.1:5173`

로컬 readiness preflight와 실사용 smoke:

```bash
cd /Users/gun/dev/azvision
scripts/check_personal_use_ready.sh
scripts/personal_use_smoke.sh
```

SQLite 백업과 검증:

```bash
cd /Users/gun/dev/azvision
scripts/backup_sqlite.sh
scripts/verify_sqlite_backup.sh
```

## 빠른 시작

### 0) 환경 파일 준비
```bash
cd /Users/gun/dev/azvision
cp .env.example .env
```

- 권장 위치는 project root의 `.env`
- backend를 단독 실행할 때는 `backend/.env`도 지원
- frontend(Vite)도 `envDir: '..'` 기준으로 project root `.env`의 `VITE_*` 값을 함께 읽음
- Azure live read-test 전에는 `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CERT_PATH`를 실제 값으로 채워야 함

### Backend
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

개발 모드 메모:
- frontend 기본 API base는 `/api/v1`
- Vite dev server가 `127.0.0.1:5173` 에서 실행되며 `/api/*` 요청을 backend `127.0.0.1:8000` 으로 proxy 함
- 별도 `VITE_API_BASE_URL` 지정이 없으면 위 dev proxy 기준으로 동작

기본 주소:
- API: `http://127.0.0.1:8000`
- UI: `http://127.0.0.1:5173`

## CI baseline
- GitHub Actions에서 다음 최소 검증을 수행
  - backend dependency install
  - `python -m compileall app`
  - backend app import smoke
  - backend API smoke (`scripts/error_response_smoke.sh`, `scripts/snapshot_payload_smoke.sh`, `scripts/snapshot_sort_api_smoke.sh`)
  - frontend `npm ci` + `npm run build`
- Azure live auth/read-test, 실제 credential 의존 검증은 CI 범위에서 제외

## 메모
- 현재 구현 기준선: **Phase 1A DoD 완료 + Phase 1B server-backed snapshot/history + history foundation H1/H2 usable baseline**
- `GET /api/v1/auth/config-check` 는 env/cert 준비 상태를 확인
- `GET /api/v1/auth/read-test` 는 실제 Azure subscription / resource group read를 검증
- live topology/inference 점검은 `bash scripts/live_topology_probe.sh` 로 config-check → read-test → topology probe를 한 번에 수행 가능
- error response contract 점검은 `bash scripts/error_response_smoke.sh` 로 representative 400/404 응답 shape를 확인 가능
- snapshot summary/detail payload 점검은 `bash scripts/snapshot_payload_smoke.sh` 로 list는 thumbnail 제외, detail은 thumbnail 포함 계약과 invalid/oversized thumbnail sanitize 경로를 확인 가능
- snapshot sort semantics 점검은 `node --experimental-strip-types scripts/snapshot_sort_semantics_smoke.mts` 로 `Saved` custom sort와 `Recent` fixed semantics를 빠르게 smoke 가능
- snapshot sort visual smoke는 `node scripts/snapshot_sort_visual_smoke.mjs` 로 local Chrome CDP 기준 실제 UI 순서와 `Recent` tab sort-control 숨김까지 확인 가능
- docs mirror drift 점검은 `bash scripts/check_doc_mirror.sh` 로 수행하며, 예상된 one-side-only 항목은 `docs/MIRROR_POLICY.md` 의 Deferred Drift에 기록한다
- backend list query semantics 점검은 `bash scripts/snapshot_sort_api_smoke.sh` 로 `captured_at` / `last_restored_at` / `updated_at` / `pinned_first` / `include_archived` 조합을 live API 기준으로 smoke 가능
- `GET /api/v1/workspaces/{workspace_id}/subscriptions`
- `GET /api/v1/workspaces/{workspace_id}/resource-groups`
- `GET /api/v1/workspaces/{workspace_id}/resources`
- `POST /api/v1/workspaces/{workspace_id}/scans` 는 live inventory summary를 반환
- snapshot CRUD / import UX / local-server storage 구분 구현 완료; Architecture View 관련 구현은 repo에 남아 있는 확장 라인으로 취급
- 다음 권장 순서: visual smoke + guard copy/threshold/API contract smoke + payload sanitize smoke 유지 → thumbnail 장기 저장 전략 검토 → 필요 시 Phase 2(Cost) 진입 판단
