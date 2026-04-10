# AzVision

Phase 1A 구현 착수용 scaffold.

## 현재 범위
- FastAPI backend 골격
- SQLite/SQLModel 모델 초안
- auth diagnostics / workspace / scan / topology mock API
- React + Vite frontend shell
- topology placeholder 화면

## 디렉터리 구조
- `backend/` — FastAPI API 서버
- `frontend/` — React/Vite UI
- `docker-compose.yml` — 개발용 compose 초안
- `.env.example` — backend/frontend 환경 변수 예시

## 빠른 시작

### 0) 환경 파일 준비
```bash
cd /Users/gun/.openclaw/workspace/projects/azvision
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

## 메모
- 현재는 **Phase 1A live auth/read-test 완료 + inventory collector 1차 연결 단계**
- `GET /api/v1/auth/config-check` 는 env/cert 준비 상태를 확인
- `GET /api/v1/auth/read-test` 는 실제 Azure subscription / resource group read를 검증
- `GET /api/v1/workspaces/{workspace_id}/subscriptions`
- `GET /api/v1/workspaces/{workspace_id}/resource-groups`
- `GET /api/v1/workspaces/{workspace_id}/resources`
- `POST /api/v1/workspaces/{workspace_id}/scans` 는 live inventory summary를 반환
- 다음 권장 순서: topology mock → live projection 전환 → Resource Graph / network relation resolver 추가
