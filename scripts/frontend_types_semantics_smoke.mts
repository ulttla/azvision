/**
 * Browserless FE types semantics smoke — validates frontend type definitions.
 * Checks that key types exist and have expected structure.
 * Run: node --experimental-strip-types scripts/frontend_types_semantics_smoke.mts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..')
const packageCode = readFileSync(path.join(repoRoot, 'frontend/package.json'), 'utf8')
const apiCode = readFileSync(path.join(repoRoot, 'frontend/src/lib/api.ts'), 'utf8')
const modelCode = readFileSync(path.join(repoRoot, 'frontend/src/pages/topology/model.ts'), 'utf8')
const diffCode = readFileSync(path.join(repoRoot, 'frontend/src/pages/topology/topology-diff.ts'), 'utf8')

// ============================================================
// Section 0: Smoke-chain wiring
// ============================================================
assert.match(packageCode, /frontend_types_semantics_smoke\.mts/, 'frontend smoke:semantics should include frontend types smoke')

// ============================================================
// Section 1: API types — all should be exported
// ============================================================
const apiTypes = [
  'Workspace',
  'TopologyNode',
  'TopologyEdge',
  'TopologyResponse',
  'TopologyNodeDetail',
  'TopologySummary',
  'CostSummary',
  'CostRecommendation',
  'SnapshotCompareResponse',
  'SnapshotApiRecord',
  'SimulationRecord',
  'SimulationFitResponse',
  'PathAnalysisResponse',
  'ExportItem',
]

for (const type of apiTypes) {
  assert.match(apiCode, new RegExp(`export type ${type}`), `api.ts should export ${type}`)
}

// ============================================================
// Section 2: Topology model types
// ============================================================
const modelTypes = [
  'SavedTopologySnapshot',
  'SavedTopologyPreset',
  'TopologyPresetState',
  'ResourceFilterState',
  'RelationFilterState',
  'SearchScope',
  'SearchResult',
]

for (const type of modelTypes) {
  assert.match(modelCode, new RegExp(`export type ${type}`), `topology/model should export ${type}`)
}

// ============================================================
// Section 3: Topology diff types
// ============================================================
const diffTypes = ['TopologyDiffResult', 'TopologyDiffNode', 'TopologyDiffEdge', 'TopologyDiffKind']
for (const type of diffTypes) {
  assert.match(diffCode, new RegExp(`export type ${type}`), `topology-diff should export ${type}`)
}

// ============================================================
// Section 4: Key type fields — TopologyNode
// ============================================================
const nodeFields = ['node_key', 'node_type', 'node_ref', 'display_name', 'source', 'confidence']
for (const field of nodeFields) {
  assert.match(apiCode, new RegExp(`${field}:`), `TopologyNode should have ${field} field`)
}

// ============================================================
// Section 5: Key type fields — TopologyEdge
// ============================================================
const edgeFields = ['source_node_key', 'target_node_key', 'relation_type', 'relation_category', 'confidence']
for (const field of edgeFields) {
  assert.match(apiCode, new RegExp(`${field}[?:]`), `TopologyEdge should have ${field} field`)
}

// ============================================================
// Section 6: Key type fields — SnapshotCompareResponse
// ============================================================
const compareFields = ['base_snapshot_id', 'target_snapshot_id', 'count_delta', 'scope_delta']
for (const field of compareFields) {
  assert.match(apiCode, new RegExp(`${field}:`), `SnapshotCompareResponse should have ${field} field`)
}

// ============================================================
// Section 7: Constant exports
// ============================================================
const constants = ['DEFAULT_RESOURCE_FILTERS', 'DEFAULT_RELATION_FILTERS', 'DEFAULT_RELATION_TYPE_FILTERS', 'UI_TEXT', 'COMPARE_COLOR_PALETTE']
for (const constName of constants) {
  assert.match(modelCode, new RegExp(`export const ${constName}`), `topology/model should export ${constName}`)
}

console.log('✅ frontend_types_semantics_smoke.mts: all assertions passed')
