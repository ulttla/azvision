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
const dictCode = readFileSync(path.join(repoRoot, 'frontend/src/i18n/dict.ts'), 'utf8')
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
assert.match(apiCode, /read_only\?: boolean/, 'CopilotResponse should include read_only field')
assert.match(apiCode, /model\?: string \| null/, 'CopilotResponse should include optional model field')
assert.match(apiCode, /CopilotProviderOption/, 'api.ts should export provider option type')

// ============================================================
// Section 2: postCopilotMessage function
// ============================================================
assert.match(apiCode, /export async function postCopilotMessage[\s\S]*?workspaceId[\s\S]*?message/, 'postCopilotMessage should take workspaceId and message')
assert.match(apiCode, /postCopilotMessage[\s\S]*?provider\?: CopilotProviderOption/, 'postCopilotMessage should accept provider override')
assert.match(apiCode, /postCopilotMessage[\s\S]*?buildInventoryQuery/, 'postCopilotMessage should use inventory query options')
assert.match(apiCode, /currentView = 'cost-insights'/, 'postCopilotMessage should default current view context label')
assert.match(apiCode, /current_view: currentView/, 'postCopilotMessage should send dynamic current view context label')
assert.match(apiCode, /currentLanguage\?: 'en' \| 'ko'/, 'postCopilotMessage should accept current UI language')
assert.match(apiCode, /current_language: currentLanguage/, 'postCopilotMessage should send current UI language')

// ============================================================
// Section 3: CostPage copilot usage
// ============================================================
assert.match(costPageCode, /postCopilotMessage/, 'CostPage should import postCopilotMessage')
assert.match(costPageCode, /CopilotResponse/, 'CostPage should import CopilotResponse type')
assert.match(costPageCode, /copilotResponse.*useState.*CopilotResponse|useState.*CopilotResponse.*copilotResponse/, 'CostPage should have copilotResponse state typed as CopilotResponse')
assert.match(costPageCode, /postCopilotMessage\(workspaceId/, 'CostPage should call postCopilotMessage with workspaceId')
assert.match(costPageCode, /const \{ locale, t \} = useI18n\(\)/, 'CostPage should read current locale for copilot')
assert.match(costPageCode, /'cost-insights', locale/, 'CostPage should pass current locale to copilot')
assert.match(costPageCode, /askCopilot/, 'CostPage should have askCopilot handler')
assert.match(costPageCode, /copilotPrompt.*useState|useState.*copilotPrompt/, 'CostPage should have copilotPrompt state')
assert.match(costPageCode, /copilotProvider.*useState|useState.*copilotProvider/, 'CostPage should have copilotProvider state')
assert.match(costPageCode, /COPILOT_PROVIDER_STORAGE_KEY/, 'CostPage should persist the selected copilot provider for productized personal use')
assert.match(costPageCode, /localStorage\.setItem\(COPILOT_PROVIDER_STORAGE_KEY/, 'CostPage should write selected copilot provider to localStorage')
assert.match(costPageCode, /result\.default_provider/, 'CostPage should honor backend default_provider when no persisted provider exists')
assert.match(costPageCode, /normalizeCopilotProvider/, 'CostPage should sanitize provider values before using them')
assert.match(costPageCode, /copilot\.provider\.ollama/, 'CostPage should expose Ollama provider selector via i18n key')
assert.match(costPageCode, /copilot\.provider\.openrouter/, 'CostPage should expose OpenRouter provider selector via i18n key')
assert.match(costPageCode, /copilot\.provider\.ruleBased/, 'CostPage should expose rule-based fallback selector via i18n key')
assert.match(dictCode, /'copilot\.provider\.ollama': 'Ollama \/ Ollama Cloud'/, 'i18n dict should include Ollama provider selector copy')
assert.match(dictCode, /'copilot\.provider\.openrouter': 'OpenRouter'/, 'i18n dict should include OpenRouter provider selector copy')
assert.match(dictCode, /'copilot\.provider\.ruleBased': 'Rule-based fallback'/, 'i18n dict should include rule-based fallback selector copy')
assert.match(costPageCode, /copilot\.readOnly/, 'CostPage should show read-only badge/copy via i18n key')

// ============================================================
// Section 4: API contract doc — chat endpoint
// ============================================================
assert.match(
  apiContractDoc,
  /chat|copilot/i,
  'API contract doc should mention chat/copilot endpoint',
)
assert.match(apiContractDoc, /\/copilot\/providers/, 'API contract doc should mention provider status endpoint')
assert.match(apiContractDoc, /\/copilot\/chat/, 'API contract doc should mention provider-aware chat endpoint')
assert.match(apiContractDoc, /API key\/token.*return|key\/token.*return|API key\/token.*반환|key\/token.*반환/i, 'API contract doc should state provider status does not return secrets')

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

// ============================================================
// Section 8: provider health smoke endpoint (backend)
// ============================================================
const copilotServicesCode = readFileSync(path.join(repoRoot, 'backend/app/services/copilot.py'), 'utf8')
const copilotRoutesCode = readFileSync(path.join(repoRoot, 'backend/app/api/routes/copilot.py'), 'utf8')

assert.match(copilotServicesCode, /probe_provider_health/, 'copilot services should export probe_provider_health')
assert.match(copilotServicesCode, /current_language/, 'copilot service should preserve current language in context')
assert.match(copilotServicesCode, /Respond in Korean/, 'copilot LLM prompt should instruct Korean responses when UI locale is Korean')
assert.match(copilotRoutesCode, /current_language=str\(payload.get\("current_language"\)/, 'copilot route should forward current_language into context')
assert.match(copilotServicesCode, /_probe_ollama_connectivity/, 'copilot services should have ollama connectivity probe')
assert.match(copilotServicesCode, /_probe_openrouter_connectivity/, 'copilot services should have openrouter connectivity probe')
assert.match(copilotRoutesCode, /health_smoke/, 'copilot route should accept health_smoke query param')
assert.match(copilotRoutesCode, /provider_health/, 'copilot route should attach provider_health when health_smoke=true')
assert.match(costPageCode, /parseCopilotAnswerSections/, 'CostPage should have section parser for copilot answers')
assert.match(costPageCode, /\[A-Za-z가-힣\]/, 'CostPage section parser should recognize Korean heading labels')
assert.match(costPageCode, /cost-copilot-section-heading/, 'CostPage should render section headings')
assert.match(costPageCode, /copilot\.suggestedChecks/, 'CostPage should label suggestions via i18n key')
assert.match(costPageCode, /cost-copilot-section/, 'CostPage should split answer into cost-copilot-section blocks')
assert.match(copilotServicesCode, /current_language = str\(context\.get\("current_language"\)/, 'provider fallback notice should inspect current language')
assert.match(copilotServicesCode, /읽기 전용 규칙 기반 폴백/, 'provider fallback notice should include Korean copy for ko UI sessions')

console.log('✅ copilot_api_semantics_smoke.mts: section-formatting + provider-health smoke passed')
