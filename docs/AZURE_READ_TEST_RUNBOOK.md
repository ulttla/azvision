# AzVision Azure Read Test Runbook

## 목적
AzVision backend가 Azure에 정상적으로 app-only 인증하고, 최소한 subscription과 resource group을 읽을 수 있는지 검증한다.

## 전제 조건
- App Registration 생성 완료
- certificate 업로드 완료
- target subscription에 Reader 할당 완료
- backend requirements 설치 완료

## 1. 환경 변수 준비
파일:
- 권장: `/Users/gun/dev/azvision/.env`
- 대안: `/Users/gun/dev/azvision/backend/.env`

예시:
```env
AZVISION_ENV=development
AZVISION_CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
AZURE_TENANT_ID=<tenant-id>
AZURE_CLIENT_ID=<client-id>
AZURE_CERT_PATH=/absolute/path/to/azvision-cert.pem
AZURE_CERT_PASSWORD=
AZURE_CLOUD=public
```

메모:
- backend는 project root `.env`를 우선 읽고, 없으면 `backend/.env`도 지원
- 최소 필수값은 `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CERT_PATH`

## 2. backend 실행
```bash
cd /Users/gun/dev/azvision/backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## 3. 첫 점검
### config check
```bash
curl http://localhost:8000/api/v1/auth/config-check
```

기대 결과:
- tenant/client/cert path configured = true
- certificate path exists = true
- azure_cloud = public
- `discovered_env_files`에 실제 읽힌 `.env` 경로가 표시됨

### read test
```bash
curl http://localhost:8000/api/v1/auth/read-test
```

기대 결과:
- `ok: true`
- `token_acquired: true`
- `accessible_subscriptions` 배열 존재
- `sample_resource_groups` 배열 존재 또는 빈 배열

## 성공 판정
- 토큰 발급 성공
- subscription 1개 이상 조회 성공
- resource group 샘플 조회 성공

## 실패 패턴과 해석
### `Missing required Azure settings`
원인:
- `.env` 값 누락
- backend가 예상 위치의 `.env`를 읽지 못함
조치:
- tenant/client/cert path 재확인
- `config-check`의 `discovered_env_files` 확인

### `Certificate file not found`
원인:
- cert 경로 오타 또는 mount 실패
조치:
- 절대 경로 재확인
- Docker volume / secret mount 확인

### `AADSTS700027` 또는 certificate 관련 오류
원인:
- 업로드한 public cert와 local private key 불일치
조치:
- certificate pair 재생성 또는 업로드 재확인

### `AuthorizationFailed`
원인:
- target subscription에 Reader 미할당
조치:
- IAM role assignment 확인

### subscription은 보이는데 resource group이 안 보임
원인 후보:
- 특정 subscription scope 문제
- ARM API 접근 제한
조치:
- 개별 subscription role assignment와 상태 확인

## 4. live topology probe
backend가 실행 중이면 아래 스크립트로 config-check → read-test → topology inference까지 한 번에 점검할 수 있다.

```bash
cd /Users/gun/dev/azvision
bash scripts/live_topology_probe.sh
```

옵션 예시:
```bash
cd /Users/gun/dev/azvision
AZVISION_SUBSCRIPTION_ID=<subscription-id> \
AZVISION_RESOURCE_GROUP_NAME=<resource-group> \
bash scripts/live_topology_probe.sh
```

스크립트 동작:
- `GET /api/v1/auth/config-check`
- `GET /api/v1/auth/read-test`
- `GET /api/v1/workspaces/local-demo/topology?include_network_inference=true`
- 결과 JSON은 `/tmp/azvision_*` 파일로 저장

## 다음 단계
read test / topology probe 성공 후 진행 순서:
1. 실제 live inventory 기준 inferred edge precision 검토
2. false positive / false negative 패턴 정리
3. 필요 시 heuristic rule 또는 evidence threshold 보정
4. live data 기반 graph 렌더링 품질 점검
