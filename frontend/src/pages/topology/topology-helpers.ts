import type { ElementDefinition } from 'cytoscape'

import type { TopologyChildSummary, TopologyEdge, TopologyNode, TopologyNodeDetail, TopologyResponse } from '../../lib/api'
import { COMPARE_COLOR_PALETTE, type RelationCategory, type RelationFilterState, type RelationTypeFilterState, type ResourceCategory, type ResourceFilterState } from './model'

export function getManagedInstanceChildSampleNames(node?: TopologyNode | null, nodeDetail?: TopologyNodeDetail | null) {
  const nodeLevelSamples = node?.child_summary?.sample_names ?? []
  if (nodeLevelSamples.length) {
    return nodeLevelSamples
  }

  const rawSummary = nodeDetail?.details?.child_summary
  if (typeof rawSummary !== 'object' || rawSummary === null) {
    return []
  }

  const sampleNames = (rawSummary as { sample_names?: unknown }).sample_names
  if (!Array.isArray(sampleNames)) {
    return []
  }

  return sampleNames.filter((item): item is string => typeof item === 'string')
}

export function isManagedInstanceNode(node?: TopologyNode | null) {
  return String(node?.resource_type ?? '').toLowerCase() === 'microsoft.sql/managedinstances'
}

export function getParentNode(node: TopologyNode | null | undefined, nodesByRef: Map<string, TopologyNode>) {
  if (!node?.parent_resource_id) {
    return null
  }

  return nodesByRef.get(node.parent_resource_id) ?? null
}

export function mergeTopologyResponses(topologies: TopologyResponse[]): TopologyResponse | null {
  const validTopologies = topologies.filter(Boolean)
  if (!validTopologies.length) {
    return null
  }

  const base = validTopologies[0]
  const nodeMap = new Map<string, TopologyNode>()
  const edgeMap = new Map<string, TopologyEdge>()

  for (const topology of validTopologies) {
    for (const node of topology.nodes ?? []) {
      const existing = nodeMap.get(node.node_key)
      nodeMap.set(node.node_key, {
        ...existing,
        ...node,
        child_summary: node.child_summary ?? existing?.child_summary,
        is_expanded: Boolean(existing?.is_expanded || node.is_expanded),
      })
    }

    for (const edge of topology.edges ?? []) {
      const edgeKey = `${edge.source_node_key}::${edge.relation_type}::${edge.target_node_key}`
      edgeMap.set(edgeKey, edge)
    }
  }

  const nodes = [...nodeMap.values()]
  const edges = [...edgeMap.values()]

  return {
    ...base,
    nodes,
    edges,
    options: {
      ...base.options,
      expanded_node_ref: null,
    },
    summary: {
      subscription_count: nodes.filter((node) => node.node_type === 'subscription').length,
      resource_group_count: nodes.filter((node) => node.node_type === 'resourcegroup').length,
      resource_count: nodes.filter((node) => node.node_type === 'resource').length,
      hidden_resource_count: nodes.reduce(
        (total, node) => total + (node.child_summary?.collapsed ? node.child_summary.total : 0),
        0,
      ),
      node_count: nodes.length,
      edge_count: edges.length,
      relation_counts: edges.reduce<Record<string, number>>((accumulator, edge) => {
        accumulator[edge.relation_type] = (accumulator[edge.relation_type] ?? 0) + 1
        return accumulator
      }, {}),
    },
  }
}

export function isResourceGroupNode(node?: TopologyNode | null) {
  return node?.node_type === 'resourcegroup'
}

export function formatChildSummary(childSummary?: TopologyChildSummary | null) {
  if (!childSummary?.total) {
    return null
  }

  const typeSummary = Object.entries(childSummary.type_counts)
    .map(([key, count]) => `${key} ${count}`)
    .join(', ')

  return `${childSummary.total} children${typeSummary ? ` • ${typeSummary}` : ''}`
}

