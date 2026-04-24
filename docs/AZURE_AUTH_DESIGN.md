# AzVision Azure 인증 설계

## 목적
AzVision은 사용자 로그인 없이 회사 Azure 환경을 읽기 전용으로 수집해야 한다.
이를 위해 1차 구현은 `Microsoft Entra App Registration + certificate 기반 app-only 인증`을 기본으로 사용한다.

## 설계 목표
- 사용자 브라우저 로그인 없이 백엔드에서 자동 스캔 가능
- client secret 대신 certificate 사용
- read-only 원칙 유지
- 멀티 subscription 및 향후 multi-workspace 구조 지원
- user login / multi-user permission model은 현재 인증 설계 범위에서 제외
- NAS Docker 환경에서도 안정적으로 운영 가능

## 기본 인증 모델
### 방식
- 인증 주체: App Registration 기반 application identity
- 토큰 획득 방식: client credentials flow
- 자격 증명: X.509 certificate
- 실행 위치: AzVision backend

### 핵심 이유
- 배치 스캔과 스케줄 실행에 적합
- 사용자 세션 의존성 제거
- secret보다 장기 운영에 유리
- workspace 단위 credential 분리에 적합

## 1차 권장 범위
### tenant 모델
- 1차는 `single tenant` 기준으로 시작
- 향후 consultant 재사용을 위해 workspace마다 별도 tenant / app / certificate profile을 둘 수 있게 설계
- 현재 workspace별 credential 구상은 single-user 운영 편의를 위한 프로젝트 분리이며, 사용자별 권한 모델은 아니다

### scope 모델
- management group을 쓰는 회사는 상위 scope 기반 할당 검토
- 초기 MVP는 현실적으로 `target subscriptions` 기준 read access부터 시작
- management group 전체 확장은 이후 단계에서 추가

## Azure 측 구성 요소
### 1. App Registration
필수 값:
- Tenant ID
- Client ID
- Certificate thumbprint 또는 식별 메타

### 2. Service Principal
- App Registration에 대응하는 enterprise application
- 실제 RBAC role assignment 대상

### 3. Certificate
- private key 포함 `.pem` 또는 `.pfx`
- backend가 읽을 수 있는 경로에 저장
- repo에는 커밋 금지
- Docker에서는 read-only volume mount 권장

### 4. RBAC Role Assignment
1차 권장 최소안:
- subscription scope: `Reader`

조건부 추가안:
- management group visibility가 필요하면 해당 scope read 권한 검토
- Arc / hybrid 리소스는 ARM 리소스로 조회 가능한 범위를 우선 활용

2차 이후 추가 검토:
- 비용 분석 기능이 들어갈 때 cost 관련 read role 별도 검토

## AzVision에서 저장할 credential profile
workspace 단위로 아래 정보를 관리하는 구조를 권장한다.
- `tenant_id`
- `client_id`
- `certificate_path`
- `certificate_password` 존재 여부
- `target_scopes` 또는 `target_subscriptions`
- `cloud_environment` 기본값은 Azure public

주의:
- certificate 원문 내용은 DB 저장보다 파일 경로 또는 secure mount 참조가 안전
- 비밀번호가 있는 pfx면 나중에 별도 secret 저장 전략 필요

## Backend 인증 흐름
### Step 1. 설정 로드
workspace별 credential profile을 읽는다.

### Step 2. credential 객체 생성
Python backend는 `azure-identity`의 `ClientCertificateCredential` 사용을 기본안으로 둔다.

### Step 3. subscription enumeration
- 지정된 scope 또는 subscription 목록을 기준으로 접근 가능 범위를 확인
- 1차는 subscription list 및 resource group list 조회 성공을 기준으로 삼는다

### Step 4. inventory / topology 수집
- Azure Resource Graph로 대량 inventory 조회
- ARM SDK 또는 REST로 관계 보강
- Arc 관련 자산도 ARM 리소스 관점에서 수집 우선

## 권한 설계 원칙
- write 계열 권한 금지
- Owner, Contributor 같은 과권한 금지
- 초기에는 Reader 중심으로 검증
- 필요한 권한이 드러날 때만 최소 범위로 추가

## 1차 read test 성공 기준
- token 발급 성공
- subscription 목록 조회 성공
- resource group 목록 조회 성공
- Azure Resource Graph 질의 성공
- 최소 1개 topology mock-to-live 변환 성공

## 1차 read test 체크리스트
- App Registration 생성 완료
- certificate 업로드 완료
- service principal 확인 완료
- target subscription에 Reader 할당 완료
- backend에서 tenant/client/cert path 인식 완료
- subscription list API 응답 확인
- resource group list API 응답 확인

## FastAPI 쪽 권장 모듈 구조
- `app/core/config.py` : 환경 변수 및 credential 설정
- `app/auth/credential_provider.py` : certificate credential 생성
- `app/auth/models.py` : credential profile schema
- `app/collectors/subscriptions.py` : subscription 조회
- `app/collectors/resource_graph.py` : inventory 질의

## 배포 원칙
- certificate 파일은 `/run/secrets` 또는 별도 mount 경로 사용 권장
- Docker image 안에 certificate bake 금지
- `.env`에는 path만 두고 원문 키는 넣지 않음
- 로그에 tenant/client는 제한적으로만 노출하고 cert 정보는 마스킹

## Phase 2 확장 포인트
- multi-workspace credential vault 연동
- 비용 분석용 추가 read role 검토
- Azure Government 등 cloud environment 확장
- certificate rotation 정책 추가

## 보류 이슈
- management group 단위 권한 설계 세부안
- Arc 범위에서 실제 추가 권한 필요 여부 검증
- pfx password 저장 방식
- multi-tenant consultant 운영 시 workspace isolation 세부 정책
- user login / permission model / language toggle 같은 productization 기능

## 현재 권장 결론
AzVision 1차는 `single tenant + certificate 기반 app-only + subscription scope Reader` 로 시작하는 것이 가장 가볍고 안전하다.
그 위에서 subscription read test를 먼저 통과시키고, 이후 Resource Graph와 topology 수집으로 확장하는 것이 맞다.
