/**
 * Functional smoke tests for architecture/model.ts derivation logic.
 * Tests buildArchitectureViewModel and renderArchitectureSvg with
 * synthetic topology data covering stage classification, grouping,
 * edge derivation, and SVG output.
 *
 * Run: node --experimental-strip-types scripts/architecture_model_semantics_smoke.mts
 */

import assert from 'node:assert/strict'
import {
  buildArchitectureViewModel,
  renderArchitectureSvg,
  ARCHITECTURE_STAGE_ORDER,
  ARCHITECTURE_STAGE_META,
} from '../frontend/src/pages/architecture/model.ts'
import type {
  ArchitectureNode,
  ArchitectureEdge,
  ArchitectureStageBucket,
} from '../frontend/src/pages/architecture/model.ts'
import type { TopologyResponse, TopologyNode, TopologyEdge } from '../frontend/src/lib/api.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nopos(resp: ArchitectureNode): Omit<ArchitectureNode, 'id' | 'sourceNodeKeys'> {
  const { id: _id, sourceNodeKeys: _keys, ...rest } = resp
  return rest
}

function resourceNode(overrides: Partial<TopologyNode> = {}): TopologyNode {
  return {
    node_key: `resource:/subscriptions/sub1/resourceGroups/rg1/providers/Microsoft.Compute/virtualMachines/vm1`,
    node_type: 'resource',
    display_name: 'vm-app-prod',
    resource_type: 'Microsoft.Compute/virtualMachines',
    resource_group: 'rg-app-prod',
    location: 'canadacentral',
    source: 'azure',
    tags: {},
    ...overrides,
  }
}

function topologyEdge(
  source: string,
  target: string,
  relationType = 'dependency',
): TopologyEdge {
  return {
    source_node_key: source,
    target_node_key: target,
    relation_type: relationType,
    source: 'azure',
    metadata: {},
  }
}

// ---------------------------------------------------------------------------
// Section 1: Empty / null topology
// ---------------------------------------------------------------------------

{
  const vm = buildArchitectureViewModel(null)
  assert.equal(vm.workspaceId, '', 'null topology → empty workspaceId')
  assert.equal(vm.nodes.length, 0, 'null topology → 0 nodes')
  assert.equal(vm.edges.length, 0, 'null topology → 0 edges')
  assert.equal(vm.stageBuckets.length, ARCHITECTURE_STAGE_ORDER.length, 'null topology → all stage buckets present')
}

{
  const vm = buildArchitectureViewModel(undefined)
  assert.equal(vm.nodes.length, 0, 'undefined topology → 0 nodes')
}

// ---------------------------------------------------------------------------
// Section 2: Stage classification — resource type routing
// ---------------------------------------------------------------------------

{
  // Storage account → store
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes: [resourceNode({ node_key: 'sa1', display_name: 'datalake', resource_type: 'Microsoft.Storage/storageAccounts' })],
    edges: [],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t)
  assert.equal(vm.nodes.length, 1)
  assert.equal(vm.nodes[0].stage, 'store', 'Storage account → store')
  assert.equal(vm.nodes[0].family, 'storage')
}

{
  // CDN / Front Door → source
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes: [resourceNode({ node_key: 'cdn1', display_name: 'frontdoor-prod', resource_type: 'Microsoft.Cdn/profiles' })],
    edges: [],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t)
  assert.equal(vm.nodes[0].stage, 'source', 'CDN profile → source')
  assert.equal(vm.nodes[0].family, 'cdn')
}

{
  // Static web → source
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes: [resourceNode({ node_key: 'sw1', display_name: 'my-static-site', resource_type: 'Microsoft.Web/staticSites' })],
    edges: [],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t)
  assert.equal(vm.nodes[0].stage, 'source', 'Static web → source')
}

{
  // Synapse workspace → process
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes: [resourceNode({ node_key: 'syn1', display_name: 'synw-dataconf-prod', resource_type: 'Microsoft.Synapse/workspaces' })],
    edges: [],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t)
  assert.equal(vm.nodes[0].stage, 'process', 'Synapse workspace → process')
}

{
  // Synapse Spark pool → process
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes: [resourceNode({ node_key: 'pool1', display_name: 'sparkpool', resource_type: 'Microsoft.Synapse/workspaces/bigDataPools' })],
    edges: [],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t)
  assert.equal(vm.nodes[0].stage, 'process', 'Synapse bigDataPool → process')
}