export function getNodeMetaLine(node?: TopologyNode | null) {
  if (!node) {
    return '-'
  }

  const parts = [node.node_type]

  if (node.resource_type) {
    parts.push(node.resource_type)
  }

  if (node.location) {
    parts.push(node.location)
  }

  const childSummaryLine = formatChildSummary(node.child_summary)
  if (childSummaryLine) {
    parts.push(childSummaryLine)
  }

  return parts.join(' • ')
}

export function getResourceCategory(node: TopologyNode): ResourceCategory {
  if (node.node_type !== 'resource') {
    return 'scope'
  }

  const resourceType = String(node.resource_type ?? '').toLowerCase()

  if (resourceType.startsWith('microsoft.compute')) {
    return 'compute'
  }
  if (
    resourceType.startsWith('microsoft.sql') ||
    resourceType.startsWith('microsoft.storage') ||
    resourceType.startsWith('microsoft.documentdb') ||
    resourceType.startsWith('microsoft.synapse') ||
    resourceType.startsWith('microsoft.dbfor')
  ) {
    return 'data'
  }
  if (resourceType.startsWith('microsoft.network')) {
    return 'network'
  }
  if (
    resourceType.startsWith('microsoft.web') ||
    resourceType.startsWith('microsoft.cdn') ||
    resourceType.startsWith('microsoft.apimanagement')
  ) {
    return 'web'
  }

  return 'other'
}

export function getRelationCategory(edge: TopologyEdge): RelationCategory {
  const raw = String(edge.relation_category ?? '').toLowerCase()
  if (raw === 'structural' || raw === 'network' || raw === 'other') {
    return raw
  }

  if (edge.relation_type === 'contains' || edge.relation_type === 'manages') {
    return 'structural'
  }
  if (
    edge.relation_type === 'connects_to' ||
    edge.relation_type === 'secures' ||
    edge.relation_type === 'routes'
  ) {
    return 'network'
  }

  return 'other'
}

export function getRelationLegendClassName(relationType: string) {
  if (relationType === 'contains') {
    return 'relation-contains'
  }
  if (relationType === 'manages') {
    return 'relation-manages'
  }
  if (relationType === 'connects_to') {
    return 'relation-connects'
  }
  if (relationType === 'secures') {
    return 'relation-secures'
  }
  if (relationType === 'routes') {
    return 'relation-routes'
  }
  return 'relation-other'
}

export function getCompareColor(groupIndex: number) {
  return COMPARE_COLOR_PALETTE[(Math.max(groupIndex, 1) - 1) % COMPARE_COLOR_PALETTE.length]
}

export function getLayoutOptions(options?: { compareGroupCount?: number; clusterManagedInstanceChildren?: boolean }) {
  const compareGroupCount = Math.max(options?.compareGroupCount ?? 0, 0)
  const compareLaneMode = compareGroupCount >= 2
  const compareSpread = Math.min(compareGroupCount, 4)
  const clusterPadding = options?.clusterManagedInstanceChildren ? 12 : 0

  return {
    name: 'dagre',
    rankDir: compareLaneMode ? 'LR' : 'TB',
    nodeSep: compareLaneMode ? 92 + compareSpread * 14 : 52 + compareSpread * 4,
    rankSep: compareLaneMode ? 148 + compareSpread * 24 : 90 + compareSpread * 8,
    edgeSep: compareLaneMode ? 34 : 18,
    padding: (compareLaneMode ? 52 : 36) + clusterPadding,
    animate: false,
  } as const
}

export function buildFilteredTopology(
  topology: TopologyResponse | null,
  resourceFilters: ResourceFilterState,
  relationFilters: RelationFilterState,
  relationTypeFilters: RelationTypeFilterState,
) {
  if (!topology) {
    return {
      nodes: [] as TopologyNode[],
      edges: [] as TopologyEdge[],
    }
  }

  const visibleNodes = topology.nodes.filter((node) => resourceFilters[getResourceCategory(node)])
  const visibleNodeKeys = new Set(visibleNodes.map((node) => node.node_key))
  const visibleEdges = topology.edges.filter((edge) => {
    const category = getRelationCategory(edge)
    return (
      relationFilters[category] &&
      (relationTypeFilters[edge.relation_type] ?? true) &&
      visibleNodeKeys.has(edge.source_node_key) &&
      visibleNodeKeys.has(edge.target_node_key)
    )
  })

  return {
    nodes: visibleNodes,
    edges: visibleEdges,
  }
}

