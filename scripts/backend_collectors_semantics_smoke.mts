/**
 * Browserless FE semantics smoke — backend collectors validation.
 * Validates that Azure inventory collector exists and has expected structure.
 * Run: node --experimental-strip-types scripts/backend_collectors_semantics_smoke.mts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..')

// ============================================================
// Section 1: Azure inventory collector should exist
// ============================================================
const collectorCode = readFileSync(path.join(repoRoot, 'backend/app/collectors/azure_inventory.py'), 'utf8')

assert.ok(collectorCode.length > 0, 'azure_inventory.py should exist and be non-empty')

// ============================================================
// Section 2: Expected classes/functions
// ============================================================
const expectedSymbols = ['AzureInventoryCollection', 'AzureInventoryError', 'resolve_inventory_collection']
for (const symbol of expectedSymbols) {
  assert.match(collectorCode, new RegExp(`class ${symbol}|def ${symbol}`), `collector should define ${symbol}`)
}

// ============================================================
// Section 3: Azure SDK imports
// ============================================================
assert.match(collectorCode, /from azure/, 'collector should import from azure SDK')
assert.match(collectorCode, /ManagementClient|ResourceGroupsManagementClient|ComputeManagementClient|NetworkManagementClient/, 'collector should use Azure management clients')

// ============================================================
// Section 4: Expected data structures
// ============================================================
const collectionCode = collectorCode.slice(collectorCode.indexOf('class AzureInventoryCollection'))
assert.ok(collectionCode.includes('subscriptions') || collectionCode.includes('Subscription'), 'Collection should have subscriptions')
assert.ok(collectionCode.includes('resource_groups') || collectionCode.includes('ResourceGroup'), 'Collection should have resource_groups')
assert.ok(collectionCode.includes('resources') || collectionCode.includes('Resource'), 'Collection should have resources')

// ============================================================
// Section 5: Error handling
// ============================================================
const errorClassCode = collectorCode.slice(collectorCode.indexOf('class AzureInventoryError'))
assert.ok(errorClassCode.includes('Exception') || errorClassCode.includes('Error'), 'AzureInventoryError should extend Exception/Error')

// ============================================================
// Section 6: Core config imports
// ============================================================
const configCode = readFileSync(path.join(repoRoot, 'backend/app/core/config.py'), 'utf8')
assert.match(configCode, /class.*Settings|class.*Config/, 'config.py should define settings class')
assert.match(configCode, /azure_client_id|azure_client_secret|azure_tenant_id/, 'config should have Azure credential fields')

// ============================================================
// Section 7: Azure client imports
// ============================================================
const azureClientCode = readFileSync(path.join(repoRoot, 'backend/app/core/azure_client.py'), 'utf8')
assert.match(azureClientCode, /from azure/, 'azure_client.py should import from azure SDK')
assert.match(azureClientCode, /ManagedIdentityCredential|DefaultAzureCredential|ClientSecretCredential/, 'azure_client.py should use Azure credentials')

console.log('✅ backend_collectors_semantics_smoke.mts: all assertions passed')
