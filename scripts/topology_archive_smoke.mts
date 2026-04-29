/**
 * Browserless topology archive smoke test.
 * Validates the normalize_topology, topology_diff, and repository layer
 * for the snapshot_topology_archives table.
 * Run: node --experimental-strip-types scripts/topology_archive_smoke.mts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..')

// ============================================================
// Section 1: Normalizer module exists and exports expected functions
// ============================================================
const normalizerCode = readFileSync(
  path.join(repoRoot, 'backend/app/services/topology_normalizer.py'),
  'utf8',
)

assert.ok(normalizerCode.length > 0, 'topology_normalizer.py should exist and be non-empty')
assert.match(normalizerCode, /def normalize_topology/, 'should define normalize_topology')
assert.match(normalizerCode, /def topology_diff/, 'should define topology_diff')
assert.match(normalizerCode, /def _strip_ui_state/, 'should define _strip_ui_state')
assert.match(normalizerCode, /hashlib\.sha256/, 'should use SHA-256 for topology hash')
assert.match(normalizerCode, /def _node_key/, 'should define _node_key')
assert.match(normalizerCode, /def _edge_signature/, 'should define _edge_signature')

// ============================================================
// Section 2: Repository module exists and exports expected methods
// ============================================================
const repoCode = readFileSync(
  path.join(repoRoot, 'backend/app/repositories/topology_archive.py'),
  'utf8',
)

assert.ok(repoCode.length > 0, 'topology_archive.py repository should exist')
assert.match(repoCode, /class TopologyArchiveRepository/, 'should define TopologyArchiveRepository')
assert.match(repoCode, /def store/, 'should define store method')
assert.match(repoCode, /def get/, 'should define get method')
assert.match(repoCode, /def delete/, 'should define delete method')
assert.match(repoCode, /def count_by_workspace/, 'should define count_by_workspace method')
assert.match(repoCode, /def total_size_bytes/, 'should define total_size_bytes method')

// ============================================================
// Section 2.5: SQLite health check reports topology archive bloat signals
// ============================================================
const sqliteHealthCode = readFileSync(
  path.join(repoRoot, 'scripts/sqlite_health_check.py'),
  'utf8',
)

assert.match(sqliteHealthCode, /archive_count/, 'SQLite health check should report archive count')
assert.match(sqliteHealthCode, /archive_total_bytes/, 'SQLite health check should report archive total bytes')
assert.match(sqliteHealthCode, /oldest_archive_age_days/, 'SQLite health check should report oldest archive age')
assert.match(sqliteHealthCode, /orphan_archive_count/, 'SQLite health check should report orphan archive count')
assert.match(sqliteHealthCode, /archive_warnings/, 'SQLite health check should report archive threshold warnings')

const sqliteHealthSelftestCode = readFileSync(
  path.join(repoRoot, 'scripts/sqlite_health_check_selftest.py'),
  'utf8',
)
assert.match(sqliteHealthSelftestCode, /orphan_archives_present/, 'SQLite health self-test should cover orphan archive warning')
assert.match(sqliteHealthSelftestCode, /oldest_archive_age_gt_90d/, 'SQLite health self-test should cover archive age warning')

// ============================================================
// Section 3: DDL includes snapshot_topology_archives table
// ============================================================
const modelsCode = readFileSync(
  path.join(repoRoot, 'backend/app/db/models.py'),
  'utf8',
)

assert.match(modelsCode, /snapshot_topology_archives/, 'DDL should include snapshot_topology_archives table')
assert.match(modelsCode, /topology_hash/, 'DDL should include topology_hash column')
assert.match(modelsCode, /nodes_json/, 'DDL should include nodes_json column')
assert.match(modelsCode, /edges_json/, 'DDL should include edges_json column')
assert.match(modelsCode, /idx_topology_archives_workspace/, 'DDL should include workspace index')

// ============================================================
// Section 4: Schema module exists with expected models
// ============================================================
const schemaCode = readFileSync(
  path.join(repoRoot, 'backend/app/schemas/topology_archive.py'),
  'utf8',
)

assert.ok(schemaCode.length > 0, 'topology_archive.py schema should exist')
assert.match(schemaCode, /TopologyArchiveRequest/, 'should define TopologyArchiveRequest')
assert.match(schemaCode, /TopologyArchiveResponse/, 'should define TopologyArchiveResponse')
assert.match(schemaCode, /TopologyDiffResponse/, 'should define TopologyDiffResponse')
assert.match(schemaCode, /TopologyPayload/, 'should define TopologyPayload')

// ============================================================
// Section 5: API route includes topology archive endpoints
// ============================================================
const routesCode = readFileSync(
  path.join(repoRoot, 'backend/app/api/routes/snapshots.py'),
  'utf8',
)

assert.match(routesCode, /topology-archive/, 'should have topology-archive endpoint')
assert.match(routesCode, /compare\/topology/, 'should have compare/topology endpoint')
assert.match(routesCode, /store_topology_archive/, 'should have store_topology_archive handler')
assert.match(routesCode, /compare_topology/, 'should have compare_topology handler')
assert.match(routesCode, /TopologyArchiveRequest/, 'should import TopologyArchiveRequest')
assert.match(routesCode, /TopologyDiffResponse/, 'should import TopologyDiffResponse')

console.log('✅ topology_archive_smoke.mts: all assertions passed')
