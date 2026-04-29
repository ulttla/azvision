/**
 * Browserless FE semantics smoke — backend database DDL validation.
 * Validates that db/models.py has expected DDL statements and migration logic.
 * Run: node --experimental-strip-types scripts/backend_db_models_semantics_smoke.mts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..')

// ============================================================
// Section 1: db/models.py should exist and have DDL
// ============================================================
const modelCode = readFileSync(path.join(repoRoot, 'backend/app/db/models.py'), 'utf8')

assert.match(modelCode, /CREATE TABLE/, 'db/models.py should have CREATE TABLE statements')
assert.match(modelCode, /DDL_STATEMENTS\s*=\s*\[/, 'db/models.py should define DDL_STATEMENTS')

// ============================================================
// Section 2: Expected tables
// ============================================================
const expectedTables = [
  'workspaces',
  'credential_profiles',
  'scan_runs',
  'subscriptions',
  'resource_groups',
  'resource_nodes',
  'relationship_edges',
  'manual_nodes',
  'manual_edges',
  'snapshots',
  'simulations',
]

for (const table of expectedTables) {
  assert.match(modelCode, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`), `DDL should create ${table} table`)
}

// ============================================================
// Section 3: Expected indexes
// ============================================================
assert.match(modelCode, /CREATE INDEX/, 'DDL should define indexes')
assert.match(modelCode, /idx_snapshots_workspace_updated_at/, 'Should have snapshots index')
assert.match(modelCode, /idx_simulations_workspace_created_at/, 'Should have simulations index')

// ============================================================
// Section 4: Migration logic
// ============================================================
assert.match(modelCode, /_ensure_column/, 'Should have _ensure_column migration helper')
assert.match(modelCode, /PRAGMA table_info/, 'Migration should use PRAGMA table_info')
assert.match(modelCode, /ALTER TABLE.*ADD COLUMN/, 'Migration should use ALTER TABLE ADD COLUMN')
assert.match(modelCode, /create_db_and_tables/, 'Should have create_db_and_tables function')

// ============================================================
// Section 5: Key columns in snapshots table
// ============================================================
const snapshotDDL = modelCode.slice(modelCode.indexOf('CREATE TABLE IF NOT EXISTS snapshots'))
assert.ok(snapshotDDL.includes('workspace_id'), 'snapshots should have workspace_id')
assert.ok(snapshotDDL.includes('name'), 'snapshots should have name')
assert.ok(snapshotDDL.includes('compare_refs_json'), 'snapshots should have compare_refs_json')
assert.ok(snapshotDDL.includes('visible_node_count'), 'snapshots should have visible_node_count')
assert.ok(snapshotDDL.includes('thumbnail_data_url'), 'snapshots should have thumbnail_data_url')

// ============================================================
// Section 6: Key columns in simulations table
// ============================================================
const simDDL = modelCode.slice(modelCode.indexOf('CREATE TABLE IF NOT EXISTS simulations'))
assert.ok(simDDL.includes('workspace_id'), 'simulations should have workspace_id')
assert.ok(simDDL.includes('workload_name'), 'simulations should have workload_name')
assert.ok(simDDL.includes('recommended_resources_json'), 'simulations should have recommended_resources_json')

// ============================================================
// Section 7: Import chains
// ============================================================
const repoSnapshotsCode = readFileSync(path.join(repoRoot, 'backend/app/repositories/snapshots.py'), 'utf8')
assert.match(repoSnapshotsCode, /from.*models.*import|import.*models/, 'repositories/snapshots.py should import models')

const repoSimulationsCode = readFileSync(path.join(repoRoot, 'backend/app/repositories/simulations.py'), 'utf8')
assert.match(repoSimulationsCode, /from.*models.*import|import.*models/, 'repositories/simulations.py should import models')

console.log('✅ backend_db_models_semantics_smoke.mts: all assertions passed')
