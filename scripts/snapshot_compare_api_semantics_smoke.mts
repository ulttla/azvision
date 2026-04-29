/**
 * Browserless FE semantics smoke — compareTopologySnapshots API contract.
 * Validates API function signature, types, and fetch path.
 * Run: node --experimental-strip-types scripts/snapshot_compare_api_semantics_smoke.mts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..')
const apiCode = readFileSync(path.join(repoRoot, 'frontend/src/lib/api.ts'), 'utf8')

// ============================================================
// Section 1: compareTopologySnapshots function exists
// ============================================================
assert.match(apiCode, /export async function compareTopologySnapshots/, 'should export compareTopologySnapshots')

// ============================================================
// Section 2: Function signature
// ============================================================
assert.match(apiCode, /compareTopologySnapshots\s*\(\s*workspaceId/, 'should accept workspaceId parameter')
assert.match(apiCode, /compareTopologySnapshots\s*\([^)]*baseSnapshotId/, 'should accept baseSnapshotId parameter')
assert.match(apiCode, /compareTopologySnapshots\s*\([^)]*targetSnapshotId/, 'should accept targetSnapshotId parameter')

// ============================================================
// Section 3: Fetch path
// ============================================================
assert.match(apiCode, /\/workspaces\/\$\{workspaceId\}\/snapshots\/compare/, 'should use correct API path')

// ============================================================
// Section 4: HTTP method
// ============================================================
assert.match(apiCode, /method:\s*['\"]POST['\"]/, 'should use POST method')

// ============================================================
// Section 5: SnapshotCompareResponse type
// ============================================================
assert.match(apiCode, /export type SnapshotCompareResponse/, 'should export SnapshotCompareResponse')
assert.match(apiCode, /base_snapshot_id/, 'SnapshotCompareResponse should have base_snapshot_id')
assert.match(apiCode, /target_snapshot_id/, 'SnapshotCompareResponse should have target_snapshot_id')
assert.match(apiCode, /base_name/, 'SnapshotCompareResponse should have base_name')
assert.match(apiCode, /target_name/, 'SnapshotCompareResponse should have target_name')
assert.match(apiCode, /count_delta/, 'SnapshotCompareResponse should have count_delta')
assert.match(apiCode, /scope_delta/, 'SnapshotCompareResponse should have scope_delta')
assert.match(apiCode, /compare_refs_delta/, 'SnapshotCompareResponse should have compare_refs_delta')

// ============================================================
// Section 6: count_delta structure
// ============================================================
assert.match(apiCode, /visible_node_count/, 'count_delta should have visible_node_count')
assert.match(apiCode, /loaded_node_count/, 'count_delta should have loaded_node_count')
assert.match(apiCode, /edge_count/, 'count_delta should have edge_count')

// ============================================================
// Section 7: scope_delta structure
// ============================================================
assert.match(apiCode, /scope_changed/, 'scope_delta should have scope_changed')
assert.match(apiCode, /query_changed/, 'scope_delta should have query_changed')
assert.match(apiCode, /subscription_changed/, 'scope_delta should have subscription_changed')
assert.match(apiCode, /resource_group_changed/, 'scope_delta should have resource_group_changed')

// ============================================================
// Section 8: Usage in TopologyPage
// ============================================================
const topoPageCode = readFileSync(path.join(repoRoot, 'frontend/src/pages/TopologyPage.tsx'), 'utf8')
assert.match(topoPageCode, /compareTopologySnapshots\(/, 'TopologyPage should call compareTopologySnapshots')

console.log('✅ snapshot_compare_api_semantics_smoke.mts: all assertions passed')
