/**
 * Static smoke for the AzVision React ErrorBoundary wiring.
 *
 * Run: node --experimental-strip-types scripts/error_boundary_semantics_smoke.mts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const boundaryPath = join(root, 'frontend/src/components/ErrorBoundary.tsx')
const appPath = join(root, 'frontend/src/App.tsx')
const packagePath = join(root, 'frontend/package.json')

const boundary = readFileSync(boundaryPath, 'utf8')
const app = readFileSync(appPath, 'utf8')
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8')) as {
  scripts?: Record<string, string>
}

assert.match(boundary, /export class ErrorBoundary extends Component/, 'ErrorBoundary class is exported')
assert.match(boundary, /getDerivedStateFromError/, 'ErrorBoundary derives fallback state from render errors')
assert.match(boundary, /componentDidCatch/, 'ErrorBoundary records caught render errors')
assert.match(boundary, /data-testid="error-boundary-fallback"/, 'fallback has stable test id')
assert.match(boundary, /Reload page/, 'fallback exposes a reload recovery action')

assert.match(app, /import \{ ErrorBoundary \} from '\.\/components\/ErrorBoundary'/, 'App imports ErrorBoundary')
assert.match(app, /<ErrorBoundary>\s*<Suspense/s, 'ErrorBoundary wraps Suspense and lazy pages')
assert.match(app, /<\/Suspense>\s*<\/ErrorBoundary>/s, 'ErrorBoundary closes after Suspense')

const smokeCommand = packageJson.scripts?.['smoke:semantics'] ?? ''
assert.match(smokeCommand, /error_boundary_semantics_smoke\.mts/, 'frontend smoke:semantics runs error boundary smoke')

console.log('✅ error_boundary_semantics_smoke.mts: all assertions passed')
