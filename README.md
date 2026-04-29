# AzVision

Azure topology explorer 기반의 AzVision 개발 repo.

## 현재 상태
- 현재 active 기준은 **Phase 1B server-backed snapshot/history + history foundation H1/H2 usable baseline 완료**
- 제품 기준선은 **single-user first** 이다. 현재 `workspace`는 한 사용자/한 배포 안에서 Azure scope와 저장 데이터를 구분하는 프로젝트 단위이며, user login / multi-user / permission model / language toggle은 productization 단계로 보류한다.
- backend
  - SQLite `manual_nodes` / `manual_edges` 기반 DB-backed CRUD 구현 완료
  - topology 응답에 manual node/edge merge 반영 완료
  - ARM property의 Azure resource ID reference 기반 explicit network relationship edge(`source=azure-explicit`, `confidence=1.0`) 생성 경로 추가 완료. 현재 범위는 VM/NIC/Subnet/Public IP/NSG/Route Table/VNet peering/Private Endpoint/LB/AppGW 주요 관계
  - live resource 목록 수집 시 network/compute 주요 타입은 detail GET으로 relationship property를 best-effort 보강함
  - SQLite `snapshots` table + 운영 메타 컬럼(`captured_at`, `last_restored_at`, `restore_count`, `is_pinned`, `archived_at`) 반영 완료
  - snapshot CRUD + restore-events endpoint 구현 완료
  - snapshot compare first-pass endpoint 구현 완료. 현재는 saved view-state metadata 기준으로 count/scope/compare_refs 차이를 반환하며, raw topology archival diff는 별도 장기 과제로 둠
  - list sort/filter query (`sort_by`, `sort_order`, `include_archived`, `pinned_first`) 구현 완료
  - rule-based Cost Intelligence first-pass endpoint(`/cost/summary`, `/cost/resources`, `/cost/recommendations`, `/cost/report`) 구현 완료. 실제 Cost Management 금액 수집 전까지 비용 금액은 `unknown-cost-data` 로 명시하고 cost driver signal 및 `noop` cost ingestion provider hook을 제공
  - frontend `Cost Insights` view에서 rule-based cost summary/recommendations/resource prompts 및 markdown report download 확인 가능
  - `/chat` rule-based copilot first-pass 구현 완료. 현재는 `llm_status=not_configured`, `provider=rule-based` 로 실제 LLM 연결 전 구조/비용/네트워크 질문에 대한 deterministic answer/suggestions를 반환
  - `/simulations` rule-based first-pass 구현 완료. workload 설명 기반 recommended resources, architecture/cost/security notes, next actions, assumptions를 생성하고 SQLite에 저장. 각 simulation은 markdown report, non-deployable Bicep outline template, resource-limit scoped current inventory fit 비교와 frontend download action으로 확인 가능
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
  - `scripts/snapshot_compare_smoke.sh` 로 metadata-level snapshot compare endpoint를 live API 기준으로 smoke 가능
  - `scripts/cost_report_smoke.sh` 로 rule-based cost markdown report endpoint를 live API 기준으로 smoke 가능
  - `scripts/simulation_smoke.sh` 로 simulation create/list/detail/template/report/fit API 계약을 smoke 가능
  - `scripts/sqlite_health_check.py` 로 local SQLite integrity, journal mode, snapshot/thumbnail size, simulation JSON size signal을 read-only로 점검 가능
  - `scripts/check_doc_mirror.sh` 는 기본 visibility-only이고, `AZVISION_DOC_MIRROR_STRICT=1` 설정 시 mirror drift를 실패로 처리 가능
  - `scripts/snapshot_sort_visual_smoke.mjs` 로 local Chrome CDP 기준 실제 UI에서 `Saved` custom sort와 `Recent` fixed semantics visual smoke 가능
  - `scripts/snapshot_thumbnail_guard_copy_smoke.mts` 로 storage-mode guide/save-after warning copy, shared thumbnail max-length, API contract sanitize wording이 current thumbnail guard contract와 계속 정렬되는지 빠르게 smoke 가능
  - `docs/MIRROR_POLICY.md` 와 `scripts/check_doc_mirror.sh` 로 repo docs와 workspace docs mirror drift를 visibility-only 방식으로 점검 가능
  - `docs/PERSONAL_USE_RUNBOOK.md`, `docs/PERSONAL_USE_READINESS_PLAN.md`, `scripts/check_personal_use_ready.sh`, `scripts/run_dev.sh`, `scripts/personal_use_smoke.sh`, `scripts/backup_sqlite.sh` 로 Gun 단독 실사용 v0.9 사전점검·실행·검증·백업 경로를 점검 가능
- 참고
  - snapshot list 응답은 `ok`, `workspace_id`, `items` 구조로 general response shape 원칙과 정합됨
  - snapshot detail 응답은 `thumbnail_data_url` 포함, list 응답은 summary-only로 유지
  - 다음 권장 순서: explicit network relationship regression + visual smoke + guard copy/threshold/API contract smoke + payload sanitize smoke를 회귀 경로로 유지하고, 추가 UX polish 범위를 최소 단위로만 검토
  - current same-line UX baseline: save 이후 warning surface(local-only pre-save sanitize + server-side blank thumbnail 커버) + save 전 storage-mode guard hint + guard copy/threshold/API contract alignment smoke

