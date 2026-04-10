import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import cytoscape, { type Core, type ElementDefinition } from 'cytoscape'
import dagre from 'cytoscape-dagre'

import {
  createPngExport,
  getAuthConfigCheck,
  getTopology,
  getTopologyNodeDetail,
  getWorkspaces,
  type ExportItem,
  type TopologyChildSummary,
  type TopologyEdge,
  type TopologyNode,
  type TopologyNodeDetail,
  type TopologyResponse,
  type Workspace,
} from '../lib/api'

cytoscape.use(dagre)

type CountItem = {
  key: string
  count: number
}

type SearchResult = {
  node: TopologyNode
  score: number
  matchedFields: string[]
  matchedPreviewNames?: string[]
}

type SearchResultGroup = {
  key: ResourceCategory
  label: string
  results: SearchResult[]
}

type SearchScope = 'visible' | 'child-only' | 'collapsed-preview'

type ResourceCategory = 'compute' | 'data' | 'network' | 'web' | 'other' | 'scope'
type RelationCategory = 'structural' | 'network' | 'other'

type ResourceFilterState = Record<ResourceCategory, boolean>
type RelationFilterState = Record<RelationCategory, boolean>
type RelationTypeFilterState = Record<string, boolean>

const DEFAULT_RESOURCE_FILTERS: ResourceFilterState = {
  scope: true,
  compute: true,
  data: true,
  network: true,
  web: true,
  other: true,
}

const DEFAULT_RELATION_FILTERS: RelationFilterState = {
  structural: true,
  network: true,
  other: true,
}

const DEFAULT_RELATION_TYPE_FILTERS: RelationTypeFilterState = {
  contains: true,
  manages: true,
  connects_to: true,
  secures: true,
  routes: true,
}

const SEARCH_GROUP_ORDER: ResourceCategory[] = ['data', 'network', 'web', 'compute', 'scope', 'other']
const COMPARE_COLOR_PALETTE = ['#22d3ee', '#f59e0b', '#a78bfa', '#34d399', '#f472b6', '#f87171']

type TopologyPresetState = {
  workspaceId: string
  compareRefs: string[]
  clusterChildren: boolean
  scope: SearchScope
  query: string
}

function getCompareColor(groupIndex: number) {
  return COMPARE_COLOR_PALETTE[(Math.max(groupIndex, 1) - 1) % COMPARE_COLOR_PALETTE.length]
}

function readTopologyPresetFromUrl(): TopologyPresetState {
  if (typeof window === 'undefined') {
    return {
      workspaceId: '',
      compareRefs: [],
      clusterChildren: true,
      scope: 'visible',
      query: '',
    }
  }

  const search = new URLSearchParams(window.location.search)
  const scope = search.get('scope')

  return {
    workspaceId: search.get('workspace') ?? '',
    compareRefs: search.getAll('mi').filter(Boolean),
    clusterChildren: search.get('cluster') !== '0',
    scope:
      scope === 'child-only' || scope === 'collapsed-preview' || scope === 'visible'
        ? scope
        : 'visible',
    query: search.get('q') ?? '',
  }
}

function writeTopologyPresetToUrl(state: TopologyPresetState) {
  if (typeof window === 'undefined') {
    return
  }

  const search = new URLSearchParams()

  if (state.workspaceId) {
    search.set('workspace', state.workspaceId)
  }
  if (state.query) {
    search.set('q', state.query)
  }
  if (state.scope !== 'visible') {
    search.set('scope', state.scope)
  }
  if (!state.clusterChildren) {
    search.set('cluster', '0')
  }
  for (const ref of state.compareRefs) {
    search.append('mi', ref)
  }

  const nextUrl = `${window.location.pathname}${search.toString() ? `?${search.toString()}` : ''}`
  window.history.replaceState(null, '', nextUrl)
}

function formatDateTime(value?: string) {
  if (!value) {
    return '-'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString()
}

function prettifyKey(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function normalizeSearchValue(value?: string | null) {
  return String(value ?? '').trim().toLowerCase()
}

function searchTopologyNodes(nodes: TopologyNode[], query: string, scope: SearchScope): SearchResult[] {
  const normalizedQuery = normalizeSearchValue(query)
  if (!normalizedQuery) {
    return []
  }

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean)
  if (!tokens.length) {
    return []
  }

  const results: SearchResult[] = []

  for (const node of nodes) {
    const childSampleNames = (node.child_summary?.sample_names ?? []).filter(
      (item): item is string => typeof item === 'string' && Boolean(item.trim()),
    )

    if (scope === 'child-only' && !node.parent_resource_id) {
      continue
    }

    if (scope === 'collapsed-preview') {
      if (!node.child_summary?.collapsed || !childSampleNames.length) {
        continue
      }

      let score = 0
      let matchedAllTokens = true
      const matchedPreviewNames = new Set<string>()

      for (const token of tokens) {
        let matchedThisToken = false

        for (const sampleName of childSampleNames) {
          const normalizedSampleName = normalizeSearchValue(sampleName)
          if (!normalizedSampleName) {
            continue
          }

          if (normalizedSampleName.startsWith(token)) {
            score += 34
            matchedPreviewNames.add(sampleName)
            matchedThisToken = true
            continue
          }

          if (normalizedSampleName.includes(token)) {
            score += 22
            matchedPreviewNames.add(sampleName)
            matchedThisToken = true
          }
        }

        if (!matchedThisToken) {
          matchedAllTokens = false
          break
        }
      }

      if (!matchedAllTokens) {
        continue
      }

      if (childSampleNames.some((sampleName) => normalizeSearchValue(sampleName) === normalizedQuery)) {
        score += 18
      }

      if (isManagedInstanceNode(node)) {
        score += 8
      }

      results.push({
        node,
        score,
        matchedFields: ['child preview'],
        matchedPreviewNames: [...matchedPreviewNames].slice(0, 3),
      })

      continue
    }

    const displayName = normalizeSearchValue(node.display_name)
    const nodeKey = normalizeSearchValue(node.node_key)
    const nodeType = normalizeSearchValue(node.node_type)
    const nodeRef = normalizeSearchValue(node.node_ref)
    const resourceType = normalizeSearchValue(node.resource_type)
    const resourceGroup = normalizeSearchValue(node.resource_group)
    const location = normalizeSearchValue(node.location)

    let score = 0
    const matchedFields = new Set<string>()
    let matchedAllTokens = true

    for (const token of tokens) {
      let matchedThisToken = false

      if (displayName.startsWith(token)) {
        score += 36
        matchedFields.add('name')
        matchedThisToken = true
      } else if (displayName.includes(token)) {
        score += 24
        matchedFields.add('name')
        matchedThisToken = true
      }

      if (resourceGroup && resourceGroup.includes(token)) {
        score += 16
        matchedFields.add('resource group')
        matchedThisToken = true
      }

      if (resourceType && resourceType.includes(token)) {
        score += 14
        matchedFields.add('resource type')
        matchedThisToken = true
      }

      if (location && location.includes(token)) {
        score += 10
        matchedFields.add('location')
        matchedThisToken = true
      }

      if (nodeType && nodeType.includes(token)) {
        score += 8
        matchedFields.add('node type')
        matchedThisToken = true
      }

      if (nodeKey.includes(token)) {
        score += 7
        matchedFields.add('node key')
        matchedThisToken = true
      }

      if (nodeRef.includes(token)) {
        score += 6
        matchedFields.add('node ref')
        matchedThisToken = true
      }

      if (!matchedThisToken) {
        matchedAllTokens = false
        break
      }
    }

    if (!matchedAllTokens) {
      continue
    }

    if (displayName === normalizedQuery) {
      score += 18
    }

    if (isManagedInstanceNode(node)) {
      score += 12
    }

    if (String(node.resource_type ?? '').toLowerCase().includes('managedinstance')) {
      score += 6
    }

    if (node.node_type === 'resourcegroup') {
      score += 4
    }

    results.push({
      node,
      score,
      matchedFields: [...matchedFields],
    })
  }

  return results.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score
    }
    return left.node.display_name.localeCompare(right.node.display_name)
  })
}

