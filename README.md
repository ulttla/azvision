# AzVision

Azure topology explorer 기반의 AzVision 개발 repo.

## 현재 상태
- Phase 1B 기준 server-backed snapshot/history 1차 구현 완료
- FastAPI backend + SQLite persistence + snapshot CRUD 반영 완료
- React + Vite frontend에서 local/server dual-mode snapshot provider 지원
- import CTA / dedup / source badge / notice persistence / responsive polish 1차 반영 완료

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
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

기본 주소:
- API: `http://localhost:8000`
- UI: `http://localhost:5173`

## CI baseline
- GitHub Actions에서 다음 최소 검증을 수행
  - backend dependency install
  - `python -m compileall app`
  - backend app import smoke
  - frontend `npm ci` + `npm run build`
- Azure live auth/read-test, 실제 credential 의존 검증은 CI 범위에서 제외

## 메모
- 현재는 **Phase 1B server-backed snapshot/history 1차 완료 + 새 repo baseline 정리 단계**
- `GET /api/v1/auth/config-check` 는 env/cert 준비 상태를 확인
- `GET /api/v1/auth/read-test` 는 실제 Azure subscription / resource group read를 검증
- `GET /api/v1/workspaces/{workspace_id}/subscriptions`
- `GET /api/v1/workspaces/{workspace_id}/resource-groups`
- `GET /api/v1/workspaces/{workspace_id}/resources`
- `POST /api/v1/workspaces/{workspace_id}/scans` 는 live inventory summary를 반환
- snapshot CRUD / import UX / local-server storage 구분은 현재 구현 반영 상태
- 다음 권장 순서: repo CI 안정화 → 필요 시 branch protection/PR rule → topology live 고도화 or Cytoscape style 외부화