{
  // Web app (non-static, non-FE) → serve
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes: [resourceNode({ node_key: 'web1', display_name: 'my-api-backend', resource_type: 'Microsoft.Web/sites' })],
    edges: [],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t)
  assert.equal(vm.nodes[0].stage, 'serve', 'Web app (non-FE) → serve')
}

{
  // Analysis Services → serve
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes: [resourceNode({ node_key: 'as1', display_name: 'semantic-model-prod', resource_type: 'Microsoft.AnalysisServices/servers' })],
    edges: [],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t)
  assert.equal(vm.nodes[0].stage, 'serve', 'Analysis Services server → serve')
  assert.equal(vm.nodes[0].family, 'analysis-services')
}

{
  // Machine Learning workspace → serve
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes: [resourceNode({ node_key: 'ml1', display_name: 'aml-inference-prod', resource_type: 'Microsoft.MachineLearningServices/workspaces' })],
    edges: [],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t)
  assert.equal(vm.nodes[0].stage, 'serve', 'Machine Learning workspace → serve')
  assert.equal(vm.nodes[0].family, 'machine-learning')
}

{
  // Web app with frontend hint → source
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes: [resourceNode({ node_key: 'fe1', display_name: 'myportal-fe', resource_type: 'Microsoft.Web/sites' })],
    edges: [],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t)
  assert.equal(vm.nodes[0].stage, 'source', 'Web app with -fe suffix → source')
}

{
  // Web app with name containing 'frontdoor' → source
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes: [resourceNode({ node_key: 'fd1', display_name: 'my-frontdoor-app', resource_type: 'Microsoft.Web/sites' })],
    edges: [],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t)
  assert.equal(vm.nodes[0].stage, 'source', 'Web app named frontdoor → source')
}

// ---------------------------------------------------------------------------
// Section 3: Infra routing
// ---------------------------------------------------------------------------

{
  // Network resources → infra
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes: [resourceNode({ node_key: 'nsg1', display_name: 'my-nsg', resource_type: 'Microsoft.Network/networkSecurityGroups' })],
    edges: [],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t)
  assert.equal(vm.nodes[0].stage, 'infra', 'NSG → infra')
}

{
  // VNet → infra
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes: [resourceNode({ node_key: 'vnet1', display_name: 'my-vnet', resource_type: 'Microsoft.Network/virtualNetworks' })],
    edges: [],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t)
  assert.equal(vm.nodes[0].stage, 'infra', 'VNet → infra')
}

{
  // Certificate → infra
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes: [resourceNode({ node_key: 'cert1', display_name: 'my-cert', resource_type: 'Microsoft.Web/certificates' })],
    edges: [],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t)
  assert.equal(vm.nodes[0].stage, 'infra', 'Certificate → infra')
}

{
  // App Service Plan → infra
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes: [resourceNode({ node_key: 'asp1', display_name: 'my-asp', resource_type: 'Microsoft.Web/serverFarms' })],
    edges: [],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t)
  assert.equal(vm.nodes[0].stage, 'infra', 'App Service Plan → infra')
  assert.equal(vm.nodes[0].family, 'app-plan')
}

{
  // SQL Virtual Cluster → infra
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes: [resourceNode({ node_key: 'vc1', display_name: 'sql-vc-prod', resource_type: 'Microsoft.Sql/virtualClusters' })],
    edges: [],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t)
  assert.equal(vm.nodes[0].stage, 'infra', 'SQL virtual cluster → infra')
}

{
  // Key Vault → infra
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes: [resourceNode({ node_key: 'kv1', display_name: 'my-keyvault', resource_type: 'Microsoft.KeyVault/vaults' })],
    edges: [],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t)
  assert.equal(vm.nodes[0].stage, 'infra', 'Key Vault → infra')
  assert.equal(vm.nodes[0].family, 'key-vault')
}

{
  // Log Analytics Workspace → infra
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes: [resourceNode({ node_key: 'law1', display_name: 'my-law', resource_type: 'Microsoft.OperationalInsights/workspaces' })],
    edges: [],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t)
  assert.equal(vm.nodes[0].stage, 'infra', 'Log Analytics → infra')
  assert.equal(vm.nodes[0].family, 'monitoring')
}

