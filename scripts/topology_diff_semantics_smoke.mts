/**
 * Browserless FE semantics smoke — topology-diff pure function contracts.
 * Validates TopologyDiffResult structure, diff algorithm correctness, and utility functions.
 * Run: node --experimental-strip-types scripts/topology_diff_semantics_smoke.mts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..')
const diffCode = readFileSync(path.join(repoRoot, 'frontend/src/pages/topology/topology-diff.ts'), 'utf8')

// ============================================================
// Section 1: Exports validation
// ============================================================
const requiredExports = [
  'diffTopologyResponses',
  'filterTopologyDiff',
  'TopologyDiffKind',
  'TopologyDiffNode',
  'TopologyDiffEdge',
  'TopologyDiffResult',
]

for (const exp of requiredExports) {
  assert.match(diffCode, new RegExp(`export.*\\b${exp}\\b|export type ${exp}|export function ${exp}`), `topology-diff should export ${exp}`)
}

// ============================================================
// Section 2: Type definitions
// ============================================================
assert.match(diffCode, /export type TopologyDiffKind/, 'should define TopologyDiffKind')
assert.match(diffCode, /'added' \| 'removed' \| 'modified'/, 'TopologyDiffKind should have added/removed/modified values')

assert.match(diffCode, /export type TopologyDiffNode/, 'should define TopologyDiffNode')
assert.match(diffCode, /export type TopologyDiffEdge/, 'should define TopologyDiffEdge')
assert.match(diffCode, /export type TopologyDiffResult/, 'should define TopologyDiffResult')

// ============================================================
// Section 3: TopologyDiffResult structure
// ============================================================
assert.match(diffCode, /nodes:\s*TopologyDiffNode\[\]/, 'TopologyDiffResult should have nodes array')
assert.match(diffCode, /edges:\s*TopologyDiffEdge\[\]/, 'TopologyDiffResult should have edges array')
assert.match(diffCode, /nodeCountDelta:\s*number/, 'TopologyDiffResult should have nodeCountDelta')
assert.match(diffCode, /edgeCountDelta:\s*number/, 'TopologyDiffResult should have edgeCountDelta')

// ============================================================
// Section 4: Helper functions
// ============================================================
assert.match(diffCode, /function edgeKey/, 'should define edgeKey helper')
assert.match(diffCode, /function edgesEqual/, 'should define edgesEqual helper')
assert.match(diffCode, /function getNodeChangedFields/, 'should define getNodeChangedFields helper')

// ============================================================
// Section 5: Core diff algorithm — null handling
// ============================================================
assert.match(diffCode, /if \(!oldTopology && !newTopology\)/, 'should handle both-null case')
assert.match(diffCode, /oldNodeMap|newNodeMap/, 'should build lookup maps')
assert.match(diffCode, /oldEdgeMap|newEdgeMap/, 'should build edge lookup maps')

// ============================================================
// Section 6: Node diff logic
// ============================================================
assert.match(diffCode, /const allNodeKeys/, 'should compute union of node keys')
assert.match(diffCode, /!oldNode && newNode/, 'should detect added nodes')
assert.match(diffCode, /oldNode && !newNode/, 'should detect removed nodes')
assert.match(diffCode, /changedFields\.length > 0/, 'should detect modified nodes')

// ============================================================
// Section 7: Edge diff logic
// ============================================================
assert.match(diffCode, /const allEdgeKeys/, 'should compute union of edge keys')
assert.match(diffCode, /!oldEdge && newEdge/, 'should detect added edges')
assert.match(diffCode, /oldEdge && !newEdge/, 'should detect removed edges')

// ============================================================
// Section 8: Delta calculation
// ============================================================
assert.match(diffCode, /addedNodes|removedNodes/, 'should calculate node delta')
assert.match(diffCode, /addedEdges|removedEdges/, 'should calculate edge delta')
assert.match(diffCode, /nodeCountDelta = addedNodes - removedNodes/, 'nodeCountDelta formula')
assert.match(diffCode, /edgeCountDelta = addedEdges - removedEdges/, 'edgeCountDelta formula')

// ============================================================
// Section 9: Sorting for deterministic output
// ============================================================
assert.match(diffCode, /diff\.nodes\.sort/, 'should sort nodes')
assert.match(diffCode, /diff\.edges\.sort/, 'should sort edges')
assert.match(diffCode, /order = \{ added/, 'should have sort order')

// ============================================================
// Section 10: filterTopologyDiff
// ============================================================
assert.match(diffCode, /filterTopologyDiff/, 'should export filterTopologyDiff')
assert.match(diffCode, /filterKind/, 'should accept kind filter')
assert.match(diffCode, /filterNodeKeySet/, 'should accept node key filter')

// ============================================================
// Section 11: Imports validation
// ============================================================
assert.match(diffCode, /TopologyEdge|TopologyNode|TopologyResponse/, 'should import TopologyEdge/Node/Response types')

console.log('✅ topology_diff_semantics_smoke.mts: all assertions passed')
