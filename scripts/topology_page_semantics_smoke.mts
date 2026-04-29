/**
 * Browserless FE semantics smoke — TopologyPage structure and contracts.
 * Validates TopologyPage imports, model constants, search, and snapshot order.
 * Run: node --experimental-strip-types scripts/topology_page_semantics_smoke.mts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..')
const topoPageCode = readFileSync(path.join(repoRoot, 'frontend/src/pages/TopologyPage.tsx'), 'utf8')
const topoModelCode = readFileSync(path.join(repoRoot, 'frontend/src/pages/topology/model.ts'), 'utf8')
const topoSearchCode = readFileSync(path.join(repoRoot, 'frontend/src/pages/topology/search.ts'), 'utf8')
const topoOrderCode = readFileSync(path.join(repoRoot, 'frontend/src/pages/topology/snapshot-order.ts'), 'utf8')
const topoStorageCode = readFileSync(path.join(repoRoot, 'frontend/src/pages/topology/storage.ts'), 'utf8')
const topoCytoscapeCode = readFileSync(path.join(repoRoot, 'frontend/src/pages/topology/cytoscape.ts'), 'utf8')
const topoStyleCode = readFileSync(path.join(repoRoot, 'frontend/src/pages/topology/cytoscape-style.ts'), 'utf8')
const apiCode = readFileSync(path.join(repoRoot, 'frontend/src/lib/api.ts'), 'utf8')

// ============================================================
// Section 1: TopologyPage API imports
// ============================================================
const requiredImports = [
  'getWorkspaces',
  'getTopology',
  'getTopologyNodeDetail',
  'getWorkspaceSubscriptions',
  'getWorkspaceResourceGroups',
  'getWorkspaceResources',
  'getWorkspaceInventorySummary',
  'getTopologySnapshot',
  'createExport',
  'listManualNodes',
  'createManualNode',
  'updateManualNode',
  'deleteManualNode',
  'listManualEdges',
  'createManualEdge',
  'updateManualEdge',
  'deleteManualEdge',
  'getPathAnalysis',
  'getAuthConfigCheck',
  'compareTopologySnapshots',
]

for (const imp of requiredImports) {
  assert.match(topoPageCode, new RegExp(`\\b${imp}\\b`), `TopologyPage should import ${imp}`)
}

// ============================================================
// Section 2: TopologyPage model imports
// ============================================================
const modelExports = ['UI_TEXT', 'TOPOLOGY_PRESET_VERSION', 'SNAPSHOT_STORAGE_WARN_BYTES', 'DEFAULT_RELATION_FILTERS']
for (const exp of modelExports) {
  assert.match(topoModelCode, new RegExp(`export.*\\b${exp}\\b|export const ${exp}`), `topology/model should export ${exp}`)
}

// ============================================================
// Section 3: UI_TEXT constants
// ============================================================
assert.match(topoModelCode, /UI_TEXT\s*=/, 'topology/model should define UI_TEXT')
assert.match(topoModelCode, /snapshotServerGuardHint|snapshotStorageWarning|snapshotNotice/, 'UI_TEXT should include snapshot-related strings')

// ============================================================
// Section 4: Model types
// ============================================================
const modelTypes = ['SavedTopologySnapshot', 'SavedTopologyPreset', 'TopologyPresetState', 'SearchScope']
for (const typ of modelTypes) {
  assert.match(topoModelCode, new RegExp(`export (type|interface) ${typ}`), `topology/model should export ${typ}`)
}

// ============================================================
// Section 5: Snapshot order functions
// ============================================================
assert.match(topoOrderCode, /orderSavedSnapshots/, 'snapshot-order should export orderSavedSnapshots')
assert.match(topoOrderCode, /getDisplayedSnapshots/, 'snapshot-order should export getDisplayedSnapshots')
assert.match(topoOrderCode, /getSnapshotFilterCounts/, 'snapshot-order should export getSnapshotFilterCounts')

// ============================================================
// Section 6: Search functions
// ============================================================
assert.match(topoSearchCode, /searchTopologyNodes/, 'search should export searchTopologyNodes')
assert.match(topoSearchCode, /buildSearchResultGroups/, 'search should export buildSearchResultGroups')
assert.match(topoSearchCode, /getSearchScopeMeta/, 'search should export getSearchScopeMeta')

// ============================================================
// Section 7: Storage functions
// ============================================================
assert.match(topoStorageCode, /createTopologySnapshotStorage|loadTopologySnapshot|saveTopologySnapshot|deleteTopologySnapshot/, 'storage should export snapshot storage functions')

// ============================================================
// Section 8: Cytoscape integration
// ============================================================
assert.match(topoCytoscapeCode, /loadCytoscapeRuntime/, 'cytoscape should export loadCytoscapeRuntime')
assert.match(topoStyleCode, /CYTOSCAPE_STYLE|export const.*style/i, 'cytoscape-style should export style definitions')

// ============================================================
// Section 9: TopologyPage state variables
// ============================================================
const expectedStates = [
  'workspaces',
  'selectedWorkspaceId',
  'selectedSubscriptionId',
  'topology',
  'loading',
  'error',
  'includeNetworkInference',
  'selectedNodeKey',
  'nodeDetail',
  'searchQuery',
  'searchScope',
  'snapshotSortBy',
  'snapshotSortOrder',
  'snapshotFilter',
  'resourceFilters',
  'relationFilters',
  'relationTypeFilters',
  'expandedManagedInstanceRefs',
]

for (const stateName of expectedStates) {
  assert.match(topoPageCode, new RegExp(`${stateName}`), `TopologyPage should have state: ${stateName}`)
}

// ============================================================
// Section 10: Manual node/edge CRUD operations
// ============================================================
assert.match(topoPageCode, /createManualNode\(/, 'TopologyPage should call createManualNode')
assert.match(topoPageCode, /updateManualNode\(/, 'TopologyPage should call updateManualNode')
assert.match(topoPageCode, /deleteManualNode\(/, 'TopologyPage should call deleteManualNode')
assert.match(topoPageCode, /createManualEdge\(/, 'TopologyPage should call createManualEdge')
assert.match(topoPageCode, /updateManualEdge\(/, 'TopologyPage should call updateManualEdge')
assert.match(topoPageCode, /deleteManualEdge\(/, 'TopologyPage should call deleteManualEdge')

// ============================================================
// Section 11: Path analysis
// ============================================================
assert.match(topoPageCode, /getPathAnalysis\(/, 'TopologyPage should call getPathAnalysis')
assert.match(topoPageCode, /PathAnalysisResponse/, 'TopologyPage should use PathAnalysisResponse type')

// ============================================================
// Section 12: Snapshot compare
// ============================================================
assert.match(topoPageCode, /compareTopologySnapshots\(/, 'TopologyPage should call compareTopologySnapshots')

// ============================================================
// Section 13: Export functionality
// ============================================================
assert.match(topoPageCode, /createExport\(/, 'TopologyPage should call createExport')

// ============================================================
// Section 13.5: Raw topology diff drilldown and markdown export
// ============================================================
assert.match(topoPageCode, /function buildTopologyDiffMarkdown/, 'TopologyPage should define raw topology diff markdown export builder')
assert.match(topoPageCode, /function renderDiffDrilldownSection/, 'TopologyPage should render expandable topology diff drilldown sections')
assert.match(topoPageCode, /diffExpandedSections/, 'TopologyPage should track expanded diff sections')
assert.match(topoPageCode, /Before:\s*\$\{formatNodeDetail\(c\.base\)\}/, 'markdown export should include changed-node before details')
assert.match(topoPageCode, /After:\s*\$\{formatNodeDetail\(c\.target\)\}/, 'markdown export should include changed-node after details')
assert.match(topoPageCode, /DISPLAY_MAX|DISPLAY_LIMIT/, 'raw topology diff drilldown/export should keep a bounded display cap')

// ============================================================
// Section 14: Resource type filter constants
// ============================================================
assert.match(topoModelCode, /DEFAULT_RESOURCE_FILTERS|ResourceCategory/, 'topology/model should define resource filter constants')
assert.match(topoModelCode, /DEFAULT_RELATION_FILTERS|RelationCategory/, 'topology/model should define relation filter constants')

// ============================================================
// Section 15: API types for TopologyPage
// ============================================================
assert.match(apiCode, /export type ManualNode/, 'api.ts should export ManualNode type')
assert.match(apiCode, /export type ManualEdge/, 'api.ts should export ManualEdge type')
assert.match(apiCode, /export type TopologyNode/, 'api.ts should export TopologyNode type')
assert.match(apiCode, /export type TopologyEdge/, 'api.ts should export TopologyEdge type')

// ============================================================
// Section 16: Import preset payload type
// ============================================================
assert.match(topoModelCode, /ImportedPresetPayload|ImportedSnapshotPayload/, 'topology/model should export import payload types')

console.log('✅ topology_page_semantics_smoke.mts: all assertions passed')
