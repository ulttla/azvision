# AzVision Azure Portal 입력값 가이드

## 목적
AzVision용 App Registration을 Azure Portal에서 만들 때 어떤 값을 넣는지 빠르게 결정할 수 있도록 권장 입력값을 정리한다.

## 권장 앱 이름
환경별로 분리 권장:
- 개발: `AzVision-Dev`
- 운영: `AzVision-Prod`
- 고객사별 consultant 운영 시: `AzVision-<Company>-Dev` / `AzVision-<Company>-Prod`

## New registration 화면 권장값
### Name
- `AzVision-Dev`
또는
- `AzVision-Prod`

### Supported account types
- `Accounts in this organizational directory only`

이유:
- 1차는 single tenant 기준
- 불필요한 외부 tenant 로그인 허용을 피함

### Redirect URI
- 비워둠

이유:
- 1차는 interactive login이 아니라 app-only 인증
- redirect URI 불필요

## 생성 후 기록할 값
생성 직후 아래 값을 안전하게 기록:
- `Application (client) ID`
- `Directory (tenant) ID`
- `Object ID` 참고용

AzVision backend `.env`에는 우선 아래 두 값이 필요:
- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`

## Certificates 업로드 가이드
### 권장 원칙
- 개발/운영 certificate 분리
- private key는 backend host에만 저장
- Portal에는 public certificate만 업로드
- certificate 파일명은 환경이 보이게 관리

예시 파일명:
- `azvision-dev.pem`
- `azvision-prod.pem`

## Enterprise application 확인
App Registration 생성 후 Enterprise applications에서 동일 이름의 service principal이 생성됐는지 확인한다.

확인 목적:
- IAM role assignment 대상 확인
- subscription Reader 부여 대상 확인

## IAM role assignment 권장값
### 기본 역할
- `Reader`

### 할당 대상
- App Registration에 대응하는 service principal

### 할당 위치
- 1차는 target subscription 단위
- 여러 subscription이면 각 subscription에 반복 할당

## 1차에서는 하지 않을 것
- `Contributor` 부여 금지
- `Owner` 부여 금지
- client secret 기반 연결 금지
- multi-tenant 설정으로 시작하지 않기

## 추천 운영 메모
- 개발과 운영 App Registration 분리 권장
- certificate 만료일을 문서와 캘린더에 기록 권장
- consultant 용도로 확장 시 workspace별 app 분리 권장

## 최종 체크
Portal 작업이 끝나면 아래가 모두 준비돼야 한다.
- tenant ID 확보
- client ID 확보
- certificate 업로드 완료
- service principal 확인 완료
- target subscription에 Reader 부여 완료
- backend `.env` 작성 가능 상태