{
  // Application Insights → infra
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes: [resourceNode({ node_key: 'ai1', display_name: 'my-appinsights', resource_type: 'Microsoft.Insights/components' })],
    edges: [],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t)
  assert.equal(vm.nodes[0].stage, 'infra', 'App Insights → infra')
  assert.equal(vm.nodes[0].family, 'monitoring')
}


{
  // Operations Management Solution → infra
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes: [resourceNode({ node_key: 'oms1', display_name: 'oms-solution', resource_type: 'Microsoft.OperationsManagement/solutions' })],
    edges: [],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t)
  assert.equal(vm.nodes[0].stage, 'infra', 'Operations Management Solution → infra')
  assert.equal(vm.nodes[0].family, 'monitoring')
}

{
  // Insights alert rule catch-all → infra
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes: [resourceNode({ node_key: 'alert1', display_name: 'cpu-alert', resource_type: 'Microsoft.Insights/metricAlerts' })],
    edges: [],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t)
  assert.equal(vm.nodes[0].stage, 'infra', 'Insights catch-all → infra')
  assert.equal(vm.nodes[0].family, 'monitoring')
}


// -------------------------------------------------------------------------
// Section 3.5: Platform compute and pipeline services
// -------------------------------------------------------------------------

{
  // Data Factory → ingest
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes: [resourceNode({ node_key: 'adf1', display_name: 'orders-adf', resource_type: 'Microsoft.DataFactory/factories' })],
    edges: [],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t)
  assert.equal(vm.nodes[0].stage, 'ingest', 'Data Factory → ingest')
  assert.equal(vm.nodes[0].family, 'data-factory')
}

{
  // Databricks Workspace → process
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes: [resourceNode({ node_key: 'dbx1', display_name: 'etl-databricks', resource_type: 'Microsoft.Databricks/workspaces' })],
    edges: [],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t)
  assert.equal(vm.nodes[0].stage, 'process', 'Databricks → process')
  assert.equal(vm.nodes[0].family, 'databricks')
}

{
  // Virtual Machine → process
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes: [resourceNode({ node_key: 'vm1', display_name: 'etl-worker-vm', resource_type: 'Microsoft.Compute/virtualMachines' })],
    edges: [],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t)
  assert.equal(vm.nodes[0].stage, 'process', 'VM → process')
  assert.equal(vm.nodes[0].family, 'compute')
}

{
  // Container App API → serve
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes: [resourceNode({ node_key: 'ca1', display_name: 'orders-api', resource_type: 'Microsoft.App/containerApps' })],
    edges: [],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t)
  assert.equal(vm.nodes[0].stage, 'serve', 'Container App API → serve')
  assert.equal(vm.nodes[0].family, 'container-compute')
}

{
  // AKS cluster → process
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes: [resourceNode({ node_key: 'aks1', display_name: 'etl-aks', resource_type: 'Microsoft.ContainerService/managedClusters' })],
    edges: [],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t)
  assert.equal(vm.nodes[0].stage, 'process', 'AKS → process')
  assert.equal(vm.nodes[0].family, 'container-compute')
}


{
  // Container App frontend → source
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes: [resourceNode({ node_key: 'ca-fe', display_name: 'orders-frontend', resource_type: 'Microsoft.App/containerApps' })],
    edges: [],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t)
  assert.equal(vm.nodes[0].stage, 'source', 'Container App frontend → source')
  assert.equal(vm.nodes[0].family, 'container-compute')
}

{
  // Container App worker → process
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes: [resourceNode({ node_key: 'ca-worker', display_name: 'orders-worker', resource_type: 'Microsoft.App/containerApps' })],
    edges: [],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t)
  assert.equal(vm.nodes[0].stage, 'process', 'Container App worker → process')
  assert.equal(vm.nodes[0].family, 'container-compute')
}

{
  // Container App portal-worker should not overmatch portal as serve
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes: [resourceNode({ node_key: 'ca-portal-worker', display_name: 'portal-worker', resource_type: 'Microsoft.App/containerApps' })],
    edges: [],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t)
  assert.equal(vm.nodes[0].stage, 'process', 'Container App portal-worker → process')
  assert.equal(vm.nodes[0].family, 'container-compute')
}


{
  // Container Instance → process
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes: [resourceNode({ node_key: 'aci1', display_name: 'batch-container', resource_type: 'Microsoft.ContainerInstance/containerGroups' })],
    edges: [],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t)
  assert.equal(vm.nodes[0].stage, 'process', 'Container Instance → process')
  assert.equal(vm.nodes[0].family, 'container-compute')
}

