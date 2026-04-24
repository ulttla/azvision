# AzVision 개발일지 안내

## Google Docs 개발일지
- 문서명: `AzVision 개발일지`
- Doc ID: `1sPc7Cmvq230kAd3Bg4HppkPM6xGbhIArEnLOB_-IIAE`
- 링크: https://docs.google.com/document/d/1sPc7Cmvq230kAd3Bg4HppkPM6xGbhIArEnLOB_-IIAE/edit

## 운영 원칙
- AzVision 관련 장기 개발 기록의 원본은 이 문서를 사용한다.
- OpenClaw 개발일지와 혼용하지 않는다.
- 작업 종료 후 필요 시 이 문서와 로컬 체크포인트를 함께 갱신한다.

## 로컬 업데이트 스크립트
- `/Users/gun/.openclaw/workspace/scripts/update_azvision_journal.sh`

## 임시 업데이트 파일 예시
- `/Users/gun/.openclaw/workspace/tmp/azvision_journal_update_YYYYMMDD.md`

## Docs mirror reconcile log
| Date | File | Direction | Rationale |
|---|---|---|---|
| 2026-04-24 | `ARCHITECTURE_VIEW_MVP_PLAN.md` | repo → workspace | repo canonical plan existed, workspace cache missing |
| 2026-04-24 | `AZURE_READ_TEST_RUNBOOK.md` | repo → workspace | repo had newer live read-test and topology probe notes |
| 2026-04-24 | `PHASE1A_BUILD_CHECKLIST.md` | repo → workspace | repo had newer Phase 1A completion and live verification state |
| 2026-04-24 | `PHASE1B_SERVER_SNAPSHOT_PLAN.md` | already aligned | repo and workspace are byte-identical after current snapshot guard commits |
| 2026-04-24 | `SNAPSHOT_HISTORY_FOUNDATION_PLAN.md` | already aligned | repo and workspace are byte-identical after current snapshot guard commits |
| 2026-04-24 | `MIRROR_POLICY.md` | repo → workspace | canonical mirror operating rule added to prevent future direction drift |