function getSearchGroupLabel(category: ResourceCategory) {
  if (category === 'data') {
    return 'Data'
  }
  if (category === 'network') {
    return 'Network'
  }
  if (category === 'web') {
    return 'Web'
  }
  if (category === 'compute') {
    return 'Compute'
  }
  if (category === 'scope') {
    return 'Scope'
  }
  return 'Other'
}

function buildSearchResultGroups(results: SearchResult[]): SearchResultGroup[] {
  const grouped = new Map<ResourceCategory, SearchResult[]>()

  for (const result of results) {
    const category = getResourceCategory(result.node)
    grouped.set(category, [...(grouped.get(category) ?? []), result])
  }

  return SEARCH_GROUP_ORDER.map((category) => ({
    key: category,
    label: getSearchGroupLabel(category),
    results: grouped.get(category) ?? [],
  })).filter((group) => group.results.length > 0)
}

function getManagedInstanceChildSampleNames(node?: TopologyNode | null, nodeDetail?: TopologyNodeDetail | null) {
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

function isManagedInstanceNode(node?: TopologyNode | null) {
  return String(node?.resource_type ?? '').toLowerCase() === 'microsoft.sql/managedinstances'
}

function getParentNode(node: TopologyNode | null | undefined, nodesByRef: Map<string, TopologyNode>) {
  if (!node?.parent_resource_id) {
    return null
  }

  return nodesByRef.get(node.parent_resource_id) ?? null
}

function mergeTopologyResponses(topologies: TopologyResponse[]): TopologyResponse | null {
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

function getSearchScopeMeta(scope: SearchScope) {
  if (scope === 'child-only') {
    return {
      label: 'Expanded child nodes',
      placeholder: 'child database name, type, location, node key...',
      hint: '현재 canvas에 펼쳐진 child node만 검색',
      empty: '현재 expanded child node 기준 일치 결과 없음',
    }
  }

  if (scope === 'collapsed-preview') {
    return {
      label: 'Collapsed child previews',
      placeholder: 'collapsed child sample name...',
      hint: 'collapse 상태의 child sample name으로 부모 managed instance 검색',
      empty: '현재 collapsed child preview 기준 일치 결과 없음',
    }
  }

  return {
    label: 'Visible nodes',
    placeholder: 'name, resource group, type, location, node key...',
    hint: '현재 visible topology node 전체 검색',
    empty: '현재 visible node 기준 일치 결과 없음',
  }
}

function isResourceGroupNode(node?: TopologyNode | null) {
  return node?.node_type === 'resourcegroup'
}

function formatChildSummary(childSummary?: TopologyChildSummary | null) {
  if (!childSummary?.total) {
    return null
  }

  const typeSummary = Object.entries(childSummary.type_counts)
    .map(([key, count]) => `${key} ${count}`)
    .join(', ')

  return `${childSummary.total} children${typeSummary ? ` • ${typeSummary}` : ''}`
}

function getNodeMetaLine(node?: TopologyNode | null) {
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

function getResourceCategory(node: TopologyNode): ResourceCategory {
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

function getRelationCategory(edge: TopologyEdge): RelationCategory {
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

function getRelationLegendClassName(relationType: string) {
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

function getLayoutOptions(options?: { compareGroupCount?: number; clusterManagedInstanceChildren?: boolean }) {
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

function buildFilteredTopology(
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

function buildGraphElements(
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
    },
  }))

  return [...nodeElements, ...edgeElements]
}

export function TopologyPage() {
  const initialPreset = readTopologyPresetFromUrl()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('')
  const [topology, setTopology] = useState<TopologyResponse | null>(null)
  const [selectedNodeKey, setSelectedNodeKey] = useState<string>('')
  const [nodeDetail, setNodeDetail] = useState<TopologyNodeDetail | null>(null)
  const [authReady, setAuthReady] = useState<boolean>(false)
  const [error, setError] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [topologyLoading, setTopologyLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [exportLoading, setExportLoading] = useState(false)
  const [lastExport, setLastExport] = useState<ExportItem | null>(null)
  const [exportMessage, setExportMessage] = useState<string>('')
  const [includeNetworkInference, setIncludeNetworkInference] = useState(false)
  const [resourceFilters, setResourceFilters] = useState<ResourceFilterState>(DEFAULT_RESOURCE_FILTERS)
  const [relationFilters, setRelationFilters] = useState<RelationFilterState>(DEFAULT_RELATION_FILTERS)
  const [relationTypeFilters, setRelationTypeFilters] = useState<RelationTypeFilterState>(
    DEFAULT_RELATION_TYPE_FILTERS,
  )
  const [expandedManagedInstanceRefs, setExpandedManagedInstanceRefs] = useState<string[]>(initialPreset.compareRefs)
  const [clusterManagedInstanceChildren, setClusterManagedInstanceChildren] = useState(initialPreset.clusterChildren)
  const [focusedResourceGroupName, setFocusedResourceGroupName] = useState('')
  const [searchQuery, setSearchQuery] = useState(initialPreset.query)
  const [searchScope, setSearchScope] = useState<SearchScope>(initialPreset.scope)
  const [searchResultIndex, setSearchResultIndex] = useState(0)
  const [pendingFocusNodeKey, setPendingFocusNodeKey] = useState('')
  const [managedInstanceTransition, setManagedInstanceTransition] = useState<'expand' | 'collapse' | ''>('')

  const graphContainerRef = useRef<HTMLDivElement | null>(null)
  const cyRef = useRef<Core | null>(null)

  useEffect(() => {
    async function loadInitial() {
      try {
        setLoading(true)
        setError('')

        const [workspaceItems, auth] = await Promise.all([getWorkspaces(), getAuthConfigCheck()])

        setWorkspaces(workspaceItems)
        setAuthReady(auth.auth_ready)
        setSelectedWorkspaceId(
          workspaceItems.some((workspace) => workspace.id === initialPreset.workspaceId)
            ? initialPreset.workspaceId
            : workspaceItems[0]?.id ?? '',
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    void loadInitial()
  }, [])

  useEffect(() => {
    async function loadTopology() {
      if (!selectedWorkspaceId) {
        setTopology(null)
        setSelectedNodeKey('')
        setNodeDetail(null)
        return
      }

      try {
        setTopologyLoading(true)
        setError('')

        const baseOptions = {
          resourceGroupName: focusedResourceGroupName || undefined,
          resourceGroupLimit: 20,
          resourceLimit: 80,
          includeNetworkInference,
          collapseManagedInstanceChildren: true,
        }

        const topologyItems = await Promise.all([
          getTopology(selectedWorkspaceId, baseOptions),
          ...expandedManagedInstanceRefs.map((expandedNodeRef) =>
            getTopology(selectedWorkspaceId, {
              ...baseOptions,
              expandedNodeRef,
            }),
          ),
        ])

        const topologyData = mergeTopologyResponses(topologyItems)

        setTopology(topologyData)
      } catch (err) {
        setTopology(null)
        setSelectedNodeKey('')
        setNodeDetail(null)
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setTopologyLoading(false)
      }
    }

    void loadTopology()
  }, [expandedManagedInstanceRefs, focusedResourceGroupName, includeNetworkInference, selectedWorkspaceId])

  const filteredTopology = useMemo(
    () => buildFilteredTopology(topology, resourceFilters, relationFilters, relationTypeFilters),
    [relationTypeFilters, relationFilters, resourceFilters, topology],
  )

  const searchResults = useMemo(
    () => searchTopologyNodes(filteredTopology.nodes, searchQuery, searchScope),
    [filteredTopology.nodes, searchQuery, searchScope],
  )

  const searchResultGroups = useMemo(
    () => buildSearchResultGroups(searchResults.slice(0, 12)),
    [searchResults],
  )

  const activeSearchResult = searchResults[searchResultIndex] ?? null
  const topologyNodesByRef = useMemo(() => {
    const map = new Map<string, TopologyNode>()

    for (const node of topology?.nodes ?? []) {
      map.set(node.node_ref, node)
    }

    return map
  }, [topology])

  useEffect(() => {
    const visibleKeys = new Set(filteredTopology.nodes.map((node) => node.node_key))
    if (selectedNodeKey && visibleKeys.has(selectedNodeKey)) {
      return
    }

    setSelectedNodeKey(filteredTopology.nodes[0]?.node_key ?? '')
  }, [filteredTopology.nodes, selectedNodeKey])

  useEffect(() => {
    if (!topology?.edges?.length) {
      return
    }

    setRelationTypeFilters((current) => {
      const next = { ...current }
      let changed = false

      for (const edge of topology.edges) {
        if (next[edge.relation_type] === undefined) {
          next[edge.relation_type] = true
          changed = true
        }
      }

      return changed ? next : current
    })
  }, [topology])

  useEffect(() => {
    setSearchResultIndex(0)
  }, [searchQuery, searchScope])

  useEffect(() => {
    if (!searchResults.length) {
      if (searchResultIndex !== 0) {
        setSearchResultIndex(0)
      }
      return
    }

    if (searchResultIndex > searchResults.length - 1) {
      setSearchResultIndex(searchResults.length - 1)
    }
  }, [searchResultIndex, searchResults])

  const selectedNode = useMemo(
    () => filteredTopology.nodes.find((node) => node.node_key === selectedNodeKey) ?? null,
    [filteredTopology.nodes, selectedNodeKey],
  )
  const selectedParentNode = useMemo(() => {
    const parentNode = getParentNode(selectedNode, topologyNodesByRef)
    return isManagedInstanceNode(parentNode) ? parentNode : null
  }, [selectedNode, topologyNodesByRef])
  const selectedPathStatus = selectedParentNode
    ? `path focus • ${selectedParentNode.display_name} → ${selectedNode?.display_name ?? '-'} (parent-child)`
    : selectedNode
      ? `path focus • ${selectedNode.display_name} neighborhood`
      : 'path focus • no selection'

  useEffect(() => {
    async function loadNodeDetail() {
      if (!selectedWorkspaceId || !selectedNode) {
        setNodeDetail(null)
        return
      }

      try {
        setDetailLoading(true)
        setNodeDetail(null)
        const detail = await getTopologyNodeDetail(
          selectedWorkspaceId,
          selectedNode.node_type,
          selectedNode.node_ref,
        )
        setNodeDetail(detail)
      } catch (err) {
        setNodeDetail({
          workspace_id: selectedWorkspaceId,
          node_key: selectedNode.node_key,
          node_type: selectedNode.node_type,
          node_ref: selectedNode.node_ref,
          display_name: selectedNode.display_name,
          source: selectedNode.source,
          confidence: selectedNode.confidence,
          status: 'error',
          message: err instanceof Error ? err.message : 'Unknown error',
          details: {},
        })
      } finally {
        setDetailLoading(false)
      }
    }

    void loadNodeDetail()
  }, [selectedNode, selectedWorkspaceId])

  const graphElements = useMemo(
    () =>
      buildGraphElements(filteredTopology.nodes, filteredTopology.edges, {
        clusterManagedInstanceChildren,
        expandedManagedInstanceRefs,
      }),
    [clusterManagedInstanceChildren, expandedManagedInstanceRefs, filteredTopology.edges, filteredTopology.nodes],
  )
  const layoutOptions = useMemo(
    () =>
      getLayoutOptions({
        compareGroupCount: expandedManagedInstanceRefs.length,
        clusterManagedInstanceChildren,
      }),
    [clusterManagedInstanceChildren, expandedManagedInstanceRefs.length],
  )

  useEffect(() => {
    writeTopologyPresetToUrl({
      workspaceId: selectedWorkspaceId,
      compareRefs: expandedManagedInstanceRefs,
      clusterChildren: clusterManagedInstanceChildren,
      scope: searchScope,
      query: searchQuery,
    })
  }, [clusterManagedInstanceChildren, expandedManagedInstanceRefs, searchQuery, searchScope, selectedWorkspaceId])

  useEffect(() => {
    if (!graphContainerRef.current) {
      return
    }

    if (!graphElements.length) {
      cyRef.current?.destroy()
      cyRef.current = null
      return
    }

    const cy = cytoscape({
      container: graphContainerRef.current,
      elements: graphElements,
      layout: layoutOptions,
      wheelSensitivity: 0.18,
      minZoom: 0.2,
      maxZoom: 2.2,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': '#3b82f6',
            label: 'data(label)',
            color: '#dbeafe',
            'font-size': 11,
            'text-wrap': 'wrap',
            'text-max-width': 150,
            'text-valign': 'bottom',
            'text-margin-y': 6,
            'text-outline-width': 2,
            'text-outline-color': '#0f172a',
            width: 36,
            height: 36,
            'border-width': 1.5,
            'border-color': '#93c5fd',
          },
        },
        {
          selector: 'node[nodeType = "subscription"]',
          style: {
            shape: 'round-rectangle',
            width: 88,
            height: 34,
            'font-size': 12,
            'background-color': '#1d4ed8',
            'border-color': '#bfdbfe',
          },
        },
        {
          selector: 'node[nodeType = "resourcegroup"]',
          style: {
            shape: 'round-rectangle',
            width: 58,
            height: 58,
            'background-color': '#2563eb',
          },
        },
        {
          selector: 'node[nodeType = "resource"][resourceType = "Microsoft.Sql/managedInstances"]',
          style: {
            width: 48,
            height: 48,
            shape: 'round-rectangle',
          },
        },
        {
          selector: 'node[nodeType = "resource"][resourceType = "Microsoft.Sql/managedInstances/databases"]',
          style: {
            width: 28,
            height: 28,
            'font-size': 9,
            'text-max-width': 100,
          },
        },
        {
          selector: 'node[nodeType = "resource"][resourceCategory = "data"]',
          style: {
            shape: 'ellipse',
            'background-color': '#06b6d4',
          },
        },
        {
          selector: 'node[nodeType = "resource"][resourceCategory = "network"]',
          style: {
            shape: 'ellipse',
            'background-color': '#10b981',
          },
        },
        {
          selector: 'node[nodeType = "resource"][resourceCategory = "web"]',
          style: {
            shape: 'ellipse',
            'background-color': '#8b5cf6',
          },
        },
        {
          selector: 'node[nodeType = "resource"][resourceCategory = "compute"]',
          style: {
            shape: 'ellipse',
            'background-color': '#3b82f6',
          },
        },
        {
          selector: 'node[nodeType = "resource"][resourceCategory = "other"]',
          style: {
            shape: 'ellipse',
            'background-color': '#64748b',
          },
        },
        {
          selector: 'node[collapsedChildren > 0]',
          style: {
            'border-width': 3,
            'border-color': '#fbbf24',
          },
        },
        {
          selector: 'node[nodeType = "resource"][resourceType = "Microsoft.Sql/managedInstances"][compareGroup > 0]',
          style: {
            width: 58,
            height: 58,
            'border-width': 4,
            'border-color': 'data(compareColor)',
            'background-color': 'data(compareColor)',
          },
        },
        {
          selector: 'node[nodeType = "resource"][resourceType = "Microsoft.Sql/managedInstances/databases"][compareGroup > 0]',
          style: {
            width: 32,
            height: 32,
            'border-width': 3,
            'border-color': 'data(compareColor)',
            'background-color': 'data(compareColor)',
          },
        },
        {
          selector: 'node:parent',
          style: {
            shape: 'round-rectangle',
            'background-opacity': 0.12,
            'background-color': '#38bdf8',
            'border-width': 2,
            'border-style': 'dashed',
            'border-color': '#7dd3fc',
            padding: '26px',
            'text-valign': 'top',
            'text-margin-y': -8,
          },
        },
        {
          selector: 'node:parent[compareGroup > 0]',
          style: {
            'background-color': 'data(compareColor)',
            'border-color': 'data(compareColor)',
            'background-opacity': 0.12,
            'border-width': 3,
            padding: '34px',
          },
        },
        {
          selector: 'node[source = "manual"]',
          style: {
            shape: 'diamond',
            'background-color': '#f59e0b',
            'border-color': '#fde68a',
            color: '#fef3c7',
          },
        },
        {
          selector: 'edge',
          style: {
            width: 2,
            'line-color': '#64748b',
            'target-arrow-color': '#64748b',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            color: '#cbd5e1',
            'font-size': 9,
            'text-rotation': 'autorotate',
            'text-background-color': '#0f172a',
            'text-background-opacity': 0.86,
            'text-background-padding': 2,
          },
        },
        {
          selector: 'edge[relationType = "contains"]',
          style: {
            'line-color': '#64748b',
            'target-arrow-color': '#64748b',
          },
        },
        {
          selector: 'edge[compareGroup > 0]',
          style: {
            width: 3,
            'line-color': 'data(compareColor)',
            'target-arrow-color': 'data(compareColor)',
          },
        },
        {
          selector: 'edge[relationType = "manages"]',
          style: {
            'line-style': 'dashed',
            'line-color': '#a78bfa',
            'target-arrow-color': '#a78bfa',
          },
        },
        {
          selector: 'edge[relationType = "connects_to"]',
          style: {
            'line-style': 'dashed',
            'line-color': '#14b8a6',
            'target-arrow-color': '#14b8a6',
          },
        },
        {
          selector: 'edge[relationType = "secures"]',
          style: {
            'line-style': 'dashed',
            'line-color': '#f59e0b',
            'target-arrow-color': '#f59e0b',
          },
        },
        {
          selector: 'edge[relationType = "routes"]',
          style: {
            'line-style': 'dotted',
            'line-color': '#22c55e',
            'target-arrow-color': '#22c55e',
          },
        },
        {
          selector: '.selected-node',
          style: {
            'border-width': 4,
            'border-color': '#f8fafc',
            'overlay-opacity': 0,
            'underlay-color': '#e0f2fe',
            'underlay-opacity': 0.2,
            'underlay-padding': 8,
          },
        },
        {
          selector: '.search-match',
          style: {
            'border-width': 3,
            'border-color': '#f472b6',
          },
        },
        {
          selector: '.search-active',
          style: {
            'border-width': 4,
            'border-color': '#f9a8d4',
          },
        },
        {
          selector: '.parent-path-node',
          style: {
            'border-width': 5,
            'border-color': '#67e8f9',
            'underlay-color': '#22d3ee',
            'underlay-opacity': 0.18,
            'underlay-padding': 12,
            color: '#ecfeff',
          },
        },
        {
          selector: '.parent-path-edge',
          style: {
            width: 7,
            'line-color': '#22d3ee',
            'target-arrow-color': '#22d3ee',
            label: 'data(pathLabel)',
            'font-size': 12,
            color: '#ecfeff',
            'font-weight': '700',
            'text-background-color': '#164e63',
            'text-background-opacity': 0.98,
            'text-background-padding': 5,
            'line-style': 'solid',
          },
        },
        {
          selector: '.selected-neighbor',
          style: {
            'border-width': 3,
            'border-color': '#7dd3fc',
          },
        },
        {
          selector: '.selected-edge',
          style: {
            width: 4,
            'line-color': '#38bdf8',
            'target-arrow-color': '#38bdf8',
            label: 'data(relationType)',
            'font-size': 10,
            color: '#e0f2fe',
            'text-background-color': '#0f172a',
            'text-background-opacity': 0.92,
            'text-background-padding': 3,
          },
        },
        {
          selector: '.hovered-node',
          style: {
            'border-width': 3,
            'border-color': '#fef08a',
          },
        },
        {
          selector: '.hovered-neighbor',
          style: {
            'border-width': 2,
            'border-color': '#fde68a',
          },
        },
        {
          selector: '.hovered-edge',
          style: {
            width: 4,
            'line-color': '#facc15',
            'target-arrow-color': '#facc15',
            label: 'data(relationType)',
          },
        },
        {
          selector: '.faded',
          style: {
            opacity: 0.22,
          },
        },
      ] as any,
    })

    const clearHoverState = () => {
      cy.elements().removeClass('hovered-node hovered-neighbor hovered-edge')
    }

    cy.on('tap', 'node', (event) => {
      setSelectedNodeKey(event.target.id())
    })

    cy.on('dbltap', 'node', (event) => {
      cy.animate({ fit: { eles: event.target.closedNeighborhood(), padding: 56 } }, { duration: 260 })
    })

    cy.on('mouseover', 'node', (event) => {
      clearHoverState()
      const node = event.target
      node.addClass('hovered-node')
      node.neighborhood('node').addClass('hovered-neighbor')
      node.connectedEdges().addClass('hovered-edge')
    })

    cy.on('mouseout', 'node', clearHoverState)

    cy.on('mouseover', 'edge', (event) => {
      clearHoverState()
      const edge = event.target
      edge.addClass('hovered-edge')
      edge.connectedNodes().addClass('hovered-neighbor')
    })

    cy.on('mouseout', 'edge', clearHoverState)

    cy.ready(() => {
      cy.fit(undefined, 36)
    })

    cyRef.current = cy

    return () => {
      cy.destroy()
      if (cyRef.current === cy) {
        cyRef.current = null
      }
    }
  }, [graphElements, layoutOptions])

  useEffect(() => {
    const cy = cyRef.current
    if (!cy) {
      return
    }

    cy.batch(() => {
      cy.elements().removeClass('selected-node selected-neighbor selected-edge parent-path-node parent-path-edge faded')

      if (!selectedNodeKey) {
        return
      }

      const selected = cy.getElementById(selectedNodeKey)
      if (!selected.nonempty()) {
        return
      }

      const neighborhood = selected.closedNeighborhood()
      cy.elements().difference(neighborhood).addClass('faded')
      selected.addClass('selected-node')
      selected.neighborhood('node').addClass('selected-neighbor')
      selected.connectedEdges().addClass('selected-edge')

      const selectedNodeParentResourceId = String(selected.data('parentResourceId') ?? '')
      if (!selectedNodeParentResourceId) {
        return
      }

      const parentNode = cy
        .nodes()
        .filter((node) => String(node.data('nodeRef') ?? '') === selectedNodeParentResourceId)
        .first()

      if (!parentNode.nonempty()) {
        return
      }

      parentNode.addClass('parent-path-node')
      cy.edges()
        .filter(
          (edge) => edge.data('source') === parentNode.id() && edge.data('target') === selectedNodeKey,
        )
        .addClass('parent-path-edge')
    })
  }, [graphElements, selectedNodeKey])

  useEffect(() => {
    const cy = cyRef.current
    if (!cy) {
      return
    }

    cy.batch(() => {
      cy.nodes().removeClass('search-match search-active')

      if (!searchResults.length) {
        return
      }

      searchResults.slice(0, 32).forEach((result, index) => {
        const node = cy.getElementById(result.node.node_key)
        if (!node.nonempty()) {
          return
        }

        node.addClass('search-match')
        if (index === searchResultIndex) {
          node.addClass('search-active')
        }
      })
    })
  }, [graphElements, searchResultIndex, searchResults])

  useEffect(() => {
    if (!pendingFocusNodeKey) {
      return
    }

    focusNodeByKey(pendingFocusNodeKey)
    setPendingFocusNodeKey('')
  }, [graphElements, pendingFocusNodeKey])

  useEffect(() => {
    if (!topologyLoading && managedInstanceTransition) {
      setManagedInstanceTransition('')
    }
  }, [managedInstanceTransition, topologyLoading])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setSelectedNodeKey('')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const loadedSummary = useMemo(() => {
    const nodes = topology?.nodes ?? []
    const edges = topology?.edges ?? []

    return {
      totalNodes: topology?.summary?.node_count ?? nodes.length,
      totalEdges: topology?.summary?.edge_count ?? edges.length,
      subscriptions:
        topology?.summary?.subscription_count ??
        nodes.filter((node) => node.node_type === 'subscription').length,
      resourceGroups:
        topology?.summary?.resource_group_count ??
        nodes.filter((node) => node.node_type === 'resourcegroup').length,
      resources: topology?.summary?.resource_count ?? nodes.filter((node) => node.node_type === 'resource').length,
      hiddenResources: topology?.summary?.hidden_resource_count ?? 0,
      manualNodes: nodes.filter((node) => node.source === 'manual').length,
    }
  }, [topology])

  const visibleSummary = useMemo(() => {
    const nodes = filteredTopology.nodes
    const edges = filteredTopology.edges

    return {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      subscriptions: nodes.filter((node) => node.node_type === 'subscription').length,
      resourceGroups: nodes.filter((node) => node.node_type === 'resourcegroup').length,
      resources: nodes.filter((node) => node.node_type === 'resource').length,
      manualNodes: nodes.filter((node) => node.source === 'manual').length,
    }
  }, [filteredTopology.edges, filteredTopology.nodes])

  const nodeTypeCounts = useMemo<CountItem[]>(() => {
    const counts = new Map<string, number>()

    for (const node of filteredTopology.nodes) {
      counts.set(node.node_type, (counts.get(node.node_type) ?? 0) + 1)
    }

    return [...counts.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((left, right) => right.count - left.count)
  }, [filteredTopology.nodes])

  const relationCounts = useMemo<CountItem[]>(() => {
    const counts = new Map<string, number>()
    for (const edge of filteredTopology.edges) {
      counts.set(edge.relation_type, (counts.get(edge.relation_type) ?? 0) + 1)
    }

    return [...counts.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((left, right) => right.count - left.count)
  }, [filteredTopology.edges])

  const loadedRelationCounts = useMemo<CountItem[]>(() => {
    const counts = new Map<string, number>()
    for (const edge of topology?.edges ?? []) {
      counts.set(edge.relation_type, (counts.get(edge.relation_type) ?? 0) + 1)
    }

    return [...counts.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((left, right) => right.count - left.count)
  }, [topology])

  const relationCategoryCounts = useMemo<CountItem[]>(() => {
    const counts = new Map<RelationCategory, number>()
    for (const edge of topology?.edges ?? []) {
      const category = getRelationCategory(edge)
      counts.set(category, (counts.get(category) ?? 0) + 1)
    }

    return (['structural', 'network', 'other'] as RelationCategory[])
      .map((key) => ({ key, count: counts.get(key) ?? 0 }))
      .filter((item) => item.count > 0)
  }, [topology])

  const edgePreview = useMemo(() => filteredTopology.edges.slice(0, 16), [filteredTopology.edges])
  const detailEntries = useMemo(() => Object.entries(nodeDetail?.details ?? {}), [nodeDetail])
  const searchScopeMeta = useMemo(() => getSearchScopeMeta(searchScope), [searchScope])
  const compareMetaByRef = useMemo(
    () =>
      new Map(
        expandedManagedInstanceRefs.map((ref, index) => [
          ref,
          {
            group: index + 1,
            color: getCompareColor(index + 1),
          },
        ]),
      ),
    [expandedManagedInstanceRefs],
  )
  const expandedManagedInstances = useMemo(
    () =>
      (topology?.nodes ?? []).filter(
        (node) => isManagedInstanceNode(node) && expandedManagedInstanceRefs.includes(node.node_ref),
      ),
    [expandedManagedInstanceRefs, topology],
  )
  const compareLayoutStatus =
    expandedManagedInstanceRefs.length >= 2
      ? `compare lane mode • ${expandedManagedInstanceRefs.length} MI horizontal spread`
      : clusterManagedInstanceChildren
        ? 'cluster layout mode • MI child compound grouping on'
        : 'default topology layout'
  const managedInstanceExpanded = selectedNode
    ? expandedManagedInstanceRefs.includes(selectedNode.node_ref)
    : false
  const resourceGroupFocused = selectedNode ? focusedResourceGroupName === selectedNode.display_name : false
  const managedInstanceChildSampleNames = useMemo(
    () => getManagedInstanceChildSampleNames(selectedNode, nodeDetail).slice(0, 5),
    [nodeDetail, selectedNode],
  )
  const visibleManagedInstanceChildCount = useMemo(() => {
    if (!selectedNode || !isManagedInstanceNode(selectedNode)) {
      return 0
    }

    return filteredTopology.nodes.filter(
      (node) => node.parent_resource_id === selectedNode.node_ref,
    ).length
  }, [filteredTopology.nodes, selectedNode])

  function fitGraph() {
    const cy = cyRef.current
    if (!cy) {
      return
    }
    cy.fit(undefined, 36)
  }

  function rerunLayout() {
    const cy = cyRef.current
    if (!cy) {
      return
    }
    cy.layout(layoutOptions).run()
  }

  function focusNodeByKey(nodeKey: string) {
    const cy = cyRef.current
    if (!cy || !nodeKey) {
      return
    }

    const selected = cy.getElementById(nodeKey)
    if (!selected.nonempty()) {
      return
    }

    cy.animate({ fit: { eles: selected.closedNeighborhood(), padding: 56 } }, { duration: 260 })
  }

  function selectNode(nodeKey: string, options?: { focus?: boolean }) {
    setSelectedNodeKey(nodeKey)

    if (options?.focus) {
      focusNodeByKey(nodeKey)
    }
  }

  function focusSelection() {
    focusNodeByKey(selectedNodeKey)
  }

  function expandManagedInstanceNode(node: TopologyNode, options?: { switchToChildScope?: boolean }) {
    if (!isManagedInstanceNode(node) || !node.child_summary?.total) {
      return
    }

    setSelectedNodeKey(node.node_key)
    setPendingFocusNodeKey(node.node_key)

    if (options?.switchToChildScope) {
      setSearchScope('child-only')
    }

    if (expandedManagedInstanceRefs.includes(node.node_ref)) {
      return
    }

    setManagedInstanceTransition('expand')
    setExpandedManagedInstanceRefs((current) => [...current, node.node_ref])
  }

  function collapseManagedInstanceNode(nodeRef: string) {
    setManagedInstanceTransition('collapse')
    setExpandedManagedInstanceRefs((current) => current.filter((item) => item !== nodeRef))
  }

  function clearManagedInstanceCompare() {
    if (!expandedManagedInstanceRefs.length) {
      return
    }

    setManagedInstanceTransition('collapse')
    setExpandedManagedInstanceRefs([])
  }

  async function handleCopyPresetLink() {
    if (typeof window === 'undefined' || !navigator.clipboard) {
      setExportMessage('Preset link copy unsupported in this browser')
      return
    }

    try {
      await navigator.clipboard.writeText(window.location.href)
      setExportMessage('Preset link copied')
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : 'Preset link copy failed')
    }
  }

  function jumpToSearchResult(index: number) {
    if (!searchResults.length) {
      return
    }

    const normalizedIndex = ((index % searchResults.length) + searchResults.length) % searchResults.length
    const result = searchResults[normalizedIndex]
    setSearchResultIndex(normalizedIndex)
    selectNode(result.node.node_key, { focus: true })
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    jumpToSearchResult(searchResultIndex)
  }

  async function handleExportPng() {
    const cy = cyRef.current
    if (!cy || !selectedWorkspaceId) {
      return
    }

    try {
      setExportLoading(true)
      setExportMessage('')

      const imageDataUrl = cy.png({
        full: true,
        scale: 2,
        bg: '#0b1220',
      })

      const exportRecord = await createPngExport(selectedWorkspaceId, imageDataUrl)
      setLastExport(exportRecord)
      setExportMessage(`저장 완료: ${exportRecord.output_path}`)
    } catch (err) {
      setExportMessage(err instanceof Error ? err.message : 'PNG export failed')
    } finally {
      setExportLoading(false)
    }
  }

  function toggleResourceFilter(category: ResourceCategory) {
    setResourceFilters((current) => ({
      ...current,
      [category]: !current[category],
    }))
  }

  function toggleRelationFilter(category: RelationCategory) {
    setRelationFilters((current) => ({
      ...current,
      [category]: !current[category],
    }))
  }

  function toggleRelationTypeFilter(relationType: string) {
    setRelationTypeFilters((current) => ({
      ...current,
      [relationType]: !(current[relationType] ?? true),
    }))
  }

  function resetRelationFilters() {
    setRelationFilters(DEFAULT_RELATION_FILTERS)
    setRelationTypeFilters((current) => {
      const next: RelationTypeFilterState = { ...current }
      for (const key of Object.keys(next)) {
        next[key] = true
      }
      return next
    })
  }

  function toggleManagedInstanceExpansion() {
    if (!selectedNode || !isManagedInstanceNode(selectedNode) || !selectedNode.child_summary?.total) {
      return
    }

    if (managedInstanceExpanded) {
      setPendingFocusNodeKey(selectedNode.node_key)
      collapseManagedInstanceNode(selectedNode.node_ref)
      return
    }

    expandManagedInstanceNode(selectedNode)
  }

  function toggleResourceGroupFocus() {
    if (!selectedNode || !isResourceGroupNode(selectedNode)) {
      return
    }

    setExpandedManagedInstanceRefs([])
    setFocusedResourceGroupName((current) =>
      current === selectedNode.display_name ? '' : selectedNode.display_name,
    )
  }

  return (
    <main className="page-shell">
      <header className="hero-card">
        <div>
          <p className="eyebrow">AzVision</p>
          <h1>Phase 1A Readability + MI Collapse</h1>
          <p className="subtext">
            dagre layout, network inference 토글, resource filter, managed instance child collapse, on-demand expand까지 반영한 상태.
          </p>
        </div>
        <div className={`status-pill ${authReady ? 'ready' : 'pending'}`}>
          Auth readiness: {authReady ? 'live inventory ready' : 'diagnostic only'}
        </div>
      </header>

      {error ? <div className="error-banner">API 연결 오류: {error}</div> : null}
      {topology?.status === 'error' ? (
        <div className="error-banner">Topology 오류: {topology.message ?? 'Unknown error'}</div>
      ) : null}
      {exportMessage ? <div className="info-banner">{exportMessage}</div> : null}

      <section className="panel-grid">
        <article className="panel-card">
          <h2>Workspace</h2>
          {loading ? (
            <p>불러오는 중...</p>
          ) : (
            <>
              <select
                value={selectedWorkspaceId}
                onChange={(event) => {
                  setExpandedManagedInstanceRefs([])
                  setFocusedResourceGroupName('')
                  setSelectedWorkspaceId(event.target.value)
                }}
              >
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
              <p className="hint">
                Generated at: {formatDateTime(topology?.generated_at)}
                {topology?.mode ? ` • ${topology.mode}` : ''}
              </p>
            </>
          )}
        </article>

        <article className="panel-card">
          <h2>Visible Summary</h2>
          <div className="summary-grid summary-grid-wide">
            <div className="metric-box">
              <span className="metric-label">Visible Nodes</span>
              <strong>{visibleSummary.totalNodes}</strong>
              <small>loaded {loadedSummary.totalNodes}</small>
            </div>
            <div className="metric-box">
              <span className="metric-label">Visible Edges</span>
              <strong>{visibleSummary.totalEdges}</strong>
              <small>loaded {loadedSummary.totalEdges}</small>
            </div>
            <div className="metric-box">
              <span className="metric-label">Collapsed Children</span>
              <strong>{loadedSummary.hiddenResources}</strong>
              <small>MI children hidden by default</small>
            </div>
            <div className="metric-box">
              <span className="metric-label">Subscriptions</span>
              <strong>{visibleSummary.subscriptions}</strong>
            </div>
            <div className="metric-box">
              <span className="metric-label">Resource Groups</span>
              <strong>{visibleSummary.resourceGroups}</strong>
            </div>
            <div className="metric-box">
              <span className="metric-label">Resources</span>
              <strong>{visibleSummary.resources}</strong>
            </div>
            <div className="metric-box">
              <span className="metric-label">Expanded MI Compare</span>
              <strong>{expandedManagedInstances.length}</strong>
              <small>{clusterManagedInstanceChildren ? 'compound cluster on' : 'compound cluster off'}</small>
            </div>
          </div>
        </article>
      </section>

      <section className="panel-grid controls-layout">
        <article className="panel-card">
          <div className="section-heading">
            <h2>Graph Controls</h2>
            <button type="button" className="toolbar-button" onClick={resetRelationFilters}>
              Reset relation filters
            </button>
          </div>

          <div className="control-grid">
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={includeNetworkInference}
                onChange={(event) => setIncludeNetworkInference(event.target.checked)}
              />
              <span>Network inference 불러오기</span>
            </label>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={clusterManagedInstanceChildren}
                onChange={(event) => setClusterManagedInstanceChildren(event.target.checked)}
              />
              <span>Managed Instance child cluster view</span>
            </label>
          </div>

          <h3 className="section-spacer">Managed Instance Compare</h3>
          <div className="section-heading compare-heading">
            <span className="mini-status">
              {expandedManagedInstances.length
                ? `${expandedManagedInstances.length} MI expanded for compare`
                : 'compare 대상 없음'}
            </span>
            <div className="button-row">
              <button type="button" className="toolbar-button" onClick={handleCopyPresetLink}>
                Copy preset link
              </button>
              <button
                type="button"
                className="toolbar-button"
                onClick={clearManagedInstanceCompare}
                disabled={!expandedManagedInstances.length || topologyLoading}
              >
                Collapse all MI
              </button>
            </div>
          </div>
          {expandedManagedInstances.length ? (
            <div className="compare-chip-grid">
              {expandedManagedInstances.map((node) => (
                <div
                  key={node.node_ref}
                  className="compare-chip-card"
                  style={{
                    borderLeft: `4px solid ${compareMetaByRef.get(node.node_ref)?.color ?? '#38bdf8'}`,
                  }}
                >
                  <span
                    className="compare-color-dot"
                    style={{ backgroundColor: compareMetaByRef.get(node.node_ref)?.color ?? '#38bdf8' }}
                  />
                  <button
                    type="button"
                    className="filter-chip active"
                    style={{ borderColor: compareMetaByRef.get(node.node_ref)?.color ?? '#38bdf8' }}
                    onClick={() => selectNode(node.node_key, { focus: true })}
                  >
                    G{compareMetaByRef.get(node.node_ref)?.group ?? 0} • {node.display_name}
                  </button>
                  <button
                    type="button"
                    className="toolbar-button search-inline-button"
                    onClick={() => collapseManagedInstanceNode(node.node_ref)}
                    disabled={topologyLoading}
                  >
                    Collapse
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="hint">collapsed preview 결과나 detail panel에서 여러 MI를 동시에 expand해 비교 가능</p>
          )}

          <h3 className="section-spacer">Relation Categories</h3>
          <div className="filter-chip-grid">
            {relationCategoryCounts.map((item) => {
              const key = item.key as RelationCategory
              return (
                <button
                  key={item.key}
                  type="button"
                  className={`filter-chip ${relationFilters[key] ? 'active' : ''}`}
                  onClick={() => toggleRelationFilter(key)}
                >
                  <span>{item.key}</span>
                  <strong className="chip-count">{item.count}</strong>
                </button>
              )
            })}
          </div>

          <h3 className="section-spacer">Relation Types</h3>
          <div className="filter-chip-grid">
            {loadedRelationCounts.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`filter-chip ${relationTypeFilters[item.key] ?? true ? 'active' : ''}`}
                onClick={() => toggleRelationTypeFilter(item.key)}
              >
                <span>{item.key}</span>
                <strong className="chip-count">{item.count}</strong>
              </button>
            ))}
          </div>
        </article>

        <article className="panel-card">
          <h2>Resource Filters</h2>
          <div className="filter-chip-grid">
            {(['compute', 'data', 'network', 'web', 'other'] as ResourceCategory[]).map((category) => (
              <button
                key={category}
                type="button"
                className={`filter-chip ${resourceFilters[category] ? 'active' : ''}`}
                onClick={() => toggleResourceFilter(category)}
              >
                {category}
              </button>
            ))}
          </div>
          <p className="hint">subscription / resource group / manual node는 항상 유지.</p>
          <p className="hint">
            RG lazy load: {focusedResourceGroupName ? focusedResourceGroupName : 'all resource groups'}
          </p>
        </article>
      </section>

      <section className="panel-grid canvas-layout">
        <article className="panel-card canvas-card">
          <div className="section-heading">
            <h2>Cytoscape Canvas</h2>
            <span className="mini-status">
              {topologyLoading
                ? 'syncing...'
                : `${filteredTopology.nodes.length} visible / ${topology?.nodes.length ?? 0} loaded`}
            </span>
          </div>

          <p className="hint compare-layout-hint">Layout: {compareLayoutStatus}</p>
          <p className="hint compare-layout-hint compare-path-hint">Selection: {selectedPathStatus}</p>

          <div className="graph-toolbar">
            <div className="button-row">
              <button type="button" className="toolbar-button" onClick={fitGraph}>
                Fit view
              </button>
              <button type="button" className="toolbar-button" onClick={focusSelection}>
                Focus selection
              </button>
              <button type="button" className="toolbar-button" onClick={rerunLayout}>
                Relayout
              </button>
              <button
                type="button"
                className="toolbar-button primary"
                onClick={handleExportPng}
                disabled={exportLoading}
              >
                {exportLoading ? 'Exporting...' : 'Export PNG'}
              </button>
            </div>

            <div className="search-toolbar">
              <div className="section-heading search-heading">
                <h3>Search / Quick Jump</h3>
                <span className="mini-status">
                  {searchQuery
                    ? `${searchResults.length} match${searchResults.length === 1 ? '' : 'es'} • ${
                        searchScopeMeta.label
                      } • ${
                        activeSearchResult ? `active ${searchResultIndex + 1}/${searchResults.length}` : 'visible nodes only'
                      }`
                    : `search ${searchScopeMeta.label.toLowerCase()}`}
                </span>
              </div>

              <div className="filter-chip-grid search-scope-grid">
                {(
                  [
                    ['visible', 'Visible'],
                    ['child-only', 'Child only'],
                    ['collapsed-preview', 'Collapsed preview'],
                  ] as [SearchScope, string][]
                ).map(([scope, label]) => (
                  <button
                    key={scope}
                    type="button"
                    className={`filter-chip ${searchScope === scope ? 'active' : ''}`}
                    onClick={() => setSearchScope(scope)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="hint search-scope-hint">{searchScopeMeta.hint}</p>

              <form className="search-form" onSubmit={handleSearchSubmit}>
                <input
                  type="text"
                  className="search-input"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowDown') {
                      event.preventDefault()
                      jumpToSearchResult(searchResultIndex + 1)
                    }

                    if (event.key === 'ArrowUp') {
                      event.preventDefault()
                      jumpToSearchResult(searchResultIndex - 1)
                    }

                    if (event.key === 'Escape') {
                      event.preventDefault()
                      setSearchQuery('')
                    }
                  }}
                  placeholder={searchScopeMeta.placeholder}
                />

                <div className="button-row search-actions">
                  <button
                    type="button"
                    className="toolbar-button"
                    onClick={() => jumpToSearchResult(searchResultIndex - 1)}
                    disabled={!searchResults.length}
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    className="toolbar-button"
                    onClick={() => jumpToSearchResult(searchResultIndex + 1)}
                    disabled={!searchResults.length}
                  >
                    Next
                  </button>
                  <button
                    type="submit"
                    className="toolbar-button primary"
                    disabled={!searchResults.length}
                  >
                    Jump
                  </button>
                  <button
                    type="button"
                    className="toolbar-button"
                    onClick={() => setSearchQuery('')}
                    disabled={!searchQuery}
                  >
                    Clear
                  </button>
                </div>
              </form>

              {searchQuery ? (
                searchResults.length ? (
                  <div className="search-group-list compact-list">
                    {searchResultGroups.map((group) => (
                      <section key={group.key} className="search-group-card">
                        <div className="search-group-header">
                          <strong>{group.label}</strong>
                          <span className="chip-count">{group.results.length}</span>
                        </div>

                        <ul className="search-result-list">
                          {group.results.map((result) => {
                            const originalIndex = searchResults.findIndex(
                              (candidate) => candidate.node.node_key === result.node.node_key,
                            )
                            const isActive = originalIndex === searchResultIndex
                            const parentNode = getParentNode(result.node, topologyNodesByRef)
                            const managedInstanceParent = isManagedInstanceNode(parentNode) ? parentNode : null
                            const canExpandManagedInstance =
                              isManagedInstanceNode(result.node) &&
                              Boolean(result.node.child_summary?.total) &&
                              !expandedManagedInstanceRefs.includes(result.node.node_ref)
                            const canCollapseManagedInstance =
                              isManagedInstanceNode(result.node) &&
                              expandedManagedInstanceRefs.includes(result.node.node_ref)
                            return (
                              <li key={result.node.node_key}>
                                <div className="search-result-card">
                                  <button
                                    type="button"
                                    className={`search-result-button ${isActive ? 'active' : ''}`}
                                    onClick={() => jumpToSearchResult(originalIndex)}
                                  >
                                    <div>
                                      <strong>{result.node.display_name}</strong>
                                      <p>{getNodeMetaLine(result.node)}</p>
                                      {searchScope === 'child-only' && managedInstanceParent ? (
                                        <div className="search-result-breadcrumb">
                                          <span className="mini-chip">Parent MI</span>
                                          <span className="breadcrumb-value">{managedInstanceParent.display_name}</span>
                                        </div>
                                      ) : null}
                                      {result.matchedPreviewNames?.length ? (
                                        <p className="search-result-preview">
                                          child preview: {result.matchedPreviewNames.join(', ')}
                                        </p>
                                      ) : null}
                                      <p className="search-result-meta">
                                        match: {result.matchedFields.join(', ') || 'name'} • score {result.score}
                                      </p>
                                    </div>
                                    <span className={`tag category-${getResourceCategory(result.node)}`}>
                                      {getResourceCategory(result.node)}
                                    </span>
                                  </button>

                                  {canExpandManagedInstance || canCollapseManagedInstance || (searchScope === 'child-only' && managedInstanceParent) ? (
                                    <div className="search-result-actions">
                                      {canExpandManagedInstance ? (
                                        <button
                                          type="button"
                                          className="toolbar-button search-inline-button"
                                          onClick={() => expandManagedInstanceNode(result.node)}
                                          disabled={topologyLoading}
                                        >
                                          Add to compare
                                        </button>
                                      ) : null}

                                      {canCollapseManagedInstance ? (
                                        <button
                                          type="button"
                                          className="toolbar-button search-inline-button"
                                          onClick={() => collapseManagedInstanceNode(result.node.node_ref)}
                                          disabled={topologyLoading}
                                        >
                                          Collapse compare
                                        </button>
                                      ) : null}

                                      {searchScope === 'child-only' && managedInstanceParent ? (
                                        <button
                                          type="button"
                                          className="toolbar-button search-inline-button"
                                          onClick={() => selectNode(managedInstanceParent.node_key, { focus: true })}
                                        >
                                          Focus parent MI
                                        </button>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </div>
                              </li>
                            )
                          })}
                        </ul>
                      </section>
                    ))}
                  </div>
                ) : (
                  <p className="hint">{searchScopeMeta.empty}</p>
                )
              ) : null}
            </div>

            <div className="graph-legend">
              <span className="legend-item subscription">Subscription</span>
              <span className="legend-item resourcegroup">Resource Group</span>
              <span className="legend-item resource-data">Data</span>
              <span className="legend-item resource-network">Network</span>
              <span className="legend-item resource-web">Web</span>
              <span className="legend-item resource-compute">Compute</span>
            </div>
            <div className="graph-legend relation-legend">
              {loadedRelationCounts.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`legend-item legend-button ${getRelationLegendClassName(item.key)} ${
                    (relationTypeFilters[item.key] ?? true) ? 'active' : 'inactive'
                  }`}
                  onClick={() => toggleRelationTypeFilter(item.key)}
                >
                  {item.key} ({item.count})
                </button>
              ))}
            </div>
          </div>

          <div ref={graphContainerRef} className="graph-canvas" />

          <p className="hint export-hint">
            Tip: `Esc`로 선택 해제, node double-click으로 focus 가능, SQL Managed Instance는 detail panel에서 child expand 가능
          </p>
          {lastExport ? (
            <p className="hint export-hint">
              Last export: {formatDateTime(lastExport.created_at)} • {lastExport.output_path}
            </p>
          ) : null}
        </article>

        <article className="panel-card detail-card">
          <div className="section-heading">
            <h2>Node Detail</h2>
            <span className="mini-status">{detailLoading ? 'loading...' : selectedNode?.node_type ?? '-'}</span>
          </div>

          {selectedNode ? (
            <div className="detail-stack">
              <div className="detail-hero">
                <strong>{selectedNode.display_name}</strong>
                <p>{selectedNode.node_key}</p>
                {selectedParentNode ? (
                  <div className="detail-breadcrumb-row">
                    <span className="mini-chip">Parent MI</span>
                    <strong className="detail-breadcrumb-value">{selectedParentNode.display_name}</strong>
                  </div>
                ) : null}
              </div>

              <div className="detail-grid">
                <div className="detail-item">
                  <span>Source</span>
                  <strong>{selectedNode.source}</strong>
                </div>
                <div className="detail-item">
                  <span>Confidence</span>
                  <strong>{selectedNode.confidence}</strong>
                </div>
                <div className="detail-item">
                  <span>Category</span>
                  <strong>{getResourceCategory(selectedNode)}</strong>
                </div>
                <div className="detail-item">
                  <span>Location</span>
                  <strong>{selectedNode.location ?? '-'}</strong>
                </div>
              </div>

              {isResourceGroupNode(selectedNode) ? (
                <div className="detail-item">
                  <span>Resource Group Lazy Load</span>
                  <strong>{resourceGroupFocused ? 'Focused' : 'All resource groups loaded'}</strong>
                  <p className="hint detail-inline-hint">
                    {resourceGroupFocused
                      ? `${selectedNode.display_name} 리소스만 서버에서 로드 중`
                      : '이 Resource Group만 서버에서 따로 로드 가능'}
                  </p>
                  <div className="button-row detail-button-row">
                    <button type="button" className="toolbar-button" onClick={toggleResourceGroupFocus}>
                      {resourceGroupFocused ? 'Load all resource groups' : 'Load only this resource group'}
                    </button>
                  </div>
                </div>
              ) : null}

              {selectedParentNode ? (
                <div className="detail-item">
                  <span>Parent Managed Instance</span>
                  <strong>{selectedParentNode.display_name}</strong>
                  <p className="hint detail-inline-hint">
                    child node 탐색 중에도 부모 MI로 바로 복귀 가능
                  </p>
                  <div className="button-row detail-button-row">
                    <button
                      type="button"
                      className="toolbar-button"
                      onClick={() => selectNode(selectedParentNode.node_key, { focus: true })}
                    >
                      Focus parent managed instance
                    </button>
                  </div>
                </div>
              ) : null}

              {isManagedInstanceNode(selectedNode) && selectedNode.child_summary?.total ? (
                <div className="detail-item">
                  <span>Managed Instance Children</span>
                  <strong>
                    {managedInstanceExpanded
                      ? `Expanded on canvas (${visibleManagedInstanceChildCount} visible)`
                      : `${selectedNode.child_summary.total} available`}
                  </strong>
                  <p className="hint detail-inline-hint">{formatChildSummary(selectedNode.child_summary)}</p>
                  {managedInstanceChildSampleNames.length ? (
                    <div className="sample-chip-list">
                      {managedInstanceChildSampleNames.map((name) => (
                        <span key={name} className="sample-chip">
                          {name}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="button-row detail-button-row">
                    <button
                      type="button"
                      className="toolbar-button"
                      onClick={toggleManagedInstanceExpansion}
                      disabled={topologyLoading}
                    >
                      {managedInstanceTransition === 'expand'
                        ? 'Expanding child databases...'
                        : managedInstanceTransition === 'collapse'
                          ? 'Collapsing child databases...'
                          : managedInstanceExpanded
                            ? 'Collapse child databases'
                            : 'Expand child databases'}
                    </button>
                    <button type="button" className="toolbar-button" onClick={focusSelection}>
                      Focus managed instance
                    </button>
                  </div>
                  <p className="hint detail-inline-hint">
                    {managedInstanceExpanded
                      ? '확장 후 selected node 주변으로 다시 focus 유지'
                      : 'expand 시 child DB node를 canvas에 펼쳐서 확인 가능'}
                  </p>
                </div>
              ) : null}

              {nodeDetail?.message ? <div className="hint">{nodeDetail.message}</div> : null}

              <div>
                <h3>Projected Details</h3>
                {detailEntries.length ? (
                  <dl className="detail-list">
                    {detailEntries.map(([key, value]) => (
                      <div key={key} className="detail-row">
                        <dt>{prettifyKey(key)}</dt>
                        <dd>
                          {typeof value === 'object' && value !== null
                            ? JSON.stringify(value)
                            : String(value)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="hint">세부 정보 없음</p>
                )}
              </div>
            </div>
          ) : (
            <p className="hint">선택된 node 없음</p>
          )}
        </article>
      </section>

      <section className="panel-grid three-panels">
        <article className="panel-card">
          <div className="section-heading">
            <h2>Visible Nodes</h2>
            <span className="mini-status">
              {selectedNode ? `selected: ${selectedNode.display_name}` : 'no selection'}
            </span>
          </div>
          <ul className="node-list interactive-list compact-list">
            {filteredTopology.nodes.map((node) => {
              const isSelected = node.node_key === selectedNodeKey
              const parentNode = getParentNode(node, topologyNodesByRef)
              const managedInstanceParent = isManagedInstanceNode(parentNode) ? parentNode : null
              return (
                <li key={node.node_key}>
                  <button
                    type="button"
                    className={`node-button ${isSelected ? 'selected' : ''}`}
                    onClick={() => selectNode(node.node_key)}
                  >
                    <div>
                      <strong>{node.display_name}</strong>
                      <p>{getNodeMetaLine(node)}</p>
                      {managedInstanceParent ? (
                        <p className="node-parent-meta">
                          parent MI: {managedInstanceParent.display_name}
                        </p>
                      ) : null}
                      <p className="key-text">{node.node_key}</p>
                    </div>
                    <span className={`tag category-${getResourceCategory(node)}`}>{getResourceCategory(node)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </article>

        <article className="panel-card">
          <h2>Composition</h2>
          <div className="composition-list">
            {nodeTypeCounts.map((item) => (
              <div key={item.key} className="composition-row">
                <span>{item.key}</span>
                <strong>{item.count}</strong>
              </div>
            ))}
          </div>

          <h3 className="section-spacer">Relation Types</h3>
          <div className="composition-list">
            {relationCounts.map((item) => (
              <div key={item.key} className="composition-row relation-row">
                <span>{item.key}</span>
                <strong>{item.count}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="panel-card">
          <h2>Edge Preview</h2>
          <ul className="edge-list compact-list">
            {edgePreview.map((edge) => (
              <li key={`${edge.source_node_key}-${edge.relation_type}-${edge.target_node_key}`}>
                <strong>{edge.relation_type}</strong>
                <p>{edge.source_node_key}</p>
                <p>→ {edge.target_node_key}</p>
              </li>
            ))}
          </ul>
        </article>
      </section>
    </main>
  )
}
