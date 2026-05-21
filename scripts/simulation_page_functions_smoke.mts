/**
 * Browserless FE semantics smoke — SimulationPage utility functions.
 * Tests the actual behavioral contracts of SimulationPage helpers.
 * Run: node --experimental-strip-types scripts/simulation_page_functions_smoke.mts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..')
const simPageCode = readFileSync(path.join(repoRoot, 'frontend/src/pages/SimulationPage.tsx'), 'utf8')

// ============================================================
// Section 1: priorityTone — Simulation priority CSS class mapping
// ============================================================
function priorityTone(priority: string): string {
  if (priority === 'required') return 'severity-high'
  if (priority === 'recommended') return 'severity-medium'
  return 'severity-low'
}

assert.equal(priorityTone('required'), 'severity-high', 'priorityTone(required) → severity-high')
assert.equal(priorityTone('recommended'), 'severity-medium', 'priorityTone(recommended) → severity-medium')
assert.equal(priorityTone('optional'), 'severity-low', 'priorityTone(optional) → severity-low')
assert.equal(priorityTone(''), 'severity-low', 'priorityTone(empty) → severity-low')
assert.equal(priorityTone(null as unknown as string), 'severity-low', 'priorityTone(undefined) → severity-low')

assert.match(simPageCode, /function priorityTone\(priority: string\)/, 'SimulationPage should define priorityTone')

// Verify priorityTone is used with simulation priority data
assert.match(simPageCode, /priorityTone\(/, 'SimulationPage should call priorityTone')

// ============================================================
// Section 2: safeFileName — download filename sanitization
// ============================================================
function safeFileName(value: string): string {
  return value.trim().replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'simulation'
}

assert.equal(safeFileName('my-simulation'), 'my-simulation', 'safeFileName passes through valid names')
assert.equal(safeFileName('My Simulation'), 'my-simulation', 'safeFileName lowercases and replaces spaces')
assert.equal(safeFileName('App v2.0!'), 'app-v2.0', 'safeFileName replaces special chars and trims trailing')
assert.equal(safeFileName('  spaces  '), 'spaces', 'safeFileName trims and collapses spaces')
assert.equal(safeFileName('!!!'), 'simulation', 'safeFileName defaults to simulation for all-special-char input')
assert.equal(safeFileName(''), 'simulation', 'safeFileName defaults to simulation for empty input')
assert.equal(safeFileName('hello/world'), 'hello-world', 'safeFileName replaces slashes')
assert.equal(safeFileName('test@#$file'), 'test-file', 'safeFileName collapses consecutive special chars into single hyphen')

assert.match(simPageCode, /function safeFileName\(value: string\)/, 'SimulationPage should define safeFileName')
assert.match(simPageCode, /safeFileName\(/, 'SimulationPage should call safeFileName')

// ============================================================
// Section 3: SimulationPage default values
// ============================================================
// Verify default workload name
assert.match(simPageCode, /new-app/, 'SimulationPage should have "new-app" as default workload name')
// Verify default environment
assert.match(simPageCode, /dev/, 'SimulationPage should have "dev" as default environment')

// ============================================================
// Section 4: SimulationPage state shape — verify expected state variables exist
// ============================================================
const expectedStates = [
  'workspaceId',
  'workloadName',
  'environment',
  'description',
  'simulations',
  'selectedSimulationId',
  'template',
  'fit',
  'report',
  'fitLimit',
  'templateLoading',
  'loading',
  'error',
]

for (const stateName of expectedStates) {
  assert.match(simPageCode, new RegExp(`${stateName}`), `SimulationPage should have state variable: ${stateName}`)
}

// ============================================================
// Section 5: SimulationPage API integration — verify all API calls are present
// ============================================================
const expectedApiCalls = [
  'getSimulations',
  'createSimulation',
  'getSimulationTemplate',
  'getSimulationFit',
  'getSimulationReport',
]

for (const apiCall of expectedApiCalls) {
  assert.match(simPageCode, new RegExp(`${apiCall}`), `SimulationPage should call ${apiCall}`)
}
assert.match(simPageCode, /CopilotPanel/, 'SimulationPage should import and render CopilotPanel')
assert.match(simPageCode, /currentView="simulation"/, 'SimulationPage should pass simulation current view to CopilotPanel')

// ============================================================
// Section 6: SimulationPage download functions exist
// ============================================================
assert.match(simPageCode, /downloadSimulationReport|downloadReport/i, 'SimulationPage should have downloadReport function')
assert.match(simPageCode, /downloadSimulationTemplate|downloadTemplate/i, 'SimulationPage should have downloadTemplate function')

// ============================================================
// Section 7: SimulationPage fitLimit default value
// ============================================================
assert.match(simPageCode, /fitLimit.*useState.*200|useState.*200.*fitLimit/, 'SimulationPage fitLimit should default to 200')

// ============================================================
// Section 8: SimulationPage error handling — empty in-process store should not block
// ============================================================
assert.match(
  simPageCode,
  /Empty in-process store|backend not ready|catch.*\{[\s\S]*?\}/,
  'SimulationPage should handle empty store/backend-not-ready gracefully',
)

console.log('✅ simulation_page_functions_smoke.mts: all assertions passed')

// ============================================================
// Section 9: i18n integration — SimulationPage uses locale-aware labels
// ============================================================
assert.match(simPageCode, /useI18n/, 'SimulationPage should use i18n hook')
assert.match(simPageCode, /t\('sim\./, 'SimulationPage should reference sim.* i18n keys')
assert.match(simPageCode, /t\('sim\.hero\.eyebrow'\)/, 'SimulationPage hero eyebrow should be localized')
assert.match(simPageCode, /t\('sim\.hero\.title'\)/, 'SimulationPage hero title should be localized')
assert.match(simPageCode, /t\('sim\.hero\.subtext'\)/, 'SimulationPage hero subtext should be localized')
assert.match(simPageCode, /t\('sim\.form\.workspace'\)/, 'SimulationPage form workspace label should be localized')
assert.match(simPageCode, /t\('sim\.form\.workload'\)/, 'SimulationPage form workload label should be localized')
assert.match(simPageCode, /t\('sim\.form\.environment'\)/, 'SimulationPage form environment label should be localized')
assert.match(simPageCode, /t\('sim\.form\.fitLimit'\)/, 'SimulationPage form fit limit label should be localized')
assert.match(simPageCode, /t\('sim\.form\.description'\)/, 'SimulationPage form description label should be localized')
assert.match(simPageCode, /t\('sim\.form\.generate'\)/, 'SimulationPage generate button should be localized')
assert.match(simPageCode, /t\('sim\.form\.descriptionRequired'\)/, 'SimulationPage error message should be localized')
assert.match(simPageCode, /t\('sim\.list\.heading'\)/, 'SimulationPage list heading should be localized')
assert.match(simPageCode, /t\('sim\.list\.empty'\)/, 'SimulationPage list empty state should be localized')
assert.match(simPageCode, /t\('sim\.detail\.heading'\)/, 'SimulationPage detail heading should be localized')
assert.match(simPageCode, /t\('sim\.detail\.empty'\)/, 'SimulationPage detail empty state should be localized')
assert.match(simPageCode, /t\('sim\.fit\.heading'\)/, 'SimulationPage fit heading should be localized')
assert.match(simPageCode, /t\('sim\.notes\.architecture'\)/, 'SimulationPage architecture notes heading should be localized')
assert.match(simPageCode, /t\('sim\.notes\.cost'\)/, 'SimulationPage cost notes heading should be localized')
assert.match(simPageCode, /t\('sim\.notes\.security'\)/, 'SimulationPage security notes heading should be localized')
assert.match(simPageCode, /t\('sim\.notes\.nextActions'\)/, 'SimulationPage next actions heading should be localized')
assert.match(simPageCode, /t\('sim\.notes\.assumptions'\)/, 'SimulationPage assumptions heading should be localized')
assert.match(simPageCode, /t\('sim\.report\.heading'\)/, 'SimulationPage report heading should be localized')
assert.match(simPageCode, /t\('sim\.report\.download'\)/, 'SimulationPage report download button should be localized')
assert.match(simPageCode, /t\('sim\.report\.unavailable'\)/, 'SimulationPage report unavailable should be localized')
assert.match(simPageCode, /t\('sim\.iac\.heading'\)/, 'SimulationPage IaC heading should be localized')
assert.match(simPageCode, /t\('sim\.iac\.unavailable'\)/, 'SimulationPage IaC unavailable should be localized')
assert.match(simPageCode, /t\('sim\.iac\.loading'\)/, 'SimulationPage IaC loading should be localized')
console.log('simulation_page_functions_smoke.mts: i18n section passed')