// -------------------------------------------------------------------------
// Section 4: SQL / Database → store
// -------------------------------------------------------------------------

{
  // SQL Managed Instance → store
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes: [resourceNode({ node_key: 'mi1', display_name: 'sqlmi-prod', resource_type: 'Microsoft.Sql/managedInstances' })],
    edges: [],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t)
  assert.equal(vm.nodes[0].stage, 'store', 'SQL MI → store')
  assert.equal(vm.nodes[0].family, 'sql-managed-instance')
}

{
  // SQL Server → store
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes: [resourceNode({ node_key: 'sql1', display_name: 'my-sql-server', resource_type: 'Microsoft.Sql/servers' })],
    edges: [],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t)
  assert.equal(vm.nodes[0].stage, 'store', 'SQL Server → store')
  assert.equal(vm.nodes[0].family, 'sql-server')
}

// ---------------------------------------------------------------------------
// Section 5: Unclassified fallback
// ---------------------------------------------------------------------------

{
  // Unknown / no resource type → unclassified
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes: [resourceNode({ node_key: 'unk1', display_name: 'mystery-resource', resource_type: '' })],
    edges: [],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t)
  assert.equal(vm.nodes[0].stage, 'unclassified', 'empty type → unclassified')
}

{
  // Unrecognized resource type → unclassified
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes: [resourceNode({ node_key: 'unk2', display_name: 'some-obscure-thing', resource_type: 'Microsoft.Obscure/newService' })],
    edges: [],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t)
  assert.equal(vm.nodes[0].stage, 'unclassified', 'unknown resource type → unclassified')
}

// ---------------------------------------------------------------------------
// Section 6: Grouping behavior
// ---------------------------------------------------------------------------

{
  // Two resources of same family+workload+stage at threshold=2 → group node
  const nodes: TopologyNode[] = [
    resourceNode({ node_key: 'sa1', display_name: 'datalake-prod', resource_type: 'Microsoft.Storage/storageAccounts' }),
    resourceNode({ node_key: 'sa2', display_name: 'datalake-dev', resource_type: 'Microsoft.Storage/storageAccounts' }),
  ]
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes,
    edges: [],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t, { groupThreshold: 2 })
  assert.equal(vm.nodes.length, 1, '2 same-type resources → 1 group node at threshold=2')
  assert.equal(vm.nodes[0].id.startsWith('group:'), true, 'result is a group node')
  assert.equal(vm.nodes[0].nodeCount, 2, 'group contains 2 resources')
}

{
  // Two resources of same type at threshold=3 → two individual nodes
  const nodes: TopologyNode[] = [
    resourceNode({ node_key: 'sa1', display_name: 'datalake-prod', resource_type: 'Microsoft.Storage/storageAccounts' }),
    resourceNode({ node_key: 'sa2', display_name: 'datalake-dev', resource_type: 'Microsoft.Storage/storageAccounts' }),
  ]
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes,
    edges: [],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t, { groupThreshold: 3 })
  assert.equal(vm.nodes.length, 2, '2 same-type resources → 2 individual nodes at threshold=3')
  assert.ok(vm.nodes.every(n => n.id.startsWith('node:')), 'all results are individual nodes')
}

{
  // Different workloads → different groups
  const nodes: TopologyNode[] = [
    resourceNode({ node_key: 'sa1', display_name: 'datalake-prod', resource_type: 'Microsoft.Storage/storageAccounts', resource_group: 'rg-data' }),
    resourceNode({ node_key: 'sa2', display_name: 'datalake-dev', resource_type: 'Microsoft.Storage/storageAccounts', resource_group: 'rg-data' }),
    resourceNode({ node_key: 'sa3', display_name: 'servingstore-prod', resource_type: 'Microsoft.Storage/storageAccounts', resource_group: 'rg-serve' }),
    resourceNode({ node_key: 'sa4', display_name: 'servingstore-dev', resource_type: 'Microsoft.Storage/storageAccounts', resource_group: 'rg-serve' }),
  ]
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes,
    edges: [],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t, { groupThreshold: 2 })
  assert.equal(vm.nodes.length, 2, '2 different workloads → 2 group nodes')
  assert.equal(vm.nodes[0].nodeCount + vm.nodes[1].nodeCount, 4, 'all 4 resources accounted in groups')
}

