/**
 * Browserless FE semantics smoke — backend API routes structure validation.
 * Validates that all expected route files exist and export FastAPI routers.
 * Run: node --experimental-strip-types scripts/backend_api_routes_semantics_smoke.mts
 */

import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..')
const packageCode = readFileSync(path.join(repoRoot, 'frontend/package.json'), 'utf8')

// ============================================================
// Section 0: Smoke-chain wiring
// ============================================================
assert.match(packageCode, /backend_api_routes_semantics_smoke\.mts/, 'frontend smoke:semantics should include backend API routes smoke')

// ============================================================
// Section 1: Route files existence
// ============================================================
const routeFiles = [
  'backend/app/api/routes/topology.py',
  'backend/app/api/routes/cost.py',
  'backend/app/api/routes/copilot.py',
  'backend/app/api/routes/snapshots.py',
  'backend/app/api/routes/simulations.py',
  'backend/app/api/routes/exports.py',
  'backend/app/api/routes/path_analysis.py',
  'backend/app/api/routes/auth.py',
]

for (const routeFile of routeFiles) {
  const fullPath = path.join(repoRoot, routeFile)
  try {
    statSync(fullPath)
  } catch {
    assert.fail(`${routeFile} should exist`)
  }
}

// ============================================================
// Section 2: Each route file should define router with APIRouter
// ============================================================
for (const routeFile of routeFiles) {
  const code = readFileSync(path.join(repoRoot, routeFile), 'utf8')
  assert.match(code, /APIRouter/, `${routeFile} should import APIRouter`)
  assert.match(code, /router\s*=\s*APIRouter|router\s*=\s*APIRouter\(/, `${routeFile} should define router`)
}

// ============================================================
// Section 3: app.py should import and include all routers
// ============================================================
const appCode = readFileSync(path.join(repoRoot, 'backend/app/main.py'), 'utf8')
const routerImports = ['topology', 'cost', 'copilot', 'snapshots', 'simulations', 'exports', 'path_analysis', 'auth']
for (const route of routerImports) {
  assert.match(appCode, new RegExp(`\\b${route}\\b`), `app.py should reference ${route} routes`)
}

// ============================================================
// Section 4: simulation cleanup route should stay wired
// ============================================================
const simulationsCode = readFileSync(path.join(repoRoot, 'backend/app/api/routes/simulations.py'), 'utf8')
assert.match(simulationsCode, /@router\.delete\("\/\{simulation_id\}"/, 'simulations route should expose DELETE cleanup endpoint')
assert.match(simulationsCode, /SimulationDeleteResponse/, 'simulations DELETE endpoint should return explicit delete response')
assert.match(simulationsCode, /service\.delete_simulation/, 'simulations DELETE endpoint should call service cleanup')

// ============================================================
// Section 5: health endpoint should be available through root and API prefix
// ============================================================
assert.match(appCode, /@app\.get\("\/healthz"\)/, 'app.py should expose root healthz endpoint')
assert.match(appCode, /@app\.get\(f"\{settings\.api_v1_prefix\}\/healthz"\)/, 'app.py should expose API-prefixed healthz endpoint for frontend fetchJson')

console.log('✅ backend_api_routes_semantics_smoke.mts: all assertions passed')
