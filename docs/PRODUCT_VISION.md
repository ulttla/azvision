# AzVision Product Vision

## 한 줄 정의
`AzVision`은 회사 Azure와 연계 hybrid 환경을 자동 수집하고, 수동 보강과 비용 분석, 시뮬레이션, export를 제공하는 아키텍트용 웹 플랫폼이다.

## 문제 정의
Azure 환경이 커질수록 다음이 어려워진다.
- subscription이 여러 개로 나뉘어 전체 구조를 보기 힘듦
- 네트워크와 서비스 관계를 한눈에 파악하기 어려움
- Arc, 온프레미스, 제3자 시스템까지 포함한 실제 운영 구조를 설명하기 어려움
- 비용이 어디서 발생하는지, 무엇을 바꾸면 얼마나 줄어드는지 설명하기 어려움
- 변경안을 미리 시뮬레이션하기 어려움

## 제품 목표
### 1차 (Phase 1A: Core Discovery)
- 전체 Azure 자산과 핵심 관계를 읽기 전용으로 스캔
- topology graph로 표현
- manual node / edge 추가로 제3자 자산 보강
- PNG export

### 1B (Phase 1B: Hybrid Expansion, 별도 freeze 대상)
- Azure Arc 연결 자산까지 그래프에 포함
- 온프레미스 또는 외부 자산의 수동 추가를 1급 관계로 연결
- PDF export
- snapshot 저장 및 topology 비교

### 2차 (Phase 2: Cost Intelligence)
- 현재 지출 구조를 설명
- 절감 가능 포인트를 제안
- 변경 후 예상 비용을 계산

### 3차 (Phase 3: Simulation & Copilot)
- 신규 서비스 도입, SKU 변경, DR 구성 변경 등을 시뮬레이션
- 대화형 질의로 분석 결과를 설명

## 주요 사용자
- Azure architect
- cloud engineer
- infrastructure consultant
- IT 관리자

## 핵심 가치
- 전체 구조를 한 화면에서 이해
- 자동 수집과 수동 보강의 병행
- 비용과 구조를 함께 보기 (Phase 2+)
- 보고서 export로 전달성 확보
- 회사가 바뀌어도 다시 쓸 수 있는 이식성

## 제품 원칙
- 웹앱으로 제공해 설치 부담을 줄인다
- core 기능은 LLM 없이 동작한다
- 사용자가 필요한 경우에만 LLM API key를 넣는다
- 회사별 workspace를 분리한다
- manual annotation은 graph의 1급 데이터로 다룬다

## 성공 기준 (제품 최종 목표)
> 아래는 제품 출시 후 달성할 최종 목표들이며, 각 Phase별 성공 기준은 `MVP_SCOPE.md`를 참조한다.

- 멀티 subscription 구조를 안정적으로 수집한다
- Arc 및 hybrid 연결을 그래프에서 표현한다
- 제3자 자산을 수동으로 추가할 수 있다
- PNG 및 PDF export가 가능하다
- 비용 분석과 시뮬레이션으로 consultant 수준의 설명이 가능하다
