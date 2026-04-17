# AzVision

Azure topology explorer 기반의 AzVision 개발 repo.

## 현재 상태
- 현재 active closeout 기준은 **Phase 1A manual modeling usable baseline 완료 + push-ready 정리 단계**
- backend
  - SQLite `manual_nodes` / `manual_edges` 기반 DB-backed CRUD 구현 완료
  - topology 응답에 manual node/edge merge 반영 완료
  - local runtime smoke 기준 `/` / `/healthz` 200 확인
  - existing `.env` 기준 live auth `config-check` / `read-test` / topology probe 동작 확인
- frontend
  - `TopologyPage`에서 workspace / subscription / resource group scope 제어, Cytoscape canvas, node detail, manual node/edge create/update/delete UI 동작
  - `tsc --noEmit`, `vite build` 통과
- 검증
  - manual node/edge CRUD / PATCH / cleanup smoke 통과
  - manual edge full E2E(create/list/update/delete) smoke 통과
  - manual + scan node mixed topology merge smoke 통과
  - backend compile smoke 통과
  - live topology probe PASS
    - auth ready / token acquire / subscription 2개 read 성공 (`Kepion Sub`, `Azure Sub for Select Wines`)
    - sample resource group 7개 확인
    - topology projection `node_count=50`, `edge_count=55`, inferred edge 6개 확인
- 문서/운영 상태
  - `docs/API_CONTRACT.md` 는 current manual CRUD/PATCH 구조와 정합
  - `docs/PHASE1A_BUILD_CHECKLIST.md` 는 manual modeling E2E 기준으로 최신화 진행 중
- 참고
  - repo 안에는 이전 라운드의 Phase 1B snapshot/history 및 Architecture View 구현도 그대로 포함되어 있음
  - 다만 현재 작업 기준선과 다음 의사결정은 Phase 1A closeout sync 이후 `push 여부`와 `다음 트랙 선택`에 맞춰짐

## 운영 메모
- canonical working repo: `/Users/gun/dev/azvision`
- legacy copy: `/Users/gun/.openclaw/workspace/projects/azvision` 는 당분간 보존만 하고 새 작업은 이 repo 기준으로 진행
- GitHub remote: `https://github.com/ulttla/azvision`

## 디렉터리 구조
- `backend/` — FastAPI API 서버
- `frontend/` — React/Vite UI
- `docker-compose.yml` — 개발용 compose 초안
- `.env.example` — backend/frontend 환경 변수 예시

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
  - frontend `npm ci` + `npm run build`
- Azure live auth/read-test, 실제 credential 의존 검증은 CI 범위에서 제외

## 메모
- 현재 closeout 기준 핵심은 **manual modeling 1차 완료 상태를 장기 문서/README/checklist와 맞추고 push 또는 다음 트랙 진입 판단을 내리는 것**
- `GET /api/v1/auth/config-check` 는 env/cert 준비 상태를 확인
- `GET /api/v1/auth/read-test` 는 실제 Azure subscription / resource group read를 검증
- live topology/inference 점검은 `bash scripts/live_topology_probe.sh` 로 config-check → read-test → topology probe를 한 번에 수행 가능
- `GET /api/v1/workspaces/{workspace_id}/subscriptions`
- `GET /api/v1/workspaces/{workspace_id}/resource-groups`
- `GET /api/v1/workspaces/{workspace_id}/resources`
- `POST /api/v1/workspaces/{workspace_id}/scans` 는 live inventory summary를 반환
- snapshot CRUD / import UX / local-server storage 구분, Architecture View 관련 구현은 repo에 남아 있는 확장 라인으로 취급
- 다음 권장 순서: 2-subscription live read 성공 결과를 기준 문서에 반영 → backend cleanup(Azure client init / error response 공통화) → 필요 시 같은 Phase 1A 목표선 안의 다음 기능/정리 작업
