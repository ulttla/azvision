/**
 * Browserless FE semantics smoke — Copilot/Chat API contract alignment.
 * Validates that CostPage's copilot usage matches the API contract.
 * Run: node --experimental-strip-types scripts/copilot_api_semantics_smoke.mts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..')
const apiContractDoc = readFileSync(path.join(repoRoot, 'docs/API_CONTRACT.md'), 'utf8')
const costPageCode = readFileSync(path.join(repoRoot, 'frontend/src/pages/CostPage.tsx'), 'utf8')
const apiCode = readFileSync(path.join(repoRoot, 'frontend/src/lib/api.ts'), 'utf8')

// ============================================================
// Section 1: CopilotResponse type contract
// ============================================================
assert.match(apiCode, /export type CopilotResponse/, 'api.ts should export CopilotResponse type')
assert.match(apiCode, /copilot_mode/, 'CopilotResponse should include copilot_mode field')
assert.match(apiCode, /answer: string/, 'CopilotResponse should include answer field')
assert.match(apiCode, /suggestions: string\[\]/, 'CopilotResponse should include suggestions field')
assert.match(apiCode, /ok: boolean/, 'CopilotResponse should include ok field')
assert.match(apiCode, /workspace_id: string/, 'CopilotResponse should include workspace_id field')
assert.match(apiCode, /llm_status: string/, 'CopilotResponse should include llm_status field')

// ============================================================
// Section 2: postCopilotMessage function
// ============================================================
assert.match(apiCode, /export async function postCopilotMessage[\s\S]*?workspaceId[\s\S]*?message/, 'postCopilotMessage should take workspaceId and message')
assert.match(apiCode, /postCopilotMessage[\s\S]*?buildInventoryQuery/, 'postCopilotMessage should use inventory query options')

// ============================================================
// Section 3: CostPage copilot usage
// ============================================================
assert.match(costPageCode, /postCopilotMessage/, 'CostPage should import postCopilotMessage')
assert.match(costPageCode, /CopilotResponse/, 'CostPage should import CopilotResponse type')
assert.match(costPageCode, /copilotResponse.*useState.*CopilotResponse|useState.*CopilotResponse.*copilotResponse/, 'CostPage should have copilotResponse state typed as CopilotResponse')
assert.match(costPageCode, /postCopilotMessage\(workspaceId/, 'CostPage should call postCopilotMessage with workspaceId')
assert.match(costPageCode, /askCopilot/, 'CostPage should have askCopilot handler')
assert.match(costPageCode, /copilotPrompt.*useState|useState.*copilotPrompt/, 'CostPage should have copilotPrompt state')

// ============================================================
// Section 4: API contract doc — chat endpoint
// ============================================================
assert.match(
  apiContractDoc,
  /chat|copilot/i,
  'API contract doc should mention chat/copilot endpoint',
)

// ============================================================
// Section 5: CostPage copilot loading state
// ============================================================
assert.match(costPageCode, /copilotLoading/, 'CostPage should have copilotLoading state')
assert.match(costPageCode, /setCopilotResponse/, 'CostPage should set copilotResponse')

// ============================================================
// Section 6: CostPage copilot error handling
// ============================================================
assert.match(costPageCode, /ApiError/, 'CostPage should handle ApiError type')

console.log('✅ copilot_api_semantics_smoke.mts: all assertions passed')
