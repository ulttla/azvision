# AzVision 채널 초기 안내문

## 채널 목적
`#azvision-dev`는 `AzVision` 프로젝트의 설계, 구현, 검토를 위한 전용 개발 채널이다.
이 프로젝트의 목적은 회사 Azure와 그에 연결된 hybrid 환경을 읽기 전용으로 수집하고, 관계를 그래프로 시각화하며, 이후 비용 분석, 변경 시뮬레이션, export까지 제공하는 것이다.

## 최종 제품 정의
`AzVision`은 Azure 및 연계 hybrid 환경을 자동 수집하고, 부족한 외부/제3자 구성을 수동으로 보강하며, 그 위에서 topology 시각화, 비용 분석, what-if 시뮬레이션, PDF 및 이미지 export를 제공하는 아키텍트용 플랫폼이다.

## 목표 단계
### 1차 목표
- Azure 전 서비스의 핵심 자산과 관계를 수집
- Azure Arc 및 직접 연결된 hybrid 환경까지 포함한 topology graph 구현
- manual node / edge 추가 기능으로 제3자 소프트웨어와 외부 자산도 표현
- PNG 중심의 빠른 export 제공

### 2차 목표
- 현재 지출 구조를 설명
- 절감 가능 포인트 제안
- 변경 후 예상 비용 산출
- PDF 보고서 export 제공

### 3차 목표
- 신규 서비스 추가, SKU 변경, HA / DR 변경 등의 시뮬레이션
- 대화형 질의 기반 분석 지원
- LLM copilot 연동은 선택형으로 제공

## 기술 방향
- Backend: `Python + FastAPI`
- Frontend: `TypeScript + React + Vite`
- Graph UI: `Cytoscape.js`
- Storage: `SQLite` 우선
- Deployment: `Docker` / `Docker Compose`
- Remote access: `Tailscale`

## 설계 원칙
- 브라우저 기반 웹앱으로 제공해 설치 부담을 줄인다
- 회사별 workspace를 분리하되, 현재는 single-user deployment 안에서 Azure scope와 저장 데이터를 나누는 프로젝트 단위로 취급한다
- Azure 자동 수집과 수동 보강을 함께 지원한다
- core 기능은 LLM 없이도 동작해야 한다
- 비용 분석과 시뮬레이션은 독립 엔진으로 분리한다
- export는 보고서 공유와 회의용 전달을 위해 초기부터 고려한다

## 지원 범위
### 자동 수집 우선 대상
- Management Group
- Subscription
- Resource Group
- Virtual Network
- Subnet
- Network Security Group
- Network Interface
- Virtual Machine
- Load Balancer
- Public IP
- Storage
- App Service
- SQL 계열 서비스
- Azure Arc 연결 자산

### 수동 보강 대상
- 제3자 SaaS
- 외부 보안 장비
- 온프레미스 시스템
- 운영상 논리 의존성
- Azure 외부의 직접 연결 자산

## export 우선순위
- 1순위: PNG
- 2순위: PDF
- 보조: SVG, JSON, CSV

## 개발 가드레일
- 1차에서는 정확한 수집과 구조 시각화에 집중
- 비용 계산과 시뮬레이션은 후순위로 분리
- read-only 중심 원칙 유지
- manual node / edge는 정식 데이터로 취급
- provider별 LLM 키는 사용자가 직접 넣는 BYOK 방식만 허용

## 작업 시작 시 기본 질문
- 현재 수집 대상 subscription 범위는 어디까지인가?
- 1차 topology에 포함할 네트워크 객체는 어디까지인가?
- 저장소는 SQLite만으로 충분한가, 아니면 이후 Postgres 전환까지 고려할 것인가?
- export는 PNG 우선인지, PDF 보고서 우선인지?

## 추천 시작점
가장 먼저 할 일은 certificate 기반 app-only 인증으로 멀티 subscription read test를 통과시키는 것이다.
그다음 topology graph를 가장 작은 단위로 먼저 보여주는 MVP를 만든다.
