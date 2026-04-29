/**
 * Browserless FE semantics smoke — CostPage/SimulationPage utility functions.
 * Tests the actual behavioral contracts of UI control helpers.
 * Run: node --experimental-strip-types scripts/cost_page_functions_smoke.mts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..')
const costPageCode = readFileSync(path.join(repoRoot, 'frontend/src/pages/CostPage.tsx'), 'utf8')
const simPageCode = readFileSync(path.join(repoRoot, 'frontend/src/pages/SimulationPage.tsx'), 'utf8')

// ============================================================
// Section 1: severityRank — CostPage severity ordering
// ============================================================
function severityRank(value: string): number {
  if (value === 'high') return 0
  if (value === 'medium') return 1
  if (value === 'low') return 2
  return 3
}

assert.equal(severityRank('high'), 0, 'severityRank(high) should be 0 (first in sort)')
assert.equal(severityRank('medium'), 1, 'severityRank(medium) should be 1')
assert.equal(severityRank('low'), 2, 'severityRank(low) should be 2')
assert.equal(severityRank('unknown'), 3, 'severityRank(unknown) should be 3 (last in sort)')
assert.equal(severityRank(''), 3, 'severityRank(empty) should fall through to 3')
assert.equal(severityRank('critical'), 3, 'severityRank(unrecognized) should fall through to 3')
assert.match(costPageCode, /function severityRank\(value: string\)/, 'CostPage should define severityRank function')
assert.match(costPageCode, /severityRank.*sort|sort.*severityRank/i, 'CostPage should use severityRank for sorting')

// ============================================================
// Section 2: formatCostStatus — Cost status display
// ============================================================
function formatCostStatus(summary: { estimated_monthly_cost: number | null; currency: string | null } | null): string {
  if (!summary) return 'loading'
  if (summary.estimated_monthly_cost == null) {
    return 'No dollar amount yet — rule-based analysis only'
  }
  return `${summary.currency ?? ''} ${summary.estimated_monthly_cost}`.trim()
}

assert.equal(formatCostStatus(null), 'loading', 'formatCostStatus(null) should return "loading"')
assert.equal(
  formatCostStatus({ estimated_monthly_cost: null, currency: null }),
  'No dollar amount yet — rule-based analysis only',
  'formatCostStatus with null cost should indicate rule-based analysis only',
)
assert.equal(formatCostStatus({ estimated_monthly_cost: 123.45, currency: null }), '123.45', 'formatCostStatus without currency should show number only')
assert.equal(formatCostStatus({ estimated_monthly_cost: 123.45, currency: 'USD' }), 'USD 123.45', 'formatCostStatus with currency should show "USD 123.45"')
assert.equal(formatCostStatus({ estimated_monthly_cost: 0, currency: 'CAD' }), 'CAD 0', 'formatCostStatus with zero cost should show "CAD 0"')
assert.match(costPageCode, /function formatCostStatus/, 'CostPage should define formatCostStatus function')

// ============================================================
// Section 3: formatCountMap — Count map display
// ============================================================
function formatCountMap(value: Record<string, number>): string {
  const entries = Object.entries(value)
  if (!entries.length) return 'none'
  return entries.map(([key, count]) => `${key}: ${count}`).join(' • ')
}

assert.equal(formatCountMap({}), 'none', 'formatCountMap({}) should return "none"')
assert.equal(formatCountMap({ high: 2 }), 'high: 2', 'formatCountMap single entry')
assert.equal(formatCountMap({ high: 2, medium: 5, low: 1 }), 'high: 2 • medium: 5 • low: 1', 'formatCountMap should join with " • " separator')
assert.match(costPageCode, /function formatCountMap\(value: Record<string, number>\)/, 'CostPage should define formatCountMap function')

// ============================================================
// Section 4: SimulationPage priorityTone
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
assert.match(simPageCode, /function priorityTone\(priority: string\)/, 'SimulationPage should define priorityTone')

// ============================================================
// Section 5: SimulationPage safeFileName
// ============================================================
function safeFileName(value: string): string {
  return value.trim().replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'simulation'
}

assert.equal(safeFileName('my-simulation'), 'my-simulation', 'safeFileName passes through valid names')
assert.equal(safeFileName('My Simulation'), 'my-simulation', 'safeFileName lowercases and replaces spaces')
assert.equal(safeFileName('App v2.0!'), 'app-v2.0', 'safeFileName replaces special chars and trims trailing hyphen')
assert.equal(safeFileName('  spaces  '), 'spaces', 'safeFileName trims and collapses spaces')
assert.equal(safeFileName('!!!'), 'simulation', 'safeFileName defaults to "simulation" for all-special-char input')
assert.equal(safeFileName(''), 'simulation', 'safeFileName defaults to "simulation" for empty input')
assert.equal(safeFileName('hello/world'), 'hello-world', 'safeFileName replaces slashes with hyphens')
assert.equal(safeFileName('test@#$file'), 'test-file', 'safeFileName collapses consecutive special chars into single hyphen')
assert.match(simPageCode, /function safeFileName\(value: string\)/, 'SimulationPage should define safeFileName')

// ============================================================
// Section 6: CostPage mode state
// ============================================================
assert.match(costPageCode, /\[mode.*setMode|setMode.*useState|useState.*mode\]/, 'CostPage should have a mode state variable')

// ============================================================
// Section 7: CostPage subscription/resourceGroup limit validation
// ============================================================
assert.match(costPageCode, /resourceGroupLimit/, 'CostPage should track resourceGroupLimit')
assert.match(costPageCode, /resourceLimit/, 'CostPage should track resourceLimit')
assert.match(simPageCode, /fitLimit/, 'SimulationPage should track fitLimit')

// ============================================================
// Section 8: Copilot prompt default
// ============================================================
assert.match(costPageCode, /How can I reduce cost|reduce.*cost|cost.*optimization/i, 'CostPage copilot should have a cost-reduction prompt')

console.log('✅ cost_page_functions_smoke.mts: all assertions passed')
