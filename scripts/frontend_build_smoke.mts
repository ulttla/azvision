/**
 * Browserless FE build smoke — verifies frontend builds cleanly.
 * Runs tsc -b && vite build and validates exit code + dist output.
 * Run: node --experimental-strip-types scripts/frontend_build_smoke.mts
 */

import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..')
const frontendDir = path.join(repoRoot, 'frontend')
const distDir = path.join(frontendDir, 'dist')

// ============================================================
// Section 0: Run the build
// ============================================================
try {
  execSync('npm run build', { cwd: frontendDir, stdio: 'pipe' })
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  assert.fail(`Frontend build failed: ${message}`)
}

// ============================================================
// Section 1: dist directory should exist after build
// ============================================================
assert.ok(existsSync(distDir), 'dist directory should exist')

// ============================================================
// Section 2: dist should contain expected files
// ============================================================
const distFiles = readdirSync(distDir)
assert.ok(distFiles.includes('index.html'), 'dist should contain index.html')

// ============================================================
// Section 3: dist/assets should exist and contain JS/CSS
// ============================================================
const assetsDir = path.join(distDir, 'assets')
assert.ok(existsSync(assetsDir), 'dist/assets should exist')

const assetFiles = readdirSync(assetsDir)
const jsFiles = assetFiles.filter((f) => f.endsWith('.js'))
const cssFiles = assetFiles.filter((f) => f.endsWith('.css'))

assert.ok(jsFiles.length > 0, 'dist/assets should contain JS files')
assert.ok(cssFiles.length > 0, 'dist/assets should contain CSS files')

// ============================================================
// Section 4: Verify key page bundles exist
// ============================================================
const pageBundles = ['TopologyPage', 'CostPage', 'SimulationPage', 'ArchitecturePage']
for (const page of pageBundles) {
  const found = assetFiles.some((f) => f.includes(page))
  assert.ok(found, `dist/assets should contain ${page} bundle`)
}

// ============================================================
// Section 5: Verify vendor bundles exist
// ============================================================
const vendorBundles = ['react-vendor', 'cytoscape-vendor', 'dagre-vendor']
for (const vendor of vendorBundles) {
  const found = assetFiles.some((f) => f.includes(vendor))
  assert.ok(found, `dist/assets should contain ${vendor} bundle`)
}

// ============================================================
// Section 6: Verify non-empty files
// ============================================================
for (const file of assetFiles) {
  const filePath = path.join(assetsDir, file)
  const stats = statSync(filePath)
  assert.ok(stats.size > 0, `${file} should be non-empty`)
}

console.log('✅ frontend_build_smoke.mts: all assertions passed')
