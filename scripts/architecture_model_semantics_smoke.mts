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

// ---------------------------------------------------------------------------
// Section 4: SQL / Database → store
// ---------------------------------------------------------------------------

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

console.log('✅ architecture_model_semantics_smoke.mts: all assertions passed')
