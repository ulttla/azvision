# AzVision App Registration 생성 체크리스트

## 목적
AzVision backend가 사용자 로그인 없이 Azure 자산을 읽기 전용으로 수집할 수 있도록 `App Registration + certificate 기반 app-only 인증`을 실제로 준비하는 절차를 정리한다.

## 사전 결정사항
- 1차는 `single tenant`
- 권한 범위는 우선 `target subscriptions`
- 역할은 기본적으로 `Reader`
- 자격 증명은 `certificate` 사용
- secret은 1차 기본안에서 사용하지 않음

## 준비물
- Azure tenant 접근 권한
- App Registration 생성 권한
- target subscription에 role assignment 할 수 있는 권한
- certificate 파일 생성 도구
- AzVision backend가 certificate 파일을 읽을 수 있는 배포 경로

## Portal 기준 생성 순서
### 1. App Registration 생성
Portal 경로:
- Microsoft Entra admin center
- App registrations
- New registration

권장 값:
- Name: `AzVision-Prod` 또는 `AzVision-Dev`
- Supported account types: `Accounts in this organizational directory only`
- Redirect URI: 없음

생성 후 기록할 값:
- Application (client) ID
- Directory (tenant) ID
- Object ID 참고용

### 2. Certificate 준비 및 업로드
권장:
- 개발/운영 환경별 certificate 분리
- private key는 AzVision backend 배포 환경에만 저장
- public certificate만 App Registration에 업로드

Portal 경로:
- App registrations
- AzVision 앱 선택
- Certificates & secrets
- Certificates
- Upload certificate

기록할 값:
- thumbprint
- 만료일
- 어떤 배포 환경에서 쓰는지

### 3. Service Principal 확인
Portal 경로:
- Enterprise applications
- `AzVision-Prod` 또는 생성한 앱 검색

확인 항목:
- enterprise application 생성 여부
- role assignment 대상 principal인지 확인

### 4. RBAC 할당
권장 1차 최소안:
- target subscription마다 `Reader`

Portal 경로 예시:
- Subscription
- Access control (IAM)
- Add role assignment
- Role: `Reader`
- Assign access to: `User, group, or service principal`
- 대상: AzVision service principal

여러 subscription이면 반복:
- Subscription A → Reader
- Subscription B → Reader
- Subscription C → Reader

### 5. 환경 값 정리
AzVision backend에 넣을 값:
- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`
- `AZURE_CERT_PATH`
- `AZURE_CERT_PASSWORD` optional
- `AZURE_CLOUD=public`

## certificate 파일 운영 원칙
- repo 커밋 금지
- Docker image bake 금지
- read-only mount 사용
- 권한은 backend 프로세스만 읽을 수 있게 제한

권장 경로 예시:
- local dev: `/Users/gun/.config/azvision/certs/azvision-dev.pem`
- Docker/NAS: `/run/secrets/azvision-cert.pem`

## 생성 후 바로 확인할 것
- App Registration 생성됨
- certificate 업로드됨
- service principal 확인됨
- 각 target subscription에 Reader 부여됨
- backend `.env` 값 준비됨

## AzVision 쪽 첫 검증 순서
1. `GET /api/v1/auth/config-check`
2. `GET /api/v1/auth/read-test`
3. subscription 목록 확인
4. resource group 샘플 확인

## 주의사항
- secret을 같이 만들더라도 1차에서는 사용하지 않기
- Owner / Contributor 부여 금지
- certificate 만료일 반드시 기록
- tenant가 여러 개면 workspace 단위로 분리 설계

## 완료 판정
아래를 모두 만족하면 완료:
- tenant/client ID 확보
- certificate 업로드 완료
- Reader 권한 할당 완료
- backend에서 read test 성공
