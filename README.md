# AzVision

Azure topology explorer 기반의 AzVision 개발 repo.

## 현재 상태
- Phase 1B 기준 server-backed snapshot/history 1차 구현 완료
- snapshot history foundation 후속 설계 초안 추가 완료 (`docs/SNAPSHOT_HISTORY_FOUNDATION_PLAN.md`)
- H1 minimal implementation 반영: snapshot `captured_at / last_restored_at / restore_count / is_pinned / archived_at`, restore-event API, frontend pin/archive/usage meta UI
- FastAPI backend + SQLite persistence + snapshot CRUD 반영 완료
- React + Vite frontend에서 local/server dual-mode snapshot provider 지원
- import CTA / dedup / source badge / notice persistence / responsive polish 1차 반영 완료
- Architecture View MVP 1차 usable 상태
  - `Topology View / Architecture View` 전환
  - compact stage pipeline / simplified edge / SVG export
  - browser-local hide/show override delta
  - label readability + short alias pass 반영

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
- 현재는 **Phase 1B server-backed snapshot/history 1차 완료 + Architecture View MVP usable baseline 확보 단계**
- `GET /api/v1/auth/config-check` 는 env/cert 준비 상태를 확인
- `GET /api/v1/auth/read-test` 는 실제 Azure subscription / resource group read를 검증
- live topology/inference 점검은 `bash scripts/live_topology_probe.sh` 로 config-check → read-test → topology probe를 한 번에 수행 가능
- `GET /api/v1/workspaces/{workspace_id}/subscriptions`
- `GET /api/v1/workspaces/{workspace_id}/resource-groups`
- `GET /api/v1/workspaces/{workspace_id}/resources`
- `POST /api/v1/workspaces/{workspace_id}/scans` 는 live inventory summary를 반환
- snapshot CRUD / import UX / local-server storage 구분은 현재 구현 반영 상태
- 다음 권장 순서: snapshot history foundation(H1) 범위 확정 → backend history meta/restore-event 최소 구현 → frontend snapshot card/pinned/archive UX → 필요 시 branch protection/PR rule 또는 topology live 고도화
