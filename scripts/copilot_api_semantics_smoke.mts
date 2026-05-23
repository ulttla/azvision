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
const copilotPanelCode = readFileSync(path.join(repoRoot, 'frontend/src/components/CopilotPanel.tsx'), 'utf8')
const copilotParserCode = readFileSync(path.join(repoRoot, 'frontend/src/components/copilotAnswerParser.ts'), 'utf8')
const copilotUiCode = `${costPageCode}
${copilotPanelCode}`
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
assert.match(apiCode, /viewContext\?: CopilotViewContext/, 'postCopilotMessage should accept view-specific copilot context')
assert.match(apiCode, /view_context: viewContext/, 'postCopilotMessage should send view-specific copilot context')

// ============================================================
// Section 3: shared CopilotPanel usage
// ============================================================
assert.match(costPageCode, /CopilotPanel/, 'CostPage should render the shared CopilotPanel')
assert.match(costPageCode, /const costCopilotViewContext = useMemo<CopilotViewContext>/, 'CostPage should build cost-specific copilot view context')
assert.match(costPageCode, /topRecommendations: sortedRecommendations\.slice\(0, 8\)/, 'CostPage copilot context should summarize top recommendations')
assert.match(costPageCode, /topResources: topResources\.map/, 'CostPage copilot context should summarize top resources')
assert.match(costPageCode, /hasSubscriptionFilter: Boolean\(costQueryOptions\.subscriptionId\)/, 'CostPage copilot context should avoid sending raw subscription filter values')
assert.match(costPageCode, /hasResourceGroupFilter: Boolean\(costQueryOptions\.resourceGroupName\)/, 'CostPage copilot context should avoid sending raw resource-group filter values')
assert.doesNotMatch(costPageCode, /subscriptionId: costQueryOptions\.subscriptionId/, 'CostPage copilot context should not include raw subscription IDs')
assert.match(costPageCode, /viewContext=\{costCopilotViewContext\}/, 'CostPage should pass cost-specific view context to CopilotPanel')
assert.match(costPageCode, /currentView="cost-insights"/, 'CostPage should pass cost-insights current view to CopilotPanel')
assert.match(copilotUiCode, /postCopilotMessage/, 'Shared copilot UI should import postCopilotMessage')
assert.match(copilotUiCode, /CopilotResponse/, 'Shared copilot UI should import CopilotResponse type')
assert.match(copilotUiCode, /copilotResponse.*useState.*CopilotResponse|useState.*CopilotResponse.*copilotResponse/, 'Shared copilot UI should have copilotResponse state typed as CopilotResponse')
assert.match(copilotUiCode, /postCopilotMessage\(workspaceId/, 'Shared copilot UI should call postCopilotMessage with workspaceId')
assert.match(copilotUiCode, /const \{ locale, t \} = useI18n\(\)/, 'Shared copilot UI should read current locale for copilot')
assert.match(copilotUiCode, /currentView, locale, viewContext/, 'Shared copilot UI should pass current locale and view context to copilot')
assert.match(copilotUiCode, /askCopilot/, 'Shared copilot UI should have askCopilot handler')
assert.match(copilotUiCode, /copilotPrompt.*useState|useState.*copilotPrompt/, 'Shared copilot UI should have copilotPrompt state')
assert.match(copilotUiCode, /copilotProvider.*useState|useState.*copilotProvider/, 'Shared copilot UI should have copilotProvider state')
assert.match(copilotUiCode, /COPILOT_PROVIDER_STORAGE_KEY/, 'Shared copilot UI should persist the selected copilot provider for productized personal use')
assert.match(copilotUiCode, /localStorage\.setItem\(COPILOT_PROVIDER_STORAGE_KEY/, 'Shared copilot UI should write selected copilot provider to localStorage')
assert.match(copilotUiCode, /getQuickPromptKeys/, 'Shared copilot UI should expose view-specific quick prompts')
assert.match(copilotUiCode, /function getDefaultPromptKey\(currentView: string\): CopilotQuickPromptKey/, 'Shared copilot UI should derive a per-view default prompt')
assert.match(copilotUiCode, /const defaultPrompt = t\(getDefaultPromptKey\(currentView\)\)/, 'Shared copilot UI should initialize from the per-view default prompt')
assert.match(copilotUiCode, /lastDefaultPromptRef/, 'Shared copilot UI should preserve user-edited prompts while refreshing default prompts')
assert.match(copilotUiCode, /sections\.length === 0 && !hasSuggestions/, 'Shared copilot UI should render a safe empty-answer fallback')
assert.match(dictCode, /'copilot\.emptyAnswer'/, 'i18n dict should include empty-answer fallback copy')
assert.match(copilotUiCode, /copilot\.quick\.architectureRisks/, 'Shared copilot UI should include architecture quick prompt')
assert.match(copilotUiCode, /copilot\.quick\.simulationFit/, 'Shared copilot UI should include simulation quick prompt')
assert.match(copilotUiCode, /copilot\.quick\.topologyRisks/, 'Shared copilot UI should include topology quick prompt')
assert.match(dictCode, /'copilot\.quickPrompts'/, 'i18n dict should label quick prompts')
assert.match(copilotUiCode, /result\.default_provider/, 'Shared copilot UI should honor backend default_provider when no persisted provider exists')
assert.match(copilotUiCode, /normalizeCopilotProvider/, 'Shared copilot UI should sanitize provider values before using them')
assert.match(copilotUiCode, /copilot\.provider\.ollama/, 'Shared copilot UI should expose Ollama provider selector via i18n key')
assert.match(copilotUiCode, /copilot\.provider\.openrouter/, 'Shared copilot UI should expose OpenRouter provider selector via i18n key')
assert.match(copilotUiCode, /copilot\.provider\.ruleBased/, 'Shared copilot UI should expose rule-based fallback selector via i18n key')
assert.match(dictCode, /'copilot\.provider\.ollama': 'Ollama \/ Ollama Cloud'/, 'i18n dict should include Ollama provider selector copy')
assert.match(dictCode, /'copilot\.provider\.openrouter': 'OpenRouter'/, 'i18n dict should include OpenRouter provider selector copy')
assert.match(dictCode, /'copilot\.provider\.ruleBased': 'Rule-based fallback'/, 'i18n dict should include rule-based fallback selector copy')
assert.match(copilotUiCode, /copilot\.readOnly/, 'Shared copilot UI should show read-only badge/copy via i18n key')

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
assert.match(copilotUiCode, /copilotLoading/, 'CostPage should have copilotLoading state')
assert.match(copilotUiCode, /if \(copilotLoading \|\| !copilotPrompt\.trim\(\) \|\| !workspaceId\.trim\(\)\)/, 'Shared copilot UI should prevent duplicate asks while a request is in flight')
assert.match(copilotUiCode, /if \(!copilotLoading\) \{[\s\S]*?void askCopilot\(\)/, 'Shared copilot UI should prevent duplicate keyboard submits while a request is in flight')
assert.match(copilotUiCode, /setCopilotResponse/, 'CostPage should set copilotResponse')

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
assert.match(copilotServicesCode, /view_metadata/, 'copilot service should include view-specific metadata in context')
assert.match(copilotServicesCode, /view_context/, 'copilot service should include redacted view-specific UI context')
assert.match(copilotServicesCode, /Respond in Korean/, 'copilot LLM prompt should instruct Korean responses when UI locale is Korean')
assert.match(copilotRoutesCode, /current_language=str\(payload.get\("current_language"\)/, 'copilot route should forward current_language into context')
assert.match(copilotRoutesCode, /view_context=view_context/, 'copilot route should forward view_context into context')
assert.match(copilotServicesCode, /_probe_ollama_connectivity/, 'copilot services should have ollama connectivity probe')
assert.match(copilotServicesCode, /_probe_openrouter_connectivity/, 'copilot services should have openrouter connectivity probe')
assert.match(copilotServicesCode, /_stringify_llm_content/, 'copilot services should normalize provider content parts through a shared helper')
assert.match(copilotServicesCode, /isinstance\(content, list\)/, 'copilot content normalization should accept list-based text parts')
assert.match(copilotServicesCode, /isinstance\(item\.get\("text"\), str\)/, 'copilot content normalization should extract text-only parts from provider content arrays')
assert.match(copilotServicesCode, /openrouter choice did not include content/, 'copilot provider parsing should safely fall back when no usable OpenRouter text content exists')
assert.match(copilotRoutesCode, /health_smoke/, 'copilot route should accept health_smoke query param')
assert.match(copilotRoutesCode, /provider_health/, 'copilot route should attach provider_health when health_smoke=true')
assert.match(copilotPanelCode, /parseCopilotAnswerSections/, 'Shared copilot UI should use section parser for copilot answers')
assert.match(copilotParserCode, /export function parseCopilotAnswerSections/, 'Copilot answer parser should be exported for focused smoke coverage')
assert.match(copilotParserCode, /\[A-Za-z가-힣\]/, 'Copilot section parser should recognize Korean heading labels')
assert.ok(copilotParserCode.includes(String.raw`regex: /^\*\*(.+?):\*\*\s*(.*)$/`), 'Bold inline heading parser should require a colon inside the bold marker')
assert.ok(copilotParserCode.includes(String.raw`regex: /^\*\*(.+?)\*\*\s*:\s*(.*)$/`), 'Bold inline heading parser should allow a colon after the bold marker')
assert.ok(!copilotParserCode.includes(String.raw`(?::)?\*\*\s*:?`), 'Bold parser should not treat plain bold emphasis as a heading')
assert.match(copilotUiCode, /cost-copilot-section-heading/, 'CostPage should render section headings')
assert.match(copilotUiCode, /copilot\.suggestedChecks/, 'CostPage should label suggestions via i18n key')
assert.match(copilotUiCode, /cost-copilot-section/, 'CostPage should split answer into cost-copilot-section blocks')
assert.match(copilotServicesCode, /current_language = str\(context\.get\("current_language"\)/, 'provider fallback notice should inspect current language')
assert.match(copilotServicesCode, /읽기 전용 규칙 기반 폴백/, 'provider fallback notice should include Korean copy for ko UI sessions')

// ============================================================
// Section 9: CopilotPanel inline error recovery
// ============================================================
const copilotPanelReread = readFileSync(path.join(repoRoot, 'frontend/src/components/CopilotPanel.tsx'), 'utf8')
assert.match(copilotPanelReread, /copilotError/, 'CopilotPanel should have copilotError state')
assert.match(copilotPanelReread, /setCopilotError\(null\)/, 'CopilotPanel should clear copilotError before a new request')
assert.match(copilotPanelReread, /setCopilotError\(message\)/, 'CopilotPanel should set copilotError on request failure')
assert.match(copilotPanelReread, /copilot\.error/, 'CopilotPanel should use copilot.error i18n key for error fallback label')
assert.match(copilotPanelReread, /copilot\.retry/, 'CopilotPanel should use copilot.retry i18n key for retry button')
assert.match(copilotPanelReread, /copilotError \?/, 'CopilotPanel should render inline error state when copilotError is set')
assert.match(copilotPanelReread, /role="alert" aria-live="polite"/, 'CopilotPanel inline error should be announced accessibly')
assert.match(copilotPanelReread, /onClick=\{askCopilot\} disabled=\{copilotLoading \|\| !workspaceId\.trim\(\)\}/, 'CopilotPanel retry button should reuse askCopilot and stay disabled while unavailable')
assert.ok(copilotPanelReread.includes('toolbar-button'), 'CopilotPanel retry button should trigger askCopilot')
assert.match(dictCode, /'copilot\.error'/, 'i18n dict should include copilot error key (en)')
assert.match(dictCode, /'copilot\.retry'/, 'i18n dict should include copilot retry key (en)')
// Korean i18n should also include the new keys
const koSection = dictCode.slice(dictCode.indexOf("'copilot.heading': '읽기"), dictCode.indexOf("'copilot.provider.ruleBased': '규칙"))
assert.match(koSection, /'copilot\.error'/, 'i18n dict should include copilot error key (ko)')
assert.match(koSection, /'copilot\.retry'/, 'i18n dict should include copilot retry key (ko)')

console.log('✅ copilot_api_semantics_smoke.mts: error-recovery smoke passed')

console.log('✅ copilot_api_semantics_smoke.mts: section-formatting + provider-health smoke passed')
