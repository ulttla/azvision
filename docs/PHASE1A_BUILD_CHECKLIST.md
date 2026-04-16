# AzVision Phase 1A Build Checklist

> 기준 문서: `PRODUCT_VISION.md`, `MVP_SCOPE.md`, `ARCHITECTURE.md`, `DATA_MODEL.md`, `API_CONTRACT.md`
> 현재 기준: **Phase 1A-only freeze final pass 완료**

## 0. Baseline 확정
- [x] Phase 1A only freeze 선언 고정
- [x] `PRODUCT_VISION / MVP_SCOPE / ARCHITECTURE / DATA_MODEL / API_CONTRACT` 정합성 정리
- [x] graph canonical identity 규칙 고정
  - `node_key = <node_type>:<node_ref>`
- [x] manual canonical ref 규칙 고정
  - `ManualNode.manual_ref`
  - `ManualEdge.manual_edge_ref`
- [x] auth 범위 축소
  - server-side configured credential profile
  - diagnostics read only

## 1. Auth / Azure read 준비
- [ ] App Registration 실제 생성
- [ ] certificate 기반 app-only auth 값 확보
  - tenant id
  - client id
  - certificate thumbprint / 경로
- [ ] 최소 read 권한 범위 확정
- [x] local / dev 환경용 설정값 배치 방식 확정
- [x] `GET /auth/config-check` 구현
- [x] `GET /auth/read-test` live wiring 구현
- [ ] 멀티 subscription read 성공 기준 정의
  - 최소 2개 subscription read
  - 현재 상태: existing `.env` 기준 auth ready / token acquire / single subscription read 성공
  - 2026-04-16 live probe: subscription 1개, sample resource group 7개, topology projection `node_count=50`, `edge_count=55`, inferred edge 6개 확인
  - env discovery 개선: project root `.env` 우선 + `backend/.env` fallback 지원
## 2. Backend scaffold
- [x] FastAPI app skeleton 정리
- [x] workspace / scan / topology 라우터 골격 생성
- [x] settings / config loader 분리
- [ ] Azure client 초기화 레이어 분리
- [x] scan orchestration 초안 추가
- [ ] error model / API response shape 공통화

## 3. Discovery 구현
- [ ] subscription enumerator 구현
- [ ] resource group fetcher 구현
- [ ] resource fetcher 구현
  - type
  - location
  - tags
- [ ] network relationship resolver 1차 구현
- [ ] ScanRun 저장 구조 반영
- [ ] 첫 live scan 결과를 SQLite에 저장

## 4. Data model / persistence
- [x] SQLite schema 초안 작성
- [x] Workspace / CredentialProfile / ScanRun 테이블 생성
- [x] Subscription / ResourceGroup / ResourceNode 테이블 생성
- [x] RelationshipEdge / ManualNode / ManualEdge 테이블 생성
- [x] canonical identity projection 규칙 반영
- [x] manual_ref / manual_edge_ref 생성 규칙 확정

## 5. Topology API
- [x] `GET /workspaces/{workspace_id}/topology` 구현
- [x] topology payload에 필수 필드 포함
  - node: `node_key`, `node_type`, `node_ref`, `display_name`, `source`, `confidence`
  - edge: `source_node_key`, `target_node_key`, `relation_type`, `source`, `confidence`
- [x] `GET /workspaces/{workspace_id}/topology/node-detail` 구현
- [x] `POST /topology/manual-nodes` 구현
- [x] `POST /topology/manual-edges` 구현
- [x] `PATCH /DELETE` manual node/edge 구현
- [x] 생성 응답에 canonical ref 반환 규칙 명시

## 6. Frontend scaffold
- [x] React + Vite 구조 정리
- [x] workspace selector 화면 초안
- [x] subscription selector 초안
- [x] topology canvas 연결
- [x] detail side panel 초안
- [x] manual edit panel 초안
- [x] empty / loading / error state 정의
- [x] frontend build 검증 (`npm run build`)

## 7. Graph rendering
- [x] mock topology 데이터를 canonical payload 형식으로 정리
- [x] live topology API와 Cytoscape 연결
- [x] subscription / resource group / resource / manual node 렌더링 규칙 확정
- [x] edge style / relation type style 1차 반영
- [ ] source / confidence badge 또는 tooltip 1차 반영
- [x] node detail panel 연결

## 8. Manual modeling
- [x] manual node 생성 폼
- [x] manual edge 생성 폼
- [x] manual node 수정 / 삭제
- [x] manual edge 수정 / 삭제
  - E2E smoke: create/list/update/delete via API + topology merge verified (2026-04-16)
  - mixed topology merge smoke: manual node + cross-source edges (manual→azure) verified (2026-04-16)
- [x] manual node 기본 confidence 정책 반영 (default 1.0)
- [x] manual edge 기본 confidence 정책 반영 (default 1.0)

## 9. Export
- [ ] PNG export 구현
- [ ] export API 연결
- [ ] 큰 topology 기준 export 실패 케이스 확인
- [ ] 파일명 규칙 정리

## 10. Definition of Done (Phase 1A)
- [ ] 최소 2개 이상의 subscription read 성공
- [ ] topology graph가 실제 Azure 데이터로 렌더링됨
- [x] manual node / edge 추가 가능
- [ ] PNG export 가능
- [x] workspace 분리 구조 유지
- [ ] 1A out-of-scope 기능이 구현에 침투하지 않음
  - Arc 1급 표현
  - PDF
  - snapshot compare
  - cost
  - simulation
  - copilot

## 11. 다음 reviewer 게이트
- [ ] `AEGIS`: app-only auth / permission scope review (live Azure 연결 직전)
- [ ] `BOLT`: 멀티 subscription read test 또는 topology scaffold 첫 구현 리뷰
- [ ] `VERA`: scope drift 의심 시에만 재호출

## Sprint 0 산출물
- `backend/` FastAPI scaffold
- `frontend/` React/Vite scaffold
- `docker-compose.yml`
- `.env.example`
- backend python compile smoke check 통과
- backend local run + `/healthz`, `/api/v1/auth/config-check`, `/api/v1/auth/read-test`, `/api/v1/workspaces/local-demo/topology` 응답 확인
- `azure-identity` 기반 certificate auth provider 추가
- frontend `npm install` 완료
- frontend `npm run build` 성공
- npm audit 기준 moderate 2건 존재 (추후 정리)
