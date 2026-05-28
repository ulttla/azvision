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
const appStyleCode = readFileSync(path.join(repoRoot, 'frontend/src/styles.css'), 'utf8')
const dictCode = readFileSync(path.join(repoRoot, 'frontend/src/i18n/dict.ts'), 'utf8')
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
assert.match(topoPageCode, /CopilotPanel/, 'TopologyPage should import and render CopilotPanel')
assert.match(topoPageCode, /currentView="topology"/, 'TopologyPage should pass topology current view to CopilotPanel')
assert.match(topoPageCode, /topologyCopilotViewContext/, 'TopologyPage should build view-specific copilot context')
assert.match(topoPageCode, /viewContext={topologyCopilotViewContext}/, 'TopologyPage should pass view-specific context to CopilotPanel')
assert.match(topoPageCode, /pathAnalysisResult[\s\S]*overallVerdict/, 'TopologyPage copilot context should summarize path analysis when present')

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
assert.match(topoPageCode, /from '\.\/topology\/formatting'/, 'TopologyPage should import from topology/formatting')
assert.match(topoPageCode, /getPathAnalysis\(/, 'TopologyPage should call getPathAnalysis')
assert.match(topoPageCode, /PathAnalysisResponse/, 'TopologyPage should use PathAnalysisResponse type')
const topoFormatCode = readFileSync(path.join(repoRoot, 'frontend/src/pages/topology/formatting.ts'), 'utf8')
assert.match(topoFormatCode, /function formatPeeringEvidenceHint/, 'topology/formatting should define peering evidence helper')
assert.match(topoFormatCode, /topology\.detail\.peeringForwarded/, 'topology/formatting should reference forwarded peering i18n key')
assert.match(topoFormatCode, /topology\.detail\.peeringDirect/, 'topology/formatting should reference direct peering i18n key')
assert.match(topoFormatCode, /topology\.detail\.archiveMissing/, 'topology/formatting should reference archive missing i18n key')

// ============================================================
// Section 12: Snapshot compare
// ============================================================
assert.match(topoPageCode, /compareTopologySnapshots\(/, 'TopologyPage should call compareTopologySnapshots')

// ============================================================
// Section 12.5: Localized fallback errors
// ============================================================
const fallbackErrorKeys = [
  'topology.error.snapshotLoadFailed',
  'topology.error.snapshotStorageWriteFailed',
  'topology.error.snapshotStorageReadFailed',
  'topology.error.manualModelingLoadFailed',
  'topology.error.inventoryScopeLoadFailed',
  'topology.error.unknown',
]
for (const key of fallbackErrorKeys) {
  assert.ok(topoPageCode.includes(`t('${key}')`), `TopologyPage should use localized fallback key ${key}`)
  assert.ok(dictCode.includes(`'${key}':`), `i18n dict should define fallback key ${key}`)
}

// ============================================================
// Section 13: Export functionality
// ============================================================
assert.match(topoPageCode, /createExport\(/, 'TopologyPage should call createExport')

// ============================================================
// Section 13.5: Raw topology diff drilldown and markdown export
// ============================================================
assert.match(topoFormatCode, /function buildTopologyDiffMarkdown/, 'topology/formatting should define raw topology diff markdown export builder')
assert.match(topoPageCode, /function renderDiffDrilldownSection/, 'TopologyPage should render expandable topology diff drilldown sections')
assert.match(topoPageCode, /diffExpandedSections/, 'TopologyPage should track expanded diff sections')
assert.match(topoFormatCode, /Before:\s*\$\{formatNodeDetail\(c\.base\)\}/, 'markdown export should include changed-node before details')
assert.match(topoFormatCode, /After:\s*\$\{formatNodeDetail\(c\.target\)\}/, 'markdown export should include changed-node after details')
assert.match(topoPageCode, /topology\.diff\.changedEdges/, 'TopologyPage should render changed raw topology edge drilldown via i18n key when present')
assert.match(topoPageCode, /edge-changed/, 'TopologyPage should include changed edge sections in expand or collapse all')
assert.match(topoFormatCode, /## Changed Edges/, 'markdown export should include changed-edge details')
assert.match(topoFormatCode, /Before:\s*\$\{formatEdgeDetail\(c\.base\)\}/, 'markdown export should include changed-edge before details')
assert.match(topoFormatCode, /After:\s*\$\{formatEdgeDetail\(c\.target\)\}/, 'markdown export should include changed-edge after details')
assert.match(topoFormatCode, /DISPLAY_MAX|DISPLAY_LIMIT/, 'raw topology diff drilldown/export should keep a bounded display cap')

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

// ============================================================
// Section 17: UI modernization affordances
// ============================================================
assert.match(topoPageCode, /canvasMaximized/, 'TopologyPage should track canvas maximize/focus state')
assert.match(topoPageCode, /topology\.canvas\.focusMode/, 'TopologyPage should render localized canvas focus-mode action')
assert.match(topoPageCode, /topology\.canvas\.exitFocus/, 'TopologyPage should render localized canvas exit-focus action')
assert.match(topoPageCode, /function handleOpenCanvasWindow/, 'TopologyPage should support opening the canvas in a dedicated window')
assert.match(topoPageCode, /URL\.createObjectURL\(new Blob/, 'Canvas popout should use a Blob URL instead of document.write into a noopener window')
assert.doesNotMatch(topoPageCode, /popup\.document\.write/, 'Canvas popout should avoid document.write after window.open')
assert.match(topoPageCode, /window\.open\(blobUrl, '_blank'/, 'Canvas popout should open the generated Blob URL in a new browser window')
assert.match(topoPageCode, /URL\.revokeObjectURL\(blobUrl\)/, 'Canvas popout should revoke Blob URLs after use')
assert.match(topoPageCode, /topology\.canvas\.openWindow/, 'TopologyPage should render localized canvas popout action')
assert.match(topoPageCode, /cy\.resize\(\)/, 'Canvas focus mode should resize Cytoscape before fitting')
assert.match(topoPageCode, /aria-pressed=\{canvasMaximized\}/, 'Canvas focus toggle should expose pressed state for accessibility')
assert.match(topoPageCode, /role=\{canvasMaximized \? 'dialog' : undefined\}/, 'Focused canvas should expose dialog semantics')
assert.match(topoPageCode, /target instanceof HTMLInputElement/, 'Global Escape handling should ignore editable targets')
assert.match(topoPageCode, /workspace-inventory-list/, 'Workspace inventory preview should have a dedicated scroll class')
assert.match(topoPageCode, /availableResources\.map/, 'Workspace inventory preview should render the full loaded resource window, not a hard-coded slice')
assert.doesNotMatch(topoPageCode, /availableResources\.slice\(0,\s*8\)/, 'Workspace inventory preview should not hide resources behind a fixed 8-item slice')
assert.match(topoPageCode, /edge-preview-list/, 'Edge preview should have a dedicated scroll class')
assert.match(topoPageCode, /const edgePreview = useMemo\(\(\) => filteredTopology\.edges/, 'Edge preview should expose the full filtered edge set inside a scroll container')
assert.doesNotMatch(topoPageCode, /filteredTopology\.edges\.slice\(0,\s*16\)/, 'Edge preview should not hide edges behind a fixed 16-item slice')
assert.match(topoPageCode, /<details className="panel-card collapsible-panel">/, 'Dense lower topology panels should be collapsible instead of always expanded')
assert.match(topoPageCode, /topology-control-panel/, 'Dense control panels should be collapsible instead of always expanded')
assert.match(topoPageCode, /graphControlsOpen/, 'Primary graph controls should remain discoverable while still allowing user collapse')
assert.match(topoPageCode, /<span className="mini-status">\{compareLayoutStatus\}<\/span>/, 'Primary controls summary should show the active layout state instead of a static default label')
assert.match(topoPageCode, /controls-layout collapsible-panel-grid/, 'Controls should use the collapsible grid treatment')
assert.match(topoPageCode, /collapsible-panel-grid/, 'Dense lower topology panels should sit in a collapsible grid')
assert.match(appStyleCode, /\.compact-list\s*\{[\s\S]*overflow-y:\s*auto/, 'compact lists should scroll vertically instead of clipping')
assert.match(appStyleCode, /\.canvas-card-maximized/, 'styles should include a focused/maximized canvas card mode')
assert.match(appStyleCode, /\.graph-canvas-maximized/, 'styles should include focused canvas dimensions')
assert.match(appStyleCode, /\.canvas-card-maximized \.graph-canvas-shell\s*\{[\s\S]*flex:\s*1 1 auto[\s\S]*display:\s*flex/, 'focused canvas shell should use flex sizing instead of a fragile viewport subtraction')
assert.match(appStyleCode, /\.graph-canvas-maximized\s*\{[\s\S]*height:\s*auto[\s\S]*min-height:\s*360px/, 'focused canvas should flex-fill the remaining space without a fixed viewport calc')
assert.doesNotMatch(appStyleCode, /\.graph-canvas-maximized\s*\{[\s\S]*height:\s*calc\(100vh - 320px\)/, 'focused canvas should not use a brittle hard-coded viewport subtraction')
assert.match(appStyleCode, /\.canvas-card-maximized \.graph-toolbar\s*\{[\s\S]*position:\s*sticky/, 'focused canvas mode should keep the graph toolbar sticky and accessible')
assert.match(appStyleCode, /\.canvas-card-maximized \.relation-legend\s*\{[\s\S]*max-height:\s*72px[\s\S]*overflow-y:\s*auto/, 'focused canvas mode should constrain dense legend rows without hiding them')
assert.match(appStyleCode, /\.canvas-card-maximized \.search-toolbar\s*\{[\s\S]*padding:\s*10px/, 'focused canvas mode should compact the search toolbar')
assert.match(appStyleCode, /\.canvas-card-maximized \.search-form\s*\{[\s\S]*grid-template-columns:\s*minmax\(280px, 1fr\) auto/, 'focused canvas search form should use a horizontal layout on wide screens')
assert.match(appStyleCode, /overflow-wrap:\s*anywhere/, 'long resource and edge labels should wrap safely')
assert.match(appStyleCode, /\.collapsible-summary/, 'styles should include modern collapsible section affordances')
assert.match(appStyleCode, /\.preset-list-grid\s*\{[\s\S]*max-height:\s*620px[\s\S]*overflow-y:\s*auto/, 'snapshot and preset lists should scroll within the controls panel instead of lengthening the full page')
for (const key of ['topology.canvas.focusMode', 'topology.canvas.exitFocus', 'topology.canvas.openWindow', 'topology.canvas.popoutTitle', 'topology.canvas.openedWindow', 'topology.canvas.openWindowFailed']) {
  assert.ok(dictCode.includes(`'${key}':`), `i18n dict should define ${key}`)
}

console.log('✅ topology_page_semantics_smoke.mts: all assertions passed')
