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

assert.match(appCode, /import \{ getAuthConfigCheck, getBackendHealth \} from '\.\/lib\/api'/, 'App shell should import backend health and auth config-check for global connectivity')
assert.match(appCode, /getAuthConfigCheck/, 'App shell should surface auth readiness globally')
assert.match(appCode, /type BackendConnectivityStatus = 'checking' \| 'online' \| 'offline'/, 'Connectivity status union should stay small')
assert.match(appCode, /type AuthConnectivityStatus = 'checking' \| 'ready' \| 'not-configured'/, 'Auth connectivity status union should be defined')
assert.match(appCode, /window\.setInterval\(refreshBackendConnectivity, 30000\)/, 'Backend connectivity should refresh on a bounded interval')
assert.match(appCode, /window\.setInterval\(refreshAuthConnectivity, 30000\)/, 'Auth connectivity should refresh on a bounded interval')
assert.match(appCode, /data-testid="app-connectivity-row"/, 'Connectivity row should be test-addressable')
assert.match(appCode, /Auth \{authConnectivity === 'ready'/, 'Connectivity row should render auth status copy')
assert.match(appCode, /workspace-connectivity-group/, 'Workspace connectivity group should be present')
assert.match(appCode, /workspace-connectivity-sep/, 'Workspace connectivity separator should be present')

assert.match(stylesCode, /\.workspace-connectivity-row/, 'Connectivity row CSS should exist')
assert.match(stylesCode, /\.connectivity-dot\.online/, 'Online connectivity dot CSS should exist')
assert.match(stylesCode, /\.connectivity-dot\.checking/, 'Checking connectivity dot CSS should exist')
assert.match(stylesCode, /\.connectivity-dot\.offline/, 'Offline connectivity dot CSS should exist')

console.log('✅ app_shell_semantics_smoke.mts: all assertions passed')
