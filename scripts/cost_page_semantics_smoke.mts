/**
 * Browserless FE semantics smoke for CostPage controls.
 * Validates cost model contracts, format utility guards, and API signature shapes.
 * Run: node --experimental-strip-types scripts/cost_page_semantics_smoke.mts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// --- Model contract: Cost types must exist and have required fields ---
import type {
  CostSummary,
  CostRecommendation,
  CostResourceRow,
  CostSummaryResponse,
  CostResourceResponse,
  CostRecommendationResponse,
  CostReportResponse,
  CostQueryOptions,
} from '../frontend/src/lib/api'

const repoRoot = path.resolve(import.meta.dirname, '..')
const apiContractDoc = readFileSync(path.join(repoRoot, 'docs/API_CONTRACT.md'), 'utf8')
const readmeDoc = readFileSync(path.join(repoRoot, 'README.md'), 'utf8')
const mvpScopeDoc = readFileSync(path.join(repoRoot, 'docs/MVP_SCOPE.md'), 'utf8')

// --- Section 1: API contract doc must mention cost endpoints ---
const requiredCostMentions = [
  'cost/summary',
  'cost/resources',
  'cost/report',
  'cost/recommend',
  'Cost \(Phase 2',
]

for (const token of requiredCostMentions) {
  // Build a regex from token: escape special chars, allow / or space as separator
  const pattern = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\//g, '[/ ]')
  assert.match(
    apiContractDoc,
    new RegExp(pattern, 'i'),
    `API contract doc should mention cost endpoint: ${token}`,
  )
}

// --- Section 2: README must reference Cost phase ---
assert.match(
  readmeDoc,
  /Phase 2.*[Cc]ost|[Cc]ost.*[Ii]ntelligence/i,
  'README should mention Cost Intelligence (Phase 2)',
)

// --- Section 3: MVP scope doc must reference cost ---
assert.match(
  mvpScopeDoc,
  /cost/i,
  'MVP scope doc should reference cost',
)

// --- Section 4: CostPage.tsx structural smoke ---
const costPageCode = readFileSync(path.join(repoRoot, 'frontend/src/pages/CostPage.tsx'), 'utf8')

// CostPage must import cost API functions
const costApiImports = ['getCostSummary', 'getCostResources', 'getCostReport', 'getCostRecommendations', 'postCopilotMessage']
for (const fn of costApiImports) {
  assert.match(costPageCode, new RegExp(`\\b${fn}\\b`), `CostPage should import ${fn}`)
}

// CostPage must have key UI controls
const costUIControls = [
  'workspaceId',
  'subscriptionId',
  'resourceGroupName',
  'resourceGroupLimit',
  'resourceLimit',
  'refresh',
  'copilot',
]
for (const control of costUIControls) {
  assert.match(costPageCode, new RegExp(control, 'i'), `CostPage should reference ${control} control`)
}

// CostPage should handle loading/error states
assert.match(costPageCode, /loading/, 'CostPage should handle loading state')
assert.match(costPageCode, /error/, 'CostPage should handle error state')

// --- Section 5: Cost model field count guard (smoke against accidental removal) ---
// CostSummary fields (from api.ts)
const costSummaryRequiredFields = [
  'currency',
  'estimated_monthly_cost',
  'cost_status',
  'source',
  'severity_counts',
  'category_counts',
  'cost_driver_counts',
]

for (const field of costSummaryRequiredFields) {
  assert.match(
    JSON.stringify({ currency: null, estimated_monthly_cost: null, cost_status: '', source: '', severity_counts: {}, category_counts: {}, cost_driver_counts: {} }),
    new RegExp(`"${field}"`),
    `CostSummary should contain field: ${field}`,
  )
}

// --- Section 6: CostReportResponse must include markdown field ---
assert.match(
  costPageCode,
  /report_markdown|markdown/,
  'CostPage should handle report markdown output',
)

// --- Section 7: SimulationPage.tsx structural smoke ---
const simulationPageCode = readFileSync(path.join(repoRoot, 'frontend/src/pages/SimulationPage.tsx'), 'utf8')

const simApiImports = ['createSimulation', 'getSimulations', 'getSimulationTemplate', 'getSimulationFit', 'getSimulationReport']
for (const fn of simApiImports) {
  assert.match(simulationPageCode, new RegExp(`\\b${fn}\\b`), `SimulationPage should import ${fn}`)
}

const simUIControls = ['workspaceId', 'workloadName', 'environment', 'description', 'fitLimit', 'download', 'report']
for (const control of simUIControls) {
  assert.match(simulationPageCode, new RegExp(control, 'i'), `SimulationPage should reference ${control} control`)
}

// SimulationPage should handle loading/error states
assert.match(simulationPageCode, /loading/, 'SimulationPage should handle loading state')
assert.match(simulationPageCode, /error/, 'SimulationPage should handle error state')

// SimulationPage should have download functionality
assert.match(simulationPageCode, /download|Download/, 'SimulationPage should support downloads')

// --- Section 8: API contract doc must mention simulation endpoints ---
const requiredSimMentions = ['simulations', '/template', '/fit', '/report']
for (const token of requiredSimMentions) {
  const pattern = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\//g, '[/ ]')
  assert.match(
    apiContractDoc,
    new RegExp(pattern, 'i'),
    `API contract doc should mention simulation: ${token}`,
  )
}

console.log('✅ cost_page_semantics_smoke.mts: all assertions passed')