{
  // Mixed stage resources → separate groups per stage
  const nodes: TopologyNode[] = [
    resourceNode({ node_key: 'web1', display_name: 'my-api', resource_type: 'Microsoft.Web/sites' }),
    resourceNode({ node_key: 'web2', display_name: 'my-api-staging', resource_type: 'Microsoft.Web/sites' }),
    resourceNode({ node_key: 'sa1', display_name: 'mystorage', resource_type: 'Microsoft.Storage/storageAccounts' }),
    resourceNode({ node_key: 'sa2', display_name: 'mystorage-backup', resource_type: 'Microsoft.Storage/storageAccounts' }),
  ]
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes,
    edges: [],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t, { groupThreshold: 2 })
  const stages = vm.nodes.map(n => n.stage)
  assert.equal(new Set(stages).size, 2, 'Mixed resource types → 2 different stages')
  assert.ok(stages.includes('serve'), 'includes serve stage')
  assert.ok(stages.includes('store'), 'includes store stage')
}

// ---------------------------------------------------------------------------
// Section 7: Edge derivation
// ---------------------------------------------------------------------------

{
  // Topology edge between two resources → architecture edge
  const n1 = resourceNode({ node_key: 'web1', display_name: 'my-api', resource_type: 'Microsoft.Web/sites' })
  const n2 = resourceNode({ node_key: 'sa1', display_name: 'mystorage', resource_type: 'Microsoft.Storage/storageAccounts' })
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes: [n1, n2],
    edges: [topologyEdge('web1', 'sa1', 'dependsOn')],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t)
  assert.ok(vm.edges.length >= 1, 'topology edge → at least 1 architecture edge')
  const realEdge = vm.edges.find(e => e.kinds.includes('topology'))
  assert.ok(realEdge, 'has a topology-backed edge')
  assert.ok(realEdge!.relationTypes.includes('dependsOn'), 'preserves relation type')
}

{
  // Multiple topology edges between same source→target → aggregated count
  const n1 = resourceNode({ node_key: 'web1', display_name: 'my-api', resource_type: 'Microsoft.Web/sites' })
  const n2 = resourceNode({ node_key: 'sa1', display_name: 'mystorage', resource_type: 'Microsoft.Storage/storageAccounts' })
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes: [n1, n2],
    edges: [
      topologyEdge('web1', 'sa1', 'dependsOn'),
      topologyEdge('web1', 'sa1', 'writesTo'),
    ],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t)
  const topoEdges = vm.edges.filter(e => e.kinds.includes('topology'))
  assert.equal(topoEdges.length, 1, 'duplicate source→target edges → 1 aggregated edge')
  assert.equal(topoEdges[0].count, 2, 'aggregated count = 2')
  assert.equal(topoEdges[0].relationTypes.length, 2, 'preserves both relation types')
}

{
  // Same workload across stages → synthetic stage-flow edges
  // Use shared resource group + short display names so tokens ≤ 2 chars,
  // forcing workloadKey to fall back to the common resource-group token.
  const nodes: TopologyNode[] = [
    resourceNode({ node_key: 'sa1', display_name: 'a', resource_type: 'Microsoft.Storage/storageAccounts', resource_group: 'rg-shared' }),
    resourceNode({ node_key: 'syn1', display_name: 'b', resource_type: 'Microsoft.Synapse/workspaces', resource_group: 'rg-shared' }),
    resourceNode({ node_key: 'web1', display_name: 'c', resource_type: 'Microsoft.Web/sites', resource_group: 'rg-shared' }),
  ]
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes,
    edges: [],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t)
  const synthetic = vm.edges.filter(e => e.kinds.includes('synthetic'))
  assert.ok(synthetic.length >= 2, 'same-workload nodes across 3 stages → ≥ 2 synthetic edges')
}

// ---------------------------------------------------------------------------
// Section 8: SVG rendering
// ---------------------------------------------------------------------------

{
  // Render empty stage buckets → valid SVG
  const emptyBuckets: ArchitectureStageBucket[] = ARCHITECTURE_STAGE_ORDER.map((stage) => ({
    stage,
    label: ARCHITECTURE_STAGE_META[stage].label,
    description: ARCHITECTURE_STAGE_META[stage].description,
    nodes: [],
  }))
  const result = renderArchitectureSvg(emptyBuckets, [])
  assert.ok(result.svg.trimStart().startsWith('<svg'), 'output starts with <svg>')
  assert.ok(result.svg.includes('</svg>'), 'output ends with </svg>')
  assert.ok(result.width > 0, 'has positive width')
  assert.ok(result.height > 0, 'has positive height')
}

