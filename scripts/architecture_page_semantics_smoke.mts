/**
 * Browserless FE semantics smoke — ArchitecturePage structure and contracts.
 * Validates ArchitecturePage imports, stage metadata, and model contracts.
 * Run: node --experimental-strip-types scripts/architecture_page_semantics_smoke.mts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..')
const archPageCode = readFileSync(path.join(repoRoot, 'frontend/src/pages/ArchitecturePage.tsx'), 'utf8')
const archModelCode = readFileSync(path.join(repoRoot, 'frontend/src/pages/architecture/model.ts'), 'utf8')
const archStorageCode = readFileSync(path.join(repoRoot, 'frontend/src/pages/architecture/storage.ts'), 'utf8')
const apiCode = readFileSync(path.join(repoRoot, 'frontend/src/lib/api.ts'), 'utf8')

// ============================================================
// Section 1: ArchitecturePage API imports
// ============================================================
const requiredImports = [
  'getWorkspaces',
  'getWorkspaceSubscriptions',
  'getWorkspaceResourceGroups',
  'getWorkspaceInventorySummary',
  'getTopology',
  'createExport',
  'getAuthConfigCheck',
]

for (const imp of requiredImports) {
  assert.match(archPageCode, new RegExp(`\\b${imp}\\b`), `ArchitecturePage should import ${imp}`)
}

// ============================================================
// Section 2: ArchitecturePage model imports
// ============================================================
const modelImports = ['buildArchitectureViewModel', 'renderArchitectureSvg', 'ArchitectureNode', 'ArchitectureEdge']
for (const imp of modelImports) {
  assert.match(archModelCode, new RegExp(`export.*\\b${imp}\\b|export type ${imp}|export interface ${imp}`), `architecture/model should export ${imp}`)
}

// ============================================================
// Section 3: Architecture stage metadata
// ============================================================
assert.match(archModelCode, /ARCHITECTURE_STAGE_META|ARCHITECTURE_STAGE_ORDER/, 'architecture/model should define stage metadata/order')
assert.match(archModelCode, /ARCHITECTURE_STAGE/, 'architecture/model should reference ARCHITECTURE_STAGE constants')

// ============================================================
// Section 4: ArchitecturePage state variables
// ============================================================
const expectedStates = [
  'workspaces',
  'selectedWorkspaceId',
  'subscriptions',
  'resourceGroups',
  'inventorySummary',
  'topology',
  'loading',
  'error',
  'search',
  'selectedNodeId',
  'showInfraOverlay',
  'nodeOverrides',
]

for (const stateName of expectedStates) {
  assert.match(archPageCode, new RegExp(`${stateName}`), `ArchitecturePage should have state: ${stateName}`)
}

// ============================================================
// Section 5: ArchitecturePage export functionality
// ============================================================
assert.match(archPageCode, /createExport/, 'ArchitecturePage should use createExport')
assert.match(archPageCode, /export|Export/i, 'ArchitecturePage should have export functionality')

// ============================================================
// Section 6: ArchitecturePage URL param handling
// ============================================================
assert.match(archPageCode, /readInitialSearchParam/, 'ArchitecturePage should have readInitialSearchParam utility')
assert.match(archPageCode, /parseInitialWorkspaceId|parseInitialSubscriptionId|parseInitialResourceGroupName/, 'ArchitecturePage should parse initial URL params')

// ============================================================
// Section 7: ArchitecturePage formatDateTime utility
// ============================================================
assert.match(archPageCode, /function formatDateTime/, 'ArchitecturePage should define formatDateTime')
assert.match(archPageCode, /Intl\.DateTimeFormat/, 'ArchitecturePage should use Intl.DateTimeFormat')

// ============================================================
// Section 8: ArchitecturePage storage (override state)
// ============================================================
assert.match(archPageCode, /saveArchitectureOverrideState|loadArchitectureOverrideState|clearArchitectureOverrideState/, 'ArchitecturePage should use architecture storage functions')

// ============================================================
// Section 9: ArchitecturePage workspace CRUD
// ============================================================
assert.match(archPageCode, /getWorkspaces\(/, 'ArchitecturePage should call getWorkspaces')
assert.match(archPageCode, /getWorkspaceSubscriptions\(/, 'ArchitecturePage should call getWorkspaceSubscriptions')
assert.match(archPageCode, /getWorkspaceResourceGroups\(/, 'ArchitecturePage should call getWorkspaceResourceGroups')

// ============================================================
// Section 10: ArchitecturePage topology rendering
// ============================================================
assert.match(archPageCode, /buildArchitectureViewModel\(/, 'ArchitecturePage should call buildArchitectureViewModel')
assert.match(archPageCode, /renderArchitectureSvg\(/, 'ArchitecturePage should call renderArchitectureSvg')

// ============================================================
// Section 11: API types for ArchitecturePage
// ============================================================
assert.match(apiCode, /export type Workspace/, 'api.ts should export Workspace type')
assert.match(apiCode, /export type InventorySummaryResponse/, 'api.ts should export InventorySummaryResponse type')
assert.match(apiCode, /export type TopologyResponse/, 'api.ts should export TopologyResponse type')

// ============================================================
// Section 12: Auth diagnostics
// ============================================================
assert.match(archPageCode, /getAuthConfigCheck/, 'ArchitecturePage should import getAuthConfigCheck')

// ============================================================
// Section 13: Infra overlay presentation control
// ============================================================
assert.match(archPageCode, /showInfraOverlay/, 'ArchitecturePage should expose an infra overlay visibility state')
assert.match(archPageCode, /Show infra overlay lane/, 'ArchitecturePage should render the infra overlay control copy')
assert.match(archPageCode, /bucket\.stage === 'infra' && !showInfraOverlay/, 'ArchitecturePage should hide infra bucket nodes without mutating topology')

// ============================================================
// Section 14: Presentation overrides
// ============================================================
assert.match(archPageCode, /nodeOverrides/, 'ArchitecturePage should track node presentation overrides')
assert.match(archPageCode, /displayNameOverride/, 'ArchitecturePage should support presentation label overrides')
assert.match(archPageCode, /stageKeyOverride/, 'ArchitecturePage should support presentation stage overrides')
assert.match(archPageCode, /arch-detail-label-override/, 'ArchitecturePage should expose selected-card label override input')
assert.match(archPageCode, /arch-detail-stage-override/, 'ArchitecturePage should expose selected-card stage override select')
assert.match(archStorageCode, /nodeOverrides/, 'architecture/storage should persist presentation overrides')
assert.match(archModelCode, /ArchitectureNodeOverride/, 'architecture/model should define override options')
assert.match(archModelCode, /nodeOverrides\[node\.node_key\]\?\.stageKeyOverride/, 'architecture/model should apply stage overrides before bucket render')
assert.match(archModelCode, /displayNameOverride/, 'architecture/model should prefer label overrides when rendering cards')

console.log('architecture_page_semantics_smoke.mts: all assertions passed')
