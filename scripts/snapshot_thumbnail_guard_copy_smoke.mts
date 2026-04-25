import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { SNAPSHOT_THUMBNAIL_MAX_LENGTH, UI_TEXT } from '../frontend/src/pages/topology/model.ts'

const repoRoot = path.resolve(import.meta.dirname, '..')
const backendSnapshotSchema = readFileSync(path.join(repoRoot, 'backend/app/schemas/snapshots.py'), 'utf8')
const apiContractDoc = readFileSync(path.join(repoRoot, 'docs/API_CONTRACT.md'), 'utf8')
const phase1bPlanDoc = readFileSync(path.join(repoRoot, 'docs/PHASE1B_SERVER_SNAPSHOT_PLAN.md'), 'utf8')
const historyPlanDoc = readFileSync(path.join(repoRoot, 'docs/SNAPSHOT_HISTORY_FOUNDATION_PLAN.md'), 'utf8')
const readmeDoc = readFileSync(path.join(repoRoot, 'README.md'), 'utf8')
const topologyPage = readFileSync(path.join(repoRoot, 'frontend/src/pages/TopologyPage.tsx'), 'utf8')

assert.equal(
  SNAPSHOT_THUMBNAIL_MAX_LENGTH,
  500 * 1024,
  'frontend thumbnail guard max length should stay at 500 * 1024 bytes of string length',
)

assert.match(
  backendSnapshotSchema,
  /SNAPSHOT_THUMBNAIL_MAX_LENGTH\s*=\s*500\s*\*\s*1024/,
  'backend thumbnail guard max length should stay aligned with frontend at 500 * 1024',
)

assert.match(
  apiContractDoc,
  /thumbnail guard: backend는 `thumbnail_data_url` 이 `data:image\/` 로 시작하지 않거나 문자열 길이가 `512000` \(`500 \* 1024`\)를 초과하면 값을 `""` 로 sanitize/i,
  'API contract doc should describe the current invalid-or-oversized thumbnail sanitize behavior',
)

assert.match(
  apiContractDoc,
  /create\/detail 응답의 `thumbnail_data_url=""` 와 list summary의 `has_thumbnail=false` 로 sanitize 결과를 확인할 수 있다/i,
  'API contract doc should explain how callers observe thumbnail sanitization',
)

assert.match(
  UI_TEXT.snapshotServerGuardHint,
  /server validation or thumbnail guard checks.*during save/i,
  'server guard hint should place server-mode thumbnail removal during save',
)

assert.match(
  UI_TEXT.snapshotServerThumbnailRejectedWarning,
  /server validation or thumbnail guard checks.*during save/i,
  'server save-time warning should stay aligned with the documented validation/guard contract',
)

assert.match(
  UI_TEXT.snapshotLocalGuardHint,
  /thumbnail guard checks or browser storage limits/i,
  'local pre-save guard hint should mention both guard checks and browser storage limits',
)

assert.match(
  topologyPage,
  /snapshotStorageMode\s*===\s*'local'\s*&&\s*estimateSerializedBytes\(nextSnapshots\)\s*>=\s*SNAPSHOT_STORAGE_WARN_BYTES\s*&&\s*nextSnapshot\.thumbnailDataUrl/s,
  'browser storage pressure should only drop snapshot thumbnails before save in local mode',
)

assert.match(
  readmeDoc,
  /browser storage pressure 기반 pre-save thumbnail drop은 이제 local mode에만 적용/i,
  'README should state that browser storage pressure only strips thumbnails before save in local mode',
)

assert.match(
  phase1bPlanDoc,
  /browser storage pressure 기반 pre-save thumbnail drop은 local mode에만 남기고, server mode는 thumbnail을 backend guard\/validation까지 전달/i,
  'Phase 1B plan should keep the local-only pre-save thumbnail ownership note',
)

assert.match(
  historyPlanDoc,
  /local-only pre-save sanitize \+ server-side blank thumbnail 커버/i,
  'history plan should keep the local-only pre-save sanitize baseline wording',
)

assert.match(
  UI_TEXT.snapshotSavedWithoutThumbnailSuffix,
  /browser storage limits/i,
  'local storage-pressure suffix should continue to explain why the thumbnail was dropped',
)

console.log('snapshot thumbnail guard copy smoke passed')
