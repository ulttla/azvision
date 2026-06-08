/**
 * App shell semantics smoke — keeps the shared shell connectivity signal small.
 * Run: node --experimental-strip-types scripts/app_shell_semantics_smoke.mts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..')
const appCode = readFileSync(path.join(repoRoot, 'frontend/src/App.tsx'), 'utf8')
const stylesCode = readFileSync(path.join(repoRoot, 'frontend/src/styles.css'), 'utf8')
const packageJson = readFileSync(path.join(repoRoot, 'frontend/package.json'), 'utf8')

assert.match(appCode, /import \{ getAuthConfigCheck, getBackendHealth, getBackendReadiness, getTopologyFreshness, getWorkspaces \} from '\.\/lib\/api'/, 'App shell should import backend liveness, readiness, auth config-check, topology freshness, and workspaces for global connectivity')
assert.match(appCode, /getAuthConfigCheck/, 'App shell should surface auth readiness globally')
assert.match(appCode, /getBackendReadiness/, 'App shell should require backend readiness in the global backend signal')
assert.match(appCode, /getTopologyFreshness/, 'App shell should surface topology freshness globally')
assert.match(appCode, /type BackendConnectivityStatus = 'checking' \| 'online' \| 'offline'/, 'Connectivity status union should stay small')
assert.match(appCode, /type AuthConnectivityStatus = 'checking' \| 'ready' \| 'not-configured'/, 'Auth connectivity status union should be defined')
assert.match(appCode, /type TopologyFreshnessStatus = 'checking' \| 'fresh' \| 'stale' \| 'empty'/, 'Topology freshness status union should be defined')
assert.match(appCode, /window\.setInterval\(refreshBackendConnectivity, 30000\)/, 'Backend connectivity should refresh on a bounded interval')
assert.match(appCode, /window\.setInterval\(refreshAuthConnectivity, 30000\)/, 'Auth connectivity should refresh on a bounded interval')
assert.match(appCode, /window\.setInterval\(refreshTopologyFreshness, 60000\)/, 'Topology freshness should refresh on a bounded interval')
assert.match(appCode, /data-testid="app-connectivity-row"/, 'Connectivity row should be test-addressable')
assert.match(appCode, /aria-live="polite"/, 'Connectivity row should announce status changes politely')
assert.match(appCode, /role="status"/, 'Manual refresh result message should expose status semantics')
assert.match(appCode, /backendLabels\[backendConnectivity\]/, 'Connectivity row should render backend status via i18n')
assert.match(appCode, /authLabels\[authConnectivity\]/, 'Connectivity row should render auth status via i18n')
assert.match(appCode, /freshnessLabels\[topologyFreshness\]/, 'Connectivity row should render topology freshness via i18n')
assert.match(appCode, /workspace-connectivity-group/, 'Workspace connectivity group should be present')
assert.match(appCode, /workspace-connectivity-sep/, 'Workspace connectivity separator should be present')
assert.match(appCode, /handleRefreshConnectivity/, 'App shell should expose a manual connectivity refresh handler')
assert.match(appCode, /connectivityRefreshing/, 'Manual connectivity refresh should guard duplicate clicks')
assert.match(appCode, /disabled=\{connectivityRefreshing\}/, 'Manual connectivity refresh button should disable while refreshing')
assert.match(appCode, /aria-busy=\{connectivityRefreshing\}/, 'Manual connectivity refresh button should expose busy state')
assert.match(appCode, /data-testid="app-connectivity-refresh"/, 'Connectivity row should render a test-addressable manual refresh button')
assert.match(appCode, /data-testid="public-beta-onboarding"/, 'App shell should expose a test-addressable public beta onboarding card')
assert.match(appCode, /t\('publicBeta\.title'\)/, 'Public beta onboarding card should render localized title copy')
assert.match(appCode, /setViewMode\('topology'\)/, 'Public beta onboarding CTA should send first-run users to the topology demo path')
assert.match(appCode, /t\('publicBeta\.cta\.status'\)/, 'Public beta onboarding should expose a readiness refresh CTA')
assert.match(appCode, /Promise\.allSettled/, 'Manual refresh should update backend, auth, and topology signals together')
assert.match(appCode, /backendReadinessResult\.value\.checks\.database/, 'Manual backend signal should require database readiness')
assert.match(appCode, /Promise\.all\(\[getBackendHealth\(\), getBackendReadiness\(\)\]\)/, 'Periodic backend signal should require liveness and readiness together')
assert.match(appCode, /workspaces\.length === 0\)[\s\S]*?setTopologyFreshness\('empty'\)[\s\S]*?setTopologyNodeCount\(null\)/, 'Topology freshness polling should clear stale node counts when no workspace is available')
assert.match(packageJson, /app_shell_semantics_smoke\.mts/, 'frontend smoke:semantics should include this app-shell smoke')

assert.match(stylesCode, /\.workspace-connectivity-row/, 'Connectivity row CSS should exist')
assert.match(stylesCode, /\.connectivity-dot\.online/, 'Online connectivity dot CSS should exist')
assert.match(stylesCode, /\.connectivity-dot\.checking/, 'Checking connectivity dot CSS should exist')
assert.match(stylesCode, /\.connectivity-dot\.offline/, 'Offline connectivity dot CSS should exist')
assert.match(stylesCode, /\.workspace-connectivity-refresh/, 'Manual connectivity refresh button CSS should exist')
assert.match(stylesCode, /\.workspace-connectivity-refresh:disabled/, 'Manual connectivity refresh disabled CSS should exist')
assert.match(stylesCode, /\.public-beta-onboarding/, 'Public beta onboarding card CSS should exist')
assert.match(stylesCode, /\.public-beta-actions/, 'Public beta onboarding actions CSS should exist')

console.log('✅ app_shell_semantics_smoke.mts: all assertions passed')
