/**
 * Static/runtime smoke for the lightweight AzVision i18n foundation.
 *
 * Run: node --experimental-strip-types scripts/i18n_semantics_smoke.mts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const repoRoot = path.resolve(import.meta.dirname, '..')
const dictModule = await import(pathToFileURL(path.join(repoRoot, 'frontend/src/i18n/dict.ts')).href)
const dict = dictModule.dict as Record<string, Record<string, string>>
const appCode = readFileSync(path.join(repoRoot, 'frontend/src/App.tsx'), 'utf8')
const contextCode = readFileSync(path.join(repoRoot, 'frontend/src/i18n/context.tsx'), 'utf8')
const mainCode = readFileSync(path.join(repoRoot, 'frontend/src/main.tsx'), 'utf8')
const errorBoundaryCode = readFileSync(path.join(repoRoot, 'frontend/src/components/ErrorBoundary.tsx'), 'utf8')
const costCode = readFileSync(path.join(repoRoot, 'frontend/src/pages/CostPage.tsx'), 'utf8')

assert.deepEqual(
  Object.keys(dict.en).sort(),
  Object.keys(dict.ko).sort(),
  'English and Korean dictionaries should have symmetric key coverage',
)
assert.ok(Object.keys(dict.en).length >= 150, 'i18n dictionary should cover the C1 shell/cost/copilot/topology/error-boundary slice')
assert.ok(Object.keys(dict.en).filter(k => k.startsWith('arch.')).length >= 40, 'i18n dictionary should include C1 architecture.* coverage')
assert.ok(Object.keys(dict.en).filter(k => k.startsWith('sim.')).length >= 20, 'i18n dictionary should include C1 simulation.* coverage')
assert.equal(dict.en['lang.toggle'], 'KO', 'English UI should offer the Korean toggle label')
assert.equal(dict.ko['lang.toggle'], 'EN', 'Korean UI should offer the English toggle label')
assert.equal(dict.ko['common.yes'], '예', 'Korean common yes token should be present')
assert.equal(dict.ko['common.no'], '아니오', 'Korean common no token should be present')

assert.match(contextCode, /const STORAGE_KEY = 'azvision-lang'/, 'i18n provider should use the namespaced localStorage key')
assert.match(contextCode, /localStorage\.getItem\(STORAGE_KEY\)/, 'i18n provider should read persisted locale')
assert.match(contextCode, /localStorage\.setItem\(STORAGE_KEY, next\)/, 'i18n provider should persist explicit locale changes')
assert.match(contextCode, /navigator\.language/, 'i18n provider should use browser language as initial fallback')
assert.match(contextCode, /document\.documentElement\.lang = locale/, 'i18n provider should sync html lang for accessibility')
assert.match(contextCode, /throw new Error\('useI18n must be used within I18nProvider'\)/, 'useI18n should fail loudly outside provider')

assert.match(mainCode, /<I18nProvider>\s*<App \/>\s*<\/I18nProvider>/s, 'App should be wrapped in I18nProvider')
assert.match(appCode, /data-testid="app-lang-toggle"/, 'App shell should expose a stable language toggle test id')
assert.match(appCode, /aria-label=\{t\('aria\.toggleLanguage'\)\}/, 'Language toggle aria label should be localized')
assert.match(appCode, /aria-label=\{t\('aria\.viewMode'\)\}/, 'View mode aria label should be localized')
assert.match(appCode, /t\('common\.nodes'\)/, 'Topology node count suffix should be localized')
assert.match(appCode, /<ErrorBoundary labels=\{\{[\s\S]*?t\('error\.reload'\)/, 'ErrorBoundary should receive localized fallback labels')

assert.match(errorBoundaryCode, /labels\.eyebrow/, 'ErrorBoundary fallback should render localized eyebrow')
assert.match(errorBoundaryCode, /labels\.reload/, 'ErrorBoundary fallback should render localized reload copy')
assert.match(costCode, /t\('common\.yes'\)/, 'Cost/Copilot booleans should use localized yes token')
assert.match(costCode, /t\('common\.no'\)/, 'Cost/Copilot booleans should use localized no token')
assert.match(costCode, /t\('cost\.evidence'\)/, 'Cost recommendation evidence label should be localized')
assert.match(costCode, /t\('cost\.drivers'\)/, 'Cost driver label should be localized')

// C1: topology coverage sanity
const topoPageCode = readFileSync(path.join(repoRoot, 'frontend/src/pages/TopologyPage.tsx'), 'utf8')
assert.match(topoPageCode, /useI18n/, 'TopologyPage should use i18n hook')
assert.match(topoPageCode, /t\('topology\./, 'TopologyPage should reference topology.* i18n keys')
assert.ok(
  Object.keys(dict.en).filter(k => k.startsWith('topology.')).length >= 50,
  'i18n dictionary should include C1 topology.* coverage',
)

console.log('✅ i18n_semantics_smoke.mts: all assertions passed')