export function buildGraphElements(
  nodes: TopologyNode[],
  edges: TopologyEdge[],
  options?: { clusterManagedInstanceChildren?: boolean; expandedManagedInstanceRefs?: string[] },
): ElementDefinition[] {
  const nodeKeyByRef = new Map(nodes.map((node) => [node.node_ref, node.node_key]))
  const nodeByKey = new Map(nodes.map((node) => [node.node_key, node]))
  const compareGroupByRef = new Map(
    (options?.expandedManagedInstanceRefs ?? []).map((ref, index) => [ref, index + 1]),
  )
  const compoundParentNodeKeys = new Set(
    options?.clusterManagedInstanceChildren
      ? nodes
          .filter(
            (node) =>
              isManagedInstanceNode(node) &&
              nodes.some((candidate) => candidate.parent_resource_id === node.node_ref),
          )
          .map((node) => node.node_key)
      : [],
  )
  const compareGroupByNodeKey = new Map<string, number>()

  for (const node of nodes) {
    if (compareGroupByRef.has(node.node_ref)) {
      compareGroupByNodeKey.set(node.node_key, compareGroupByRef.get(node.node_ref) ?? 0)
      continue
    }

    if (node.parent_resource_id && compareGroupByRef.has(node.parent_resource_id)) {
      compareGroupByNodeKey.set(node.node_key, compareGroupByRef.get(node.parent_resource_id) ?? 0)
    }
  }

  const nodeElements: ElementDefinition[] = nodes.map((node) => ({
    data: {
      compareGroup: compareGroupByNodeKey.get(node.node_key) ?? 0,
      compareColor: getCompareColor(compareGroupByNodeKey.get(node.node_key) ?? 1),
      id: node.node_key,
      parent:
        options?.clusterManagedInstanceChildren && node.parent_resource_id
          ? (() => {
              const parentNodeKey = nodeKeyByRef.get(node.parent_resource_id)
              return parentNodeKey && compoundParentNodeKeys.has(parentNodeKey)
                ? parentNodeKey
                : undefined
            })()
          : undefined,
      label: node.display_name,
      nodeRef: node.node_ref,
      parentResourceId: node.parent_resource_id ?? '',
      nodeType: node.node_type,
      source: node.source,
      resourceType: node.resource_type ?? '',
      resourceCategory: getResourceCategory(node),
      location: node.location ?? '',
      collapsedChildren: node.child_summary?.collapsed ? node.child_summary.total : 0,
      expandedNode: node.is_expanded ? 'true' : 'false',
      compoundParent: compoundParentNodeKeys.has(node.node_key) ? 'true' : 'false',
    },
  }))

  const edgeElements: ElementDefinition[] = edges.map((edge) => ({
    data: {
      compareGroup:
        compareGroupByNodeKey.get(edge.source_node_key) ?? compareGroupByNodeKey.get(edge.target_node_key) ?? 0,
      compareColor: getCompareColor(
        compareGroupByNodeKey.get(edge.source_node_key) ??
          compareGroupByNodeKey.get(edge.target_node_key) ??
          1,
      ),
      id: `${edge.source_node_key}::${edge.relation_type}::${edge.target_node_key}`,
      source: edge.source_node_key,
      target: edge.target_node_key,
      relationType: edge.relation_type,
      pathLabel:
        edge.relation_type === 'contains' &&
        isManagedInstanceNode(nodeByKey.get(edge.source_node_key)) &&
        nodeByKey.get(edge.target_node_key)?.parent_resource_id === nodeByKey.get(edge.source_node_key)?.node_ref
          ? 'contains • parent-child'
          : edge.relation_type,
      relationCategory: getRelationCategory(edge),
      sourceKind: edge.source,
      confidence: edge.confidence,
      resolver: edge.resolver ?? '',
      evidence: edge.evidence?.join(' • ') ?? '',
    },
  }))

  return [...nodeElements, ...edgeElements]
}
