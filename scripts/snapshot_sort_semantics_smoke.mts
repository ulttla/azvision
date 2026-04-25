import assert from 'node:assert/strict'

import {
  getDisplayedSnapshots,
  getSnapshotFilterCounts,
  orderSavedSnapshots,
} from '../frontend/src/pages/topology/snapshot-order.ts'
import type { SavedTopologySnapshot } from '../frontend/src/pages/topology/model.ts'

function makeSnapshot(
  name: string,
  overrides: Partial<SavedTopologySnapshot> = {},
): SavedTopologySnapshot {
  const baseTime = '2026-04-21T10:00:00Z'
  return {
    id: name.toLowerCase().replace(/\s+/g, '-'),
    name,
    workspaceId: 'local-demo',
    presetVersion: 2,
    compareRefs: [],
    clusterChildren: true,
    scope: 'visible',
    query: '',
    selectedSubscriptionId: '',
    resourceGroupName: '',
    note: '',
    topologyGeneratedAt: baseTime,
    visibleNodeCount: 10,
    loadedNodeCount: 10,
    edgeCount: 5,
    thumbnailDataUrl: '',
    capturedAt: baseTime,
    createdAt: baseTime,
    updatedAt: baseTime,
    lastRestoredAt: '',
    restoreCount: 0,
    isPinned: false,
    archivedAt: '',
    hasThumbnail: false,
    storageKind: 'server',
    ...overrides,
  }
}

const alpha = makeSnapshot('Alpha', {
  capturedAt: '2026-04-21T10:00:00Z',
  createdAt: '2026-04-21T10:00:00Z',
  updatedAt: '2026-04-21T10:05:00Z',
  lastRestoredAt: '2026-04-21T10:20:00Z',
})
const bravo = makeSnapshot('Bravo', {
  capturedAt: '2026-04-21T10:10:00Z',
  createdAt: '2026-04-21T10:10:00Z',
  updatedAt: '2026-04-21T10:11:00Z',
})
const charlie = makeSnapshot('Charlie', {
  capturedAt: '2026-04-21T09:00:00Z',
  createdAt: '2026-04-21T09:00:00Z',
  updatedAt: '2026-04-21T09:01:00Z',
  isPinned: true,
})
const delta = makeSnapshot('Delta', {
  capturedAt: '2026-04-21T10:30:00Z',
  createdAt: '2026-04-21T10:30:00Z',
  updatedAt: '2026-04-21T10:31:00Z',
  archivedAt: '2026-04-21T10:32:00Z',
})

const snapshots = [alpha, bravo, charlie, delta]

assert.deepEqual(
  orderSavedSnapshots(snapshots, 'captured_at', 'desc').map((snapshot) => snapshot.name),
  ['Charlie', 'Bravo', 'Alpha', 'Delta'],
  'saved desc order should keep pinned first, then newest captured, then archived last',
)

assert.deepEqual(
  orderSavedSnapshots(snapshots, 'captured_at', 'asc').map((snapshot) => snapshot.name),
  ['Charlie', 'Alpha', 'Bravo', 'Delta'],
  'saved asc order should keep pinned first, then oldest captured, then archived last',
)

assert.deepEqual(
  orderSavedSnapshots(snapshots, 'updated_at', 'desc').map((snapshot) => snapshot.name),
  ['Charlie', 'Bravo', 'Alpha', 'Delta'],
  'saved updated_at order should keep pinned first, then newest updated, then archived last',
)

assert.deepEqual(
  getDisplayedSnapshots(snapshots, 'recent', 'captured_at', 'asc', 8).map((snapshot) => snapshot.name),
  ['Alpha', 'Bravo', 'Charlie'],
  'recent tab should ignore saved custom sort and use restore/capture recency only',
)

assert.deepEqual(
  getSnapshotFilterCounts(snapshots, 8),
  { all: 3, pinned: 1, recent: 3, archived: 1 },
  'filter counts should keep archived separate and count recent from non-archived set',
)

console.log('snapshot sort semantics smoke passed')