{
  // Render populated stage buckets → SVG with node card elements
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes: [
      resourceNode({ node_key: 'web1', display_name: 'my-api', resource_type: 'Microsoft.Web/sites' }),
      resourceNode({ node_key: 'sa1', display_name: 'mystorage', resource_type: 'Microsoft.Storage/storageAccounts' }),
    ],
    edges: [topologyEdge('web1', 'sa1', 'dependsOn')],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t)
  const populatedBuckets = vm.stageBuckets.filter(b => b.nodes.length > 0)
  const result = renderArchitectureSvg(populatedBuckets, vm.edges)
  assert.ok(result.svg.includes('<text'), 'SVG contains text elements')
  assert.ok(result.svg.includes('<rect'), 'SVG contains rectangle elements')
  assert.ok(result.svg.includes('arch-arrow'), 'SVG contains arrow marker')
  // Labels go through prettifyDisplayLabel → "Mystorage" / "My API"
  assert.ok(result.svg.includes('Mystorage') || result.svg.includes('My API'), 'SVG references prettified node labels')
}

{
  // SVG is valid XML-safe (no raw <, >, &, ", ' in text content)
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes: [
      resourceNode({ node_key: 'xss1', display_name: '<script>alert("xss")</script>', resource_type: 'Microsoft.Web/sites' }),
    ],
    edges: [],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t)
  const populatedBuckets = vm.stageBuckets.filter(b => b.nodes.length > 0)
  const result = renderArchitectureSvg(populatedBuckets, [])
  // Tokenization/prettification strips angle brackets; escapeXml is defense-in-depth.
  // The real security property: raw <script> tags must NOT appear in output.
  assert.ok(!result.svg.includes('<script>'), 'XSS display name does not create raw <script> tags in SVG')
  assert.ok(!result.svg.includes('alert('), 'XSS payload alert() not present in SVG')
}

// ---------------------------------------------------------------------------
// Section 9: Node metadata and counts
// ---------------------------------------------------------------------------

{
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes: [resourceNode({ node_key: 'vm1', display_name: 'vm-app', resource_type: 'Microsoft.Compute/virtualMachines' })],
    edges: [],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t)
  const node = vm.nodes[0]
  assert.ok(node.label.length > 0, 'node has label')
  assert.ok(node.shortLabel.length > 0, 'node has shortLabel')
  assert.ok(node.familyLabel.length > 0, 'node has familyLabel')
  assert.ok(node.description.length > 0, 'node has description')
  assert.equal(node.sourceNodeKeys.length, 1, 'single source node')
  assert.equal(node.nodeCount, 1, 'nodeCount = 1 for single resource')
}

{
  // Grouped node metadata
  const nodes: TopologyNode[] = [
    resourceNode({ node_key: 'sa1', display_name: 'datalake-prod', resource_type: 'Microsoft.Storage/storageAccounts', resource_group: 'rg-data', location: 'canadacentral' }),
    resourceNode({ node_key: 'sa2', display_name: 'datalake-dev', resource_type: 'Microsoft.Storage/storageAccounts', resource_group: 'rg-data', location: 'canadacentral' }),
  ]
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes,
    edges: [],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t, { groupThreshold: 2 })
  assert.equal(vm.nodes.length, 1)
  const group = vm.nodes[0]
  assert.equal(group.nodeCount, 2, 'group nodeCount = 2')
  assert.equal(group.sourceNodeKeys.length, 2, 'group has 2 source keys')
  assert.equal(group.resourceGroups.length, 1, 'group has 1 resource group')
  assert.equal(group.resourceGroups[0], 'rg-data', 'resource group preserved')
  assert.equal(group.locations.length, 1, '1 location')
  assert.equal(group.locations[0], 'canadacentral', 'location preserved')
}

// ---------------------------------------------------------------------------
// Section 10: ViewModel counts
// ---------------------------------------------------------------------------