## Provider extension notes
- Cost ingestion / Copilot provider hook의 현재 계약과 향후 교체 지점은 `docs/PROVIDER_EXTENSION_NOTES.md` 참고.

## 운영 메모
- canonical working repo: `/Users/gun/dev/azvision`
- legacy copy는 `/Users/gun/.openclaw/workspace/projects/azvision.legacy_archive_20260412_012338` 로 archive 처리 완료. 새 작업은 이 repo 기준으로 진행
- GitHub remote: `https://github.com/ulttla/azvision`

## 디렉터리 구조
- `backend/` — FastAPI API 서버
- `frontend/` — React/Vite UI
- `docker-compose.yml` — 개발용 compose 초안
- `.env.example` — backend/frontend 환경 변수 예시

## 개인 실사용 v0.9 빠른 실행

Gun 단독 로컬 사용 기준으로는 아래 경로를 우선 사용한다. 자세한 절차는 `docs/PERSONAL_USE_RUNBOOK.md`, 범위/acceptance 기준은 `docs/PERSONAL_USE_READINESS_PLAN.md`, 운영 메모는 `docs/PERSONAL_USE_SESSION_NOTES.md` 참고.

```bash
cd /Users/gun/dev/azvision
scripts/run_dev.sh
```

실행 후:
- API: `http://127.0.0.1:8000`
- UI: `http://127.0.0.1:5173`

로컬 readiness preflight, 실사용 smoke, 전체 acceptance:

```bash
cd /Users/gun/dev/azvision
scripts/check_personal_use_ready.sh
scripts/personal_use_smoke.sh
scripts/personal_use_acceptance.sh
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
  - backend API smoke (`scripts/error_response_smoke.sh`, `scripts/snapshot_payload_smoke.sh`, `scripts/snapshot_sort_api_smoke.sh`, `scripts/snapshot_compare_smoke.sh`, `scripts/cost_report_smoke.sh`, `scripts/simulation_smoke.sh`)
  - read-only SQLite health check (`scripts/sqlite_health_check.py`)
  - frontend `npm ci` + `npm run build`
- Azure live auth/read-test, 실제 credential 의존 검증은 CI 범위에서 제외

## 메모
- 현재 구현 기준선: **Phase 1A DoD 완료 + Phase 1B server-backed snapshot/history + history foundation H1/H2 usable baseline**
- `GET /api/v1/auth/config-check` 는 env/cert 준비 상태를 확인
- `GET /api/v1/auth/read-test` 는 실제 Azure subscription / resource group read를 검증
- live topology/inference 점검은 `bash scripts/live_topology_probe.sh` 로 config-check → read-test → topology probe를 한 번에 수행 가능
- error response contract 점검은 `bash scripts/error_response_smoke.sh` 로 representative 400/404 응답 shape를 확인 가능
- snapshot summary/detail payload 점검은 `bash scripts/snapshot_payload_smoke.sh` 로 list는 thumbnail 제외, detail은 thumbnail 포함 계약과 invalid/oversized thumbnail sanitize 경로를 확인 가능
- snapshot compare endpoint 점검은 `bash scripts/snapshot_compare_smoke.sh` 로 metadata-level count/scope/compare_refs delta 계약을 확인 가능
- cost markdown report endpoint 점검은 `bash scripts/cost_report_smoke.sh` 로 rule-based report payload와 guardrail 문구를 확인 가능
- simulation endpoint 점검은 `bash scripts/simulation_smoke.sh` 로 create/list/detail/template/report/fit 계약을 확인 가능
- snapshot sort semantics 점검은 `node --experimental-strip-types scripts/snapshot_sort_semantics_smoke.mts` 로 `Saved` custom sort와 `Recent` fixed semantics를 빠르게 smoke 가능
- snapshot sort visual smoke는 `node scripts/snapshot_sort_visual_smoke.mjs` 로 local Chrome CDP 기준 실제 UI 순서와 `Recent` tab sort-control 숨김까지 확인 가능
- docs mirror drift 점검은 `bash scripts/check_doc_mirror.sh` 로 수행하며, 예상된 one-side-only 항목은 `docs/MIRROR_POLICY.md` 의 Deferred Drift에 기록한다
- backend list query semantics 점검은 `bash scripts/snapshot_sort_api_smoke.sh` 로 `captured_at` / `last_restored_at` / `updated_at` / `pinned_first` / `include_archived` 조합을 live API 기준으로 smoke 가능
- `GET /api/v1/workspaces/{workspace_id}/subscriptions`
- `GET /api/v1/workspaces/{workspace_id}/resource-groups`
- `GET /api/v1/workspaces/{workspace_id}/resources`
- `POST /api/v1/workspaces/{workspace_id}/scans` 는 live inventory summary를 반환
- snapshot CRUD / import UX / local-server storage 구분 / metadata-level snapshot compare first-pass 구현 완료; Architecture View 관련 구현은 repo에 남아 있는 확장 라인으로 취급
- Cost Intelligence first-pass는 rule-based recommendation까지 구현됐고, 실제 Azure Cost Management ingestion / dollar amount mapping은 다음 Phase 2 세부 작업으로 남는다
- 다음 권장 순서: explicit network relationship regression + cost recommendation regression + visual smoke + guard copy/threshold/API contract smoke + payload sanitize smoke 유지 → Azure Cost Management ingestion 또는 AI Copilot skeleton 진입 판단
