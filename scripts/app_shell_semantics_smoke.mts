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

assert.match(appCode, /import \{ getAuthConfigCheck, getBackendHealth, getTopologyFreshness, getWorkspaces \} from '\.\/lib\/api'/, 'App shell should import backend health, auth config-check, topology freshness, and workspaces for global connectivity')
assert.match(appCode, /getAuthConfigCheck/, 'App shell should surface auth readiness globally')
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
assert.match(appCode, /Backend \{backendConnectivity === 'online'/, 'Connectivity row should render backend status copy')
assert.match(appCode, /Auth \{authConnectivity === 'ready'/, 'Connectivity row should render auth status copy')
assert.match(appCode, /Topology \{topologyFreshness === 'fresh'/, 'Connectivity row should render topology freshness copy')
assert.match(appCode, /workspace-connectivity-group/, 'Workspace connectivity group should be present')
assert.match(appCode, /workspace-connectivity-sep/, 'Workspace connectivity separator should be present')
assert.match(appCode, /handleRefreshConnectivity/, 'App shell should expose a manual connectivity refresh handler')
assert.match(appCode, /connectivityRefreshing/, 'Manual connectivity refresh should guard duplicate clicks')
assert.match(appCode, /disabled=\{connectivityRefreshing\}/, 'Manual connectivity refresh button should disable while refreshing')
assert.match(appCode, /aria-busy=\{connectivityRefreshing\}/, 'Manual connectivity refresh button should expose busy state')
assert.match(appCode, /data-testid="app-connectivity-refresh"/, 'Connectivity row should render a test-addressable manual refresh button')
assert.match(appCode, /Promise\.allSettled/, 'Manual refresh should update backend, auth, and topology signals together')

assert.match(stylesCode, /\.workspace-connectivity-row/, 'Connectivity row CSS should exist')
assert.match(stylesCode, /\.connectivity-dot\.online/, 'Online connectivity dot CSS should exist')
assert.match(stylesCode, /\.connectivity-dot\.checking/, 'Checking connectivity dot CSS should exist')
assert.match(stylesCode, /\.connectivity-dot\.offline/, 'Offline connectivity dot CSS should exist')
assert.match(stylesCode, /\.workspace-connectivity-refresh/, 'Manual connectivity refresh button CSS should exist')
assert.match(stylesCode, /\.workspace-connectivity-refresh:disabled/, 'Manual connectivity refresh disabled CSS should exist')

console.log('✅ app_shell_semantics_smoke.mts: all assertions passed')