{
  const nodes: TopologyNode[] = [
    resourceNode({ node_key: 'sa1', display_name: 'datalake-prod', resource_type: 'Microsoft.Storage/storageAccounts', resource_group: 'rg-data' }),
    resourceNode({ node_key: 'sa2', display_name: 'datalake-dev', resource_type: 'Microsoft.Storage/storageAccounts', resource_group: 'rg-data' }),
    resourceNode({ node_key: 'web1', display_name: 'api-prod', resource_type: 'Microsoft.Web/sites' }),
  ]
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes,
    edges: [],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t, { groupThreshold: 2 })
  assert.equal(vm.sourceNodeCount, 3, '3 source resource nodes')
  assert.equal(vm.groupedResourceCount, 3, 'all 3 resources accounted')
  assert.equal(vm.stageBuckets.length, ARCHITECTURE_STAGE_ORDER.length, 'all stages present in buckets')
  assert.equal(vm.generatedAt, '2026-04-01T00:00:00Z', 'generatedAt forwarded')
  assert.equal(vm.workspaceId, 'ws1', 'workspaceId forwarded')
}

// ---------------------------------------------------------------------------
// Section 11: Stage bucket ordering
// ---------------------------------------------------------------------------

{
  const vm = buildArchitectureViewModel(null)
  const bucketStages = vm.stageBuckets.map(b => b.stage)
  assert.deepEqual(bucketStages, ARCHITECTURE_STAGE_ORDER, 'empty viewModel preserves stage order')
}

// ---------------------------------------------------------------------------
// Section 12: Edge count and self-loop safety
// ---------------------------------------------------------------------------

{
  // Self-loops (same source→target node ID) should not create edges
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes: [resourceNode({ node_key: 'self1', display_name: 'single-resource', resource_type: 'Microsoft.Web/sites' })],
    edges: [topologyEdge('self1', 'self1', 'selfRef')],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t)
  assert.equal(vm.edges.length, 0, 'self-loop topology edges → 0 architecture edges')
}

// ---------------------------------------------------------------------------
// Section 13: Default threshold fallback
// ---------------------------------------------------------------------------

{
  // Default threshold when options undefined
  const nodes: TopologyNode[] = [
    resourceNode({ node_key: 'sa1', display_name: 'datalake-1', resource_type: 'Microsoft.Storage/storageAccounts' }),
    resourceNode({ node_key: 'sa2', display_name: 'datalake-2', resource_type: 'Microsoft.Storage/storageAccounts' }),
  ]
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes,
    edges: [],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t) // no options → default GROUP_THRESHOLD_DEFAULT=2
  assert.equal(vm.nodes.length, 1, 'default threshold=2 groups 2 same-type resources')
}

// ---------------------------------------------------------------------------
// Section 14: SVG dimensions are non-zero and reasonable
// ---------------------------------------------------------------------------

{
  // Even with 1 node, SVG should have reasonable dimensions
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes: [resourceNode({ node_key: 'single1', display_name: 'one-resource', resource_type: 'Microsoft.Web/sites' })],
    edges: [],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t)
  const populatedBuckets = vm.stageBuckets.filter(b => b.nodes.length > 0)
  const result = renderArchitectureSvg(populatedBuckets, [])
  assert.ok(result.width >= 200, 'SVG width is at least 200px')
  assert.ok(result.height >= 200, 'SVG height is at least 200px')
  assert.ok(result.width < 10000, 'SVG width is reasonable (< 10000px)')
  assert.ok(result.height < 10000, 'SVG height is reasonable (< 10000px)')
}

// ---------------------------------------------------------------------------
// Section 15: Non-resource topology nodes are ignored
// ---------------------------------------------------------------------------

{
  const nodes: TopologyNode[] = [
    resourceNode({ node_key: 'web1', display_name: 'my-api', resource_type: 'Microsoft.Web/sites' }),
    {
      node_key: 'manual1',
      node_type: 'manual',
      display_name: 'My Manual Node',
      resource_group: '',
      location: '',
      tags: {},
      source: 'manual',
    } as TopologyNode,
  ]
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes,
    edges: [],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t)
  assert.equal(vm.nodes.length, 1, 'non-resource nodes are filtered out')
  assert.equal(vm.sourceNodeCount, 1, 'sourceNodeCount counts only resource nodes')
}


// ---------------------------------------------------------------------------
// Section 15.5: Presentation overrides
// ---------------------------------------------------------------------------

