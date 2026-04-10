# AzVision Architecture

## 개요
AzVision은 수집, 정규화, 그래프 모델링, 수동 보강, 비용 분석, 시뮬레이션, export를 분리한 모듈형 웹 앱이다.

## 기술 스택
- Backend: Python + FastAPI
- Frontend: TypeScript + React + Vite
- Graph UI: Cytoscape.js
- Storage: SQLite 우선
- Deployment: Docker / Docker Compose

## 시스템 레이어

### Phase 1A core
| Layer | Responsibility |
|---|---|
| Discovery | Azure Resource Graph, Azure SDK, service-specific connectors 수집 |
| Normalization | 서로 다른 리소스 응답을 공통 스키마로 변환 |
| Graph Model | node, edge, relationship, confidence 관리 |
| Manual Modeling | 외부 자산과 제3자 관계를 수동 입력 |
| Export Engine | PNG 생성 |

### Future phase (Phase 1B+)
| Layer | Phase | Responsibility |
|---|---|---|
| Hybrid Connector | 1B | Azure Arc 연결 자산 통합, source/confidence 보강 |
| Export Engine (확장) | 1B | PDF, SVG export |
| Snapshot Manager | 1B | topology snapshot 저장 및 비교 |
| Cost Engine | 2 | 현재 비용 구조와 절감 가능성 분석 |
| Simulation Engine | 3 | 변경안의 비용/구조 영향 계산 |
| AI Copilot | 3 | 선택형 질의 보조, BYOK 기반 |

## 주요 모듈
### Backend (Phase 1A)
- auth module
- scan orchestration
- topology API
- manual modeling API
- export API (PNG only)

### Frontend (Phase 1A)
- workspace selector
- subscription selector
- topology canvas
- detail side panel
- manual edit panel
- export dialog (PNG)

### Collector (Phase 1A)
- Azure subscription enumerator
- resource graph fetcher
- network relationship resolver

### Collector (Phase 1B+)
- Arc connector (1B)
- service-specific enrichers (향후)

## 데이터 흐름
1. 사용자 또는 스케줄러가 scan 요청을 보낸다
2. collector가 Azure 관련 데이터를 읽는다
3. normalizer가 공통 node / edge 모델로 변환한다
4. graph model이 자동 수집 결과와 manual 데이터를 병합한다
5. topology UI가 렌더링한다
6. export engine이 이미지로 출력한다
7. (향후) cost engine이 비용 메타를 계산한다
8. (향후) optional copilot이 결과를 설명한다

## Graph Node Identity 규칙
- 모든 graph node의 **public / canonical identity** 는 `node_key = <node_type>:<node_ref>` 로 정의한다
- `node_type`: `resource`, `manual`, `resourcegroup`, `subscription`
- `node_ref`: 해당 type의 고유 식별자
  - `resource`: `resource_id` (Azure ARM resource ID)
  - `manual`: `ManualNode.manual_ref` (public opaque ref)
  - `resourcegroup`: `ResourceGroup.resource_id`
  - `subscription`: `Subscription.subscription_id`
- topology API와 graph payload는 내부 PK가 아니라 `node_key`, `node_type`, `node_ref`를 사용한다
- DB 내부 PK는 persistence 전용이며 외부 계약의 canonical identity로 사용하지 않는다
- graph layer는 `Subscription`, `ResourceGroup`, `ResourceNode`, `ManualNode` 테이블에서 topology projection을 materialize 한다

## 확장 방식
- connector plugin 방식으로 서비스별 수집기 추가
- manual node / edge는 별도 저장소로 관리
- provider abstraction으로 LLM 교체 가능
- workspace 단위로 회사별 설정 분리

## 보안 원칙
- read-only 중심
- certificate 기반 app-only 인증 우선
- secret보다 certificate 우선
- LLM API key는 사용자가 직접 입력하는 BYOK만 허용
- company/workspace 분리로 데이터 혼선 방지

## 배포 원칙
- 로컬, NAS, mini PC, Linux 서버에서 동일하게 운영 가능해야 한다
- Docker Compose로 재현 가능해야 한다
- Tailscale로 외부 접근을 단순화한다
