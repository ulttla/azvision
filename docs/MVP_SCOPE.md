# AzVision MVP Scope

> **현재 제품 기준선:** single-user first.
> historical freeze 기준은 Phase 1A Core Discovery였지만, 현재 구현 기준선은 Phase 1B server-backed snapshot/history usable baseline과 metadata-level snapshot compare first-pass까지 진입했다.
> productization 기능은 아직 범위가 아니다.
> user login / multi-user / permission model / language toggle은 보류한다.
> Gun 단독 실사용 v0.9 기준은 `PERSONAL_USE_READINESS_PLAN.md` 와 `PERSONAL_USE_RUNBOOK.md` 를 우선 참조한다.
> 각 Phase의 세부 범위는 `PRODUCT_VISION.md`를 참조한다.

## Phase 1A: Core Discovery MVP (현재 freeze 대상)
### In scope
- Azure App Registration 기반 인증
  - server-side configured credential profile
  - API 범위는 diagnostics read only
- subscription 목록 수집
- resource group 목록 수집
- 핵심 리소스 수집 (type, location, tags)
- network 관계 수집
- topology graph 표시 (Cytoscape.js)
- manual node / edge 추가 (1급 데이터)
- PNG export

### Out of scope
- Azure ARC 연결 자산의 1급 표현 (Phase 1B)
- PDF export (Phase 1B)
- snapshot 저장 및 비교 (Phase 1B)
- 비용 분석 (Phase 2)
- 신규 서비스/비용 변경안 what-if 시뮬레이션 (Phase 3). 단, static Network Path Analysis는 네트워크 진단 기능으로 별도 취급
- AI copilot (Phase 3)
- user login / account 관리
- multi-user collaboration / permission model
- language toggle / i18n
- 자동 remediation
- write 작업 (Azure 리소스 수정)

---

## Phase 1B: Hybrid Expansion (별도 freeze 대상)
### In scope
- Azure Arc 연결 자산 표현
- hybrid topology 확장 (Arc / 외부 자산 relation 보강)
- relation confidence 및 source 고도화
- PDF export
- snapshot 저장 및 비교
  - 현재 metadata-level snapshot compare first-pass 구현 완료
  - raw topology archival 기반 full diff viewer는 후속 범위이며 `RAW_TOPOLOGY_DIFF_PLAN.md` 기준으로 별도 설계/구현

### Out of scope
- 정교한 비용 최적화 추천
- LLM 기반 분석
- 다중 사용자 협업 편집
- user login / permission model
- language toggle / i18n

## Phase 2: Cost Intelligence
### In scope
- 현재 비용 구조 매핑
- 리소스별 비용 추정
- 절감 포인트 제안
- 변경 시 비용 차이 계산
- 비용 요약 PDF 보고서

### Out of scope
- 자동 변경 적용
- 완전한 회계 시스템 대체

## Phase 3: Simulation and Copilot
### In scope
- 신규 서비스 추가 시 비용 시뮬레이션
- SKU / region / redundancy 변경 영향 분석
- 대화형 질의 기반 시뮬레이션
- LLM copilot 옵션 제공

### Out of scope
- LLM이 직접 계산을 대체하는 구조
- 핵심 데이터 없이 임의 추론만 하는 구조

## MVP 성공 조건 (Phase 1A)
- 최소 2개 이상의 subscription 읽기 성공
- topology graph가 실제 Azure 데이터로 렌더링됨
- manual node / edge 추가 가능
- PNG export 가능
- workspace 분리 구조가 유지됨. 단, 이는 현재 single-user deployment 안의 프로젝트/scope 분리이며 계정/권한 경계가 아니다.
