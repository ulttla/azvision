import assert from 'node:assert/strict'

import { UI_TEXT } from '../frontend/src/pages/topology/model.ts'

assert.match(
  UI_TEXT.snapshotServerGuardHint,
  /validation or thumbnail guard checks/i,
  'server pre-save guard hint should mention validation and thumbnail guard checks',
)

assert.match(
  UI_TEXT.snapshotServerThumbnailRejectedWarning,
  /server validation or thumbnail guard checks/i,
  'server save-time warning should stay aligned with the documented validation/guard contract',
)

assert.match(
  UI_TEXT.snapshotLocalGuardHint,
  /thumbnail guard checks or browser storage limits/i,
  'local pre-save guard hint should mention both guard checks and browser storage limits',
)

assert.match(
  UI_TEXT.snapshotSavedWithoutThumbnailSuffix,
  /browser storage limits/i,
  'local storage-pressure suffix should continue to explain why the thumbnail was dropped',
)

console.log('snapshot thumbnail guard copy smoke passed')