{
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes: [resourceNode({ node_key: 'storage-override', display_name: 'raw-datalake', resource_type: 'Microsoft.Storage/storageAccounts' })],
    edges: [],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t, {
    nodeOverrides: {
      'storage-override': {
        displayNameOverride: 'Curated Landing Zone',
        stageKeyOverride: 'ingest',
      },
    },
  })
  assert.equal(vm.nodes[0].label, 'Curated Landing Zone', 'displayNameOverride should replace generated label')
  assert.equal(vm.nodes[0].stage, 'ingest', 'stageKeyOverride should move resource into selected stage')
  assert.equal(vm.stageBuckets.find((bucket) => bucket.stage === 'ingest')?.nodes.length, 1, 'override target bucket should contain node')
  assert.equal(vm.stageBuckets.find((bucket) => bucket.stage === 'store')?.nodes.length, 0, 'original generated bucket should no longer contain moved node')
}

{
  const t: TopologyResponse = {
    workspace_id: 'ws1',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes: [
      resourceNode({ node_key: 'group-a', display_name: 'api-prod-a', resource_type: 'Microsoft.Web/sites' }),
      resourceNode({ node_key: 'group-b', display_name: 'api-prod-b', resource_type: 'Microsoft.Web/sites' }),
    ],
    edges: [],
    status: 'ok',
  }
  const vm = buildArchitectureViewModel(t, {
    groupThreshold: 2,
    nodeOverrides: {
      'group-a': { displayNameOverride: 'Presentation API' },
      'group-b': { displayNameOverride: 'Presentation API' },
    },
  })
  assert.equal(vm.nodes.length, 1, 'matching overrides should keep grouped card compact')
  assert.equal(vm.nodes[0].label, 'Presentation API', 'shared displayNameOverride should label grouped card')
}

// ---------------------------------------------------------------------------
// Section 16: Scale smoke — 200+ resource topology
// ---------------------------------------------------------------------------

{
  const nodes: TopologyNode[] = []
  for (let index = 0; index < 240; index += 1) {
    const family = index % 6
    const resourceType = family === 0
      ? 'Microsoft.Storage/storageAccounts'
      : family === 1
        ? 'Microsoft.Web/sites'
        : family === 2
          ? 'Microsoft.Synapse/workspaces'
          : family === 3
            ? 'Microsoft.Network/virtualNetworks'
            : family === 4
              ? 'Microsoft.Sql/managedInstances'
              : 'Microsoft.Unknown/widgets'
    nodes.push(resourceNode({
      node_key: `scale-${index}`,
      display_name: `scale-${family}-resource-${index}`,
      resource_type: resourceType,
      resource_group: `rg-scale-${index % 12}`,
      location: index % 2 === 0 ? 'canadacentral' : 'westus3',
    }))
  }

  const edges: TopologyEdge[] = []
  for (let index = 0; index < 180; index += 1) {
    edges.push(topologyEdge(`scale-${index}`, `scale-${index + 60}`, 'depends_on'))
  }

  const t: TopologyResponse = {
    workspace_id: 'scale-ws',
    generated_at: '2026-04-01T00:00:00Z',
    mode: 'live',
    nodes,
    edges,
    status: 'ok',
  }
  const started = Date.now()
  const vm = buildArchitectureViewModel(t, { groupThreshold: 10 })
  const populatedBuckets = vm.stageBuckets.filter(bucket => bucket.nodes.length > 0)
  const svg = renderArchitectureSvg(populatedBuckets, vm.edges)
  const elapsedMs = Date.now() - started

  assert.equal(vm.sourceNodeCount, 240, 'scale topology accounts for all resource nodes')
  assert.equal(vm.groupedResourceCount, 240, 'scale topology groupedResourceCount accounts for all source nodes')
  assert.ok(vm.nodes.length < 240, 'scale topology is compacted by grouping')
  assert.ok(vm.nodes.length > 0, 'scale topology renders at least one architecture node')
  assert.ok(vm.edges.length > 0, 'scale topology derives architecture edges')
  assert.ok(populatedBuckets.length >= 4, 'scale topology populates multiple architecture stages')
  assert.match(svg.svg, /^\s*<svg /, 'scale topology renders an SVG document')
  assert.ok(svg.width < 10000, 'scale SVG width remains bounded')
  assert.ok(svg.height < 10000, 'scale SVG height remains bounded')
  assert.ok(elapsedMs < 1000, `scale topology derivation/render should stay fast; got ${elapsedMs}ms`)
}

console.log('✅ architecture_model_semantics_smoke.mts: all assertions passed')
