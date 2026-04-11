import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import type { Core } from 'cytoscape'

import {
  createExport,
  getAuthConfigCheck,
  getTopology,
  getTopologyNodeDetail,
  getWorkspaces,
  type ExportItem,
  type TopologyNode,
  type TopologyNodeDetail,
  type TopologyResponse,
  type Workspace,
} from '../lib/api'
import { loadCytoscapeRuntime } from './topology/cytoscape'
import { CYTOSCAPE_STYLE } from './topology/cytoscape-style'
import {
  DEFAULT_RELATION_FILTERS,
  DEFAULT_RELATION_TYPE_FILTERS,
  DEFAULT_RESOURCE_FILTERS,
  SNAPSHOT_STORAGE_WARN_BYTES,
  TOPOLOGY_PRESET_VERSION,
  UI_TEXT,
  type CountItem,
  type ImportedPresetPayload,
  type ImportedSnapshotPayload,
  type RelationCategory,
  type RelationFilterState,
  type RelationTypeFilterState,
  type ResourceCategory,
  type ResourceFilterState,
  type SavedTopologyPreset,
  type SavedTopologySnapshot,
  type SearchScope,
  type TopologyPresetState,
} from './topology/model'
import { buildSearchResultGroups, getSearchScopeMeta, searchTopologyNodes } from './topology/search'
import {
  arePresetStatesEqual,
  buildSnapshotThumbnailDataUrl,
  consumeTopologySnapshotStorageWarning,
  createSnapshotNoticeFingerprint,
  createSnapshotStorageProvider,
  createPresetId,
  createUniquePresetName,
  estimateSerializedBytes,
  getSnapshotNoticeAcknowledgedFingerprint,
  getSnapshotStorageMode,
  importSnapshotsToStorage,
  loadLocalSnapshotsForWorkspace,
  loadSavedTopologyPresets,
  normalizeImportedPresetPayload,
  normalizeImportedSnapshotPayload,
  persistSavedTopologyPresets,
  readTopologyPresetFromUrl,
  sanitizePresetState,
  sanitizeSnapshotState,
  setSnapshotNoticeAcknowledgedFingerprint,
  type SnapshotStorageMode,
  writeTopologyPresetToUrl,
} from './topology/storage'
import {
  buildFilteredTopology,
  buildGraphElements,
  formatChildSummary,
  getCompareColor,
  getManagedInstanceChildSampleNames,
  getNodeMetaLine,
  getParentNode,
  getRelationCategory,
  getRelationLegendClassName,
  getLayoutOptions,
  getResourceCategory,
  isManagedInstanceNode,
  isResourceGroupNode,
  mergeTopologyResponses,
} from './topology/topology-helpers'

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
  const [graphRuntimeLoading, setGraphRuntimeLoading] = useState(false)
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
  const [savedPresets, setSavedPresets] = useState<SavedTopologyPreset[]>(() => loadSavedTopologyPresets())
  const [presetNameInput, setPresetNameInput] = useState('')
  const [savedSnapshots, setSavedSnapshots] = useState<SavedTopologySnapshot[]>([])
  const [snapshotStorageMode] = useState<SnapshotStorageMode>(() => getSnapshotStorageMode())
  const snapshotStorageProvider = useMemo(
    () => createSnapshotStorageProvider(snapshotStorageMode),
    [snapshotStorageMode],
  )
  const [localWorkspaceSnapshots, setLocalWorkspaceSnapshots] = useState<SavedTopologySnapshot[]>([])
  const [localSnapshotNoticeDismissed, setLocalSnapshotNoticeDismissed] = useState(false)
  const [localSnapshotImporting, setLocalSnapshotImporting] = useState(false)
  const [snapshotsLoading, setSnapshotsLoading] = useState(false)
  const [snapshotNameInput, setSnapshotNameInput] = useState('')
  const [snapshotNoteInput, setSnapshotNoteInput] = useState('')
  const localSnapshotNoticeFingerprint = useMemo(
    () => createSnapshotNoticeFingerprint(localWorkspaceSnapshots),
    [localWorkspaceSnapshots],
  )

  const graphContainerRef = useRef<HTMLDivElement | null>(null)
  const cyRef = useRef<Core | null>(null)
  const presetImportInputRef = useRef<HTMLInputElement | null>(null)
  const snapshotImportInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const storageWarning = consumeTopologySnapshotStorageWarning()
    if (!storageWarning) {
      return
    }

    setExportMessage(storageWarning)
  }, [])

  async function refreshSavedSnapshots(workspaceId = selectedWorkspaceId) {
    if (!workspaceId) {
      setSavedSnapshots([])
      return
    }

    try {
      setSnapshotsLoading(true)
      const nextSnapshots = await snapshotStorageProvider.list(workspaceId)
      setSavedSnapshots(nextSnapshots)
    } catch (error) {
      setSavedSnapshots([])
      setExportMessage(error instanceof Error ? error.message : 'Snapshot load failed')
    } finally {
      setSnapshotsLoading(false)
    }
  }

  function refreshLocalWorkspaceSnapshots(workspaceId = selectedWorkspaceId) {
    if (snapshotStorageMode !== 'server' || !workspaceId) {
      setLocalWorkspaceSnapshots([])
      return
    }

    setLocalWorkspaceSnapshots(loadLocalSnapshotsForWorkspace(workspaceId))
  }

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
    void refreshSavedSnapshots(selectedWorkspaceId)
  }, [selectedWorkspaceId, snapshotStorageProvider])

  useEffect(() => {
    refreshLocalWorkspaceSnapshots(selectedWorkspaceId)
  }, [selectedWorkspaceId, snapshotStorageMode])

  useEffect(() => {
    if (snapshotStorageMode !== 'server' || !selectedWorkspaceId || !localWorkspaceSnapshots.length) {
      setLocalSnapshotNoticeDismissed(false)
      return
    }

    const acknowledgedFingerprint = getSnapshotNoticeAcknowledgedFingerprint(selectedWorkspaceId)
    setLocalSnapshotNoticeDismissed(acknowledgedFingerprint === localSnapshotNoticeFingerprint)
  }, [localSnapshotNoticeFingerprint, localWorkspaceSnapshots.length, selectedWorkspaceId, snapshotStorageMode])

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
  const workspacesById = useMemo(
    () => new Map(workspaces.map((workspace) => [workspace.id, workspace])),
    [workspaces],
  )

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
      presetVersion: TOPOLOGY_PRESET_VERSION,
      workspaceId: selectedWorkspaceId,
      compareRefs: expandedManagedInstanceRefs,
      clusterChildren: clusterManagedInstanceChildren,
      scope: searchScope,
      query: searchQuery,
      resourceGroupName: focusedResourceGroupName,
    })
  }, [
    clusterManagedInstanceChildren,
    expandedManagedInstanceRefs,
    focusedResourceGroupName,
    searchQuery,
    searchScope,
    selectedWorkspaceId,
  ])

  useEffect(() => {
    let activeCy: Core | null = null
    let cancelled = false

    async function mountGraph() {
      if (!graphContainerRef.current) {
        return
      }

      if (!graphElements.length) {
        cyRef.current?.destroy()
        cyRef.current = null
        setGraphRuntimeLoading(false)
        return
      }

      try {
        setGraphRuntimeLoading(true)
        const cytoscape = await loadCytoscapeRuntime()
        if (cancelled || !graphContainerRef.current) {
          return
        }

        const cy = cytoscape({
          container: graphContainerRef.current,
          elements: graphElements,
          layout: layoutOptions,
          wheelSensitivity: 0.18,
          minZoom: 0.2,
          maxZoom: 2.2,
          style: CYTOSCAPE_STYLE,
        })

        activeCy = cy

        const clearHoverState = () => {
          cy.elements().removeClass('hovered-node hovered-neighbor hovered-edge')
        }

        cy.on('tap', 'node', (event: any) => {
          setSelectedNodeKey(event.target.id())
        })

        cy.on('dbltap', 'node', (event: any) => {
          cy.animate({ fit: { eles: event.target.closedNeighborhood(), padding: 56 } }, { duration: 260 })
        })

        cy.on('mouseover', 'node', (event: any) => {
          clearHoverState()
          const node = event.target
          node.addClass('hovered-node')
          node.neighborhood('node').addClass('hovered-neighbor')
          node.connectedEdges().addClass('hovered-edge')
        })

        cy.on('mouseout', 'node', clearHoverState)

        cy.on('mouseover', 'edge', (event: any) => {
          clearHoverState()
          const edge = event.target
          edge.addClass('hovered-edge')
          edge.connectedNodes().addClass('hovered-neighbor')
        })

        cy.on('mouseout', 'edge', clearHoverState)

        cy.ready(() => {
          cy.fit(undefined, 36)
        })

        if (cancelled) {
          cy.destroy()
          return
        }

        cyRef.current = cy
      } catch {
        if (!cancelled) {
          cyRef.current?.destroy()
          cyRef.current = null
        }
      } finally {
        if (!cancelled) {
          setGraphRuntimeLoading(false)
        }
      }
    }

    void mountGraph()

    return () => {
      cancelled = true
      activeCy?.destroy()
      if (cyRef.current === activeCy) {
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
  const currentPresetState = useMemo<TopologyPresetState>(
    () => ({
      presetVersion: TOPOLOGY_PRESET_VERSION,
      workspaceId: selectedWorkspaceId,
      compareRefs: expandedManagedInstanceRefs,
      clusterChildren: clusterManagedInstanceChildren,
      scope: searchScope,
      query: searchQuery,
      resourceGroupName: focusedResourceGroupName,
    }),
    [
      clusterManagedInstanceChildren,
      expandedManagedInstanceRefs,
      focusedResourceGroupName,
      searchQuery,
      searchScope,
      selectedWorkspaceId,
    ],
  )
  const activeSavedPresetId = useMemo(
    () =>
      savedPresets.find((preset) => arePresetStatesEqual(preset, currentPresetState))?.id ?? null,
    [currentPresetState, savedPresets],
  )
  const activeSavedSnapshotId = useMemo(
    () =>
      savedSnapshots.find((snapshot) => arePresetStatesEqual(snapshot, currentPresetState))?.id ?? null,
    [currentPresetState, savedSnapshots],
  )
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
  const canExportTopology = Boolean(selectedWorkspaceId && graphElements.length && !topologyLoading && !graphRuntimeLoading)
  const exportUnavailableMessage = topologyLoading
    ? UI_TEXT.exportUnavailableLoading
    : topology?.status === 'error' || error
      ? UI_TEXT.exportUnavailableError
      : !graphElements.length
        ? UI_TEXT.exportUnavailableEmpty
        : ''
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

  function handleSaveCurrentPreset() {
    if (!selectedWorkspaceId) {
      return
    }

    const now = new Date().toISOString()
    const nextPreset: SavedTopologyPreset = {
      id: createPresetId(),
      name: presetNameInput.trim() || `${UI_TEXT.defaultPresetName} ${savedPresets.length + 1}`,
      createdAt: now,
      updatedAt: now,
      ...sanitizePresetState(currentPresetState),
    }

    const nextPresets = [nextPreset, ...savedPresets]
    setSavedPresets(nextPresets)
    persistSavedTopologyPresets(nextPresets)
    setPresetNameInput('')
    setExportMessage(`${UI_TEXT.savedPresetPrefix} ${nextPreset.name}`)
  }

  async function handleSaveCurrentSnapshot() {
    if (!selectedWorkspaceId) {
      return
    }

    const now = new Date().toISOString()
    const thumbnailDataUrl = buildSnapshotThumbnailDataUrl(cyRef.current)
    let nextSnapshot: SavedTopologySnapshot = {
      id: createPresetId(),
      name: snapshotNameInput.trim() || `${UI_TEXT.defaultSnapshotName} ${savedSnapshots.length + 1}`,
      createdAt: now,
      updatedAt: now,
      storageKind: snapshotStorageMode,
      note: snapshotNoteInput.trim(),
      topologyGeneratedAt: topology?.generated_at ?? '',
      visibleNodeCount: filteredTopology.nodes.length,
      loadedNodeCount: topology?.nodes.length ?? 0,
      edgeCount: filteredTopology.edges.length,
      thumbnailDataUrl,
      ...sanitizePresetState(currentPresetState),
    }

    let savedWithoutThumbnail = false
    let nextSnapshots = [nextSnapshot, ...savedSnapshots]
    if (estimateSerializedBytes(nextSnapshots) >= SNAPSHOT_STORAGE_WARN_BYTES && nextSnapshot.thumbnailDataUrl) {
      savedWithoutThumbnail = true
      nextSnapshot = {
        ...nextSnapshot,
        thumbnailDataUrl: '',
      }
      nextSnapshots = [nextSnapshot, ...savedSnapshots]
    }

    const successMessage = savedWithoutThumbnail
      ? `${UI_TEXT.savedSnapshotPrefix} ${nextSnapshot.name} — ${UI_TEXT.snapshotSavedWithoutThumbnailSuffix}`
      : `${UI_TEXT.savedSnapshotPrefix} ${nextSnapshot.name}`

    try {
      const result = await snapshotStorageProvider.create(selectedWorkspaceId, nextSnapshot)
      await refreshSavedSnapshots(selectedWorkspaceId)
      setExportMessage(result.warning ? `${successMessage} — ${result.warning}` : successMessage)
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : UI_TEXT.snapshotStorageWriteFailed)
      return
    }

    setSnapshotNameInput('')
    setSnapshotNoteInput('')
  }

  function handleLoadSavedPreset(preset: SavedTopologyPreset) {
    const normalizedPreset = sanitizePresetState(preset)

    setSelectedWorkspaceId(normalizedPreset.workspaceId)
    setExpandedManagedInstanceRefs(normalizedPreset.compareRefs)
    setClusterManagedInstanceChildren(normalizedPreset.clusterChildren)
    setFocusedResourceGroupName(normalizedPreset.resourceGroupName)
    setSearchQuery(normalizedPreset.query)
    setSearchScope(normalizedPreset.scope)
    setSelectedNodeKey('')
    setNodeDetail(null)
    setSearchResultIndex(0)
    setPendingFocusNodeKey('')
    setExportMessage(`${UI_TEXT.loadedPresetPrefix} ${preset.name}`)
  }

  function handleLoadSavedSnapshot(snapshot: SavedTopologySnapshot) {
    const normalizedSnapshot = sanitizeSnapshotState(snapshot)

    setSelectedWorkspaceId(normalizedSnapshot.workspaceId)
    setExpandedManagedInstanceRefs(normalizedSnapshot.compareRefs)
    setClusterManagedInstanceChildren(normalizedSnapshot.clusterChildren)
    setFocusedResourceGroupName(normalizedSnapshot.resourceGroupName)
    setSearchQuery(normalizedSnapshot.query)
    setSearchScope(normalizedSnapshot.scope)
    setSelectedNodeKey('')
    setNodeDetail(null)
    setSearchResultIndex(0)
    setPendingFocusNodeKey('')
    setSnapshotNameInput('')
    setSnapshotNoteInput(normalizedSnapshot.note)
    setExportMessage(`${UI_TEXT.loadedSnapshotPrefix} ${snapshot.name} — ${UI_TEXT.snapshotRestoreNotice}`)
  }

  async function handleRenameSavedSnapshot(snapshot: SavedTopologySnapshot) {
    if (typeof window === 'undefined') {
      return
    }

    const nextName = window.prompt(UI_TEXT.snapshotRenamePrompt, snapshot.name)?.trim()
    if (!nextName || nextName === snapshot.name) {
      return
    }

    try {
      await snapshotStorageProvider.update(selectedWorkspaceId, snapshot.id, { name: nextName })
      await refreshSavedSnapshots(selectedWorkspaceId)
      setExportMessage(`${UI_TEXT.renamedSnapshotPrefix} ${nextName}`)
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : UI_TEXT.snapshotStorageWriteFailed)
    }
  }

  function handleRenameSavedPreset(preset: SavedTopologyPreset) {
    if (typeof window === 'undefined') {
      return
    }

    const nextName = window.prompt(UI_TEXT.presetRenamePrompt, preset.name)?.trim()
    if (!nextName || nextName === preset.name) {
      return
    }

    const nextPresets = savedPresets.map((item) =>
      item.id === preset.id
        ? {
            ...item,
            name: nextName,
            updatedAt: new Date().toISOString(),
          }
        : item,
    )

    setSavedPresets(nextPresets)
    persistSavedTopologyPresets(nextPresets)
    setExportMessage(`${UI_TEXT.renamedPresetPrefix} ${nextName}`)
  }

  function handleDeleteSavedPreset(preset: SavedTopologyPreset) {
    if (typeof window !== 'undefined' && !window.confirm(UI_TEXT.presetDeleteConfirm(preset.name))) {
      return
    }

    const nextPresets = savedPresets.filter((item) => item.id !== preset.id)
    setSavedPresets(nextPresets)
    persistSavedTopologyPresets(nextPresets)
    setExportMessage(`${UI_TEXT.deletedPresetPrefix} ${preset.name}`)
  }

  async function handleDeleteSavedSnapshot(snapshot: SavedTopologySnapshot) {
    if (typeof window !== 'undefined' && !window.confirm(UI_TEXT.snapshotDeleteConfirm(snapshot.name))) {
      return
    }

    try {
      await snapshotStorageProvider.remove(selectedWorkspaceId, snapshot.id)
      await refreshSavedSnapshots(selectedWorkspaceId)
      setExportMessage(`${UI_TEXT.deletedSnapshotPrefix} ${snapshot.name}`)
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : UI_TEXT.snapshotStorageWriteFailed)
    }
  }

  async function handleImportLocalSnapshots() {
    if (!selectedWorkspaceId || snapshotStorageMode !== 'server' || !localWorkspaceSnapshots.length) {
      return
    }

    try {
      setLocalSnapshotImporting(true)

      const summary = await importSnapshotsToStorage(
        selectedWorkspaceId,
        localWorkspaceSnapshots,
        snapshotStorageProvider,
        savedSnapshots,
      )

      await refreshSavedSnapshots(selectedWorkspaceId)
      refreshLocalWorkspaceSnapshots(selectedWorkspaceId)

      if (summary.failedCount === 0 && (summary.importedCount > 0 || summary.skippedCount > 0)) {
        setSnapshotNoticeAcknowledgedFingerprint(selectedWorkspaceId, localSnapshotNoticeFingerprint)
        setLocalSnapshotNoticeDismissed(true)
      }

      const summaryMessage = UI_TEXT.snapshotImportSummary(
        summary.importedCount,
        summary.skippedCount,
        summary.failedCount,
      )
      setExportMessage(summary.warning ? `${summaryMessage} — ${summary.warning}` : summaryMessage)
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : UI_TEXT.snapshotStorageWriteFailed)
    } finally {
      setLocalSnapshotImporting(false)
    }
  }

  function handleExportSavedPresets() {
    if (typeof window === 'undefined' || !savedPresets.length) {
      return
    }

    const payload: ImportedPresetPayload = {
      presetVersion: TOPOLOGY_PRESET_VERSION,
      exportedAt: new Date().toISOString(),
      presets: savedPresets,
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = window.URL.createObjectURL(blob)
    const anchor = window.document.createElement('a')
    anchor.href = url
    anchor.download = `azvision-topology-presets-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`
    anchor.click()
    window.URL.revokeObjectURL(url)
    setExportMessage(`${UI_TEXT.exportedPresetsPrefix} ${savedPresets.length}`)
  }

  function handleExportSavedSnapshots() {
    if (typeof window === 'undefined' || !savedSnapshots.length) {
      return
    }

    const payload: ImportedSnapshotPayload = {
      presetVersion: TOPOLOGY_PRESET_VERSION,
      exportedAt: new Date().toISOString(),
      snapshots: savedSnapshots,
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = window.URL.createObjectURL(blob)
    const anchor = window.document.createElement('a')
    anchor.href = url
    anchor.download = `azvision-topology-snapshots-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`
    anchor.click()
    window.URL.revokeObjectURL(url)
    setExportMessage(`${UI_TEXT.exportedSnapshotsPrefix} ${savedSnapshots.length}`)
  }

  function handleImportPresetClick() {
    presetImportInputRef.current?.click()
  }

  function handleImportSnapshotClick() {
    snapshotImportInputRef.current?.click()
  }

  async function handleImportPresetFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) {
      return
    }

    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as unknown
      const importedPresets = normalizeImportedPresetPayload(parsed)

      if (!importedPresets.length) {
        setExportMessage(UI_TEXT.importNoValidPresets)
        return
      }

      const existingNames = new Set(savedPresets.map((preset) => preset.name))
      const mergedPresets = importedPresets.map((preset) => ({
        ...preset,
        name: createUniquePresetName(preset.name, existingNames),
      }))

      const nextPresets = [...mergedPresets, ...savedPresets]
      setSavedPresets(nextPresets)
      persistSavedTopologyPresets(nextPresets)
      setExportMessage(`${UI_TEXT.importedPresetsPrefix} ${mergedPresets.length}`)
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : UI_TEXT.importInvalidJson)
    }
  }

  async function handleImportSnapshotFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file || !selectedWorkspaceId) {
      return
    }

    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as unknown
      const importedSnapshots = normalizeImportedSnapshotPayload(parsed)

      if (!importedSnapshots.length) {
        setExportMessage(UI_TEXT.importNoValidSnapshots)
        return
      }

      const nextSnapshots: SavedTopologySnapshot[] = importedSnapshots.map((snapshot) => ({
        ...snapshot,
        workspaceId: selectedWorkspaceId,
      }))

      const summary = await importSnapshotsToStorage(
        selectedWorkspaceId,
        nextSnapshots,
        snapshotStorageProvider,
        savedSnapshots,
      )

      await refreshSavedSnapshots(selectedWorkspaceId)
      refreshLocalWorkspaceSnapshots(selectedWorkspaceId)

      const summaryMessage = UI_TEXT.snapshotImportSummary(
        summary.importedCount,
        summary.skippedCount,
        summary.failedCount,
      )
      setExportMessage(
        summary.warning ? `${summaryMessage} — ${summary.warning}` : summaryMessage,
      )
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : UI_TEXT.importInvalidSnapshotJson)
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
    if (!selectedWorkspaceId || !graphElements.length || !cy) {
      setExportMessage(UI_TEXT.exportUnavailableNoGraph)
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

      const exportRecord = await createExport(selectedWorkspaceId, 'png', imageDataUrl)
      setLastExport(exportRecord)
      setExportMessage(`${UI_TEXT.exportSavedPrefix} ${exportRecord.output_path}`)
    } catch (err) {
      setExportMessage(err instanceof Error ? err.message : 'PNG export failed')
    } finally {
      setExportLoading(false)
    }
  }

  async function handleExportPdf() {
    const cy = cyRef.current
    if (!selectedWorkspaceId || !graphElements.length || !cy) {
      setExportMessage(UI_TEXT.exportUnavailableNoGraph)
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

      const { jsPDF } = await import('jspdf')
      const img = new Image()
      img.src = imageDataUrl
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('Failed to load topology image for PDF'))
      })

      const orientation = img.width > img.height ? 'landscape' : 'portrait'
      const pdf = new jsPDF({ orientation, unit: 'px', format: [img.width, img.height] })
      pdf.addImage(imageDataUrl, 'PNG', 0, 0, img.width, img.height)
      const pdfBase64 = pdf.output('datauristring')

      const exportRecord = await createExport(selectedWorkspaceId, 'pdf', pdfBase64)
      setLastExport(exportRecord)
      setExportMessage(`${UI_TEXT.exportSavedPrefix} ${exportRecord.output_path}`)
    } catch (err) {
      setExportMessage(err instanceof Error ? err.message : 'PDF export failed')
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
          <p className="subtext">{UI_TEXT.heroSubtext}</p>
        </div>
        <div className={`status-pill ${authReady ? 'ready' : 'pending'}`}>
          Auth readiness: {authReady ? 'live inventory ready' : 'diagnostic only'}
        </div>
      </header>

      {error ? <div className="error-banner">{UI_TEXT.apiErrorPrefix} {error}</div> : null}
      {topology?.status === 'error' ? (
        <div className="error-banner">{UI_TEXT.topologyErrorPrefix} {topology.message ?? 'Unknown error'}</div>
      ) : null}
      {exportMessage ? <div className="info-banner">{exportMessage}</div> : null}

      <section className="panel-grid">
        <article className="panel-card">
          <h2>Workspace</h2>
          {loading ? (
            <p>{UI_TEXT.loading}</p>
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
              <span>{UI_TEXT.networkInferenceToggle}</span>
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
                : UI_TEXT.noCompareTargets}
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
            <p className="hint">{UI_TEXT.compareHint}</p>
          )}

          <h3 className="section-spacer">{UI_TEXT.savedSnapshotsTitle}</h3>
          <div className="storage-guide-card snapshot-guide-card">
            <strong>{UI_TEXT.snapshotGuideTitle}</strong>
            <p className="hint">{UI_TEXT.snapshotHint}</p>
            <p className="hint storage-guide-copy">{UI_TEXT.snapshotGuideBody}</p>
          </div>
          {snapshotStorageMode === 'server' && localWorkspaceSnapshots.length > 0 && !localSnapshotNoticeDismissed ? (
            <div className="info-banner snapshot-import-banner">
              <strong>{UI_TEXT.localSnapshotNoticeTitle(localWorkspaceSnapshots.length)}</strong>
              <p className="hint snapshot-import-banner-copy">{UI_TEXT.localSnapshotNoticeBody}</p>
              <div className="button-row preset-toolbar-row snapshot-import-banner-actions">
                <button
                  type="button"
                  className="toolbar-button primary"
                  onClick={handleImportLocalSnapshots}
                  disabled={localSnapshotImporting || !selectedWorkspaceId}
                >
                  {localSnapshotImporting ? UI_TEXT.importingLocalSnapshots : UI_TEXT.importLocalSnapshots}
                </button>
                <button
                  type="button"
                  className="toolbar-button"
                  onClick={() => {
                    setSnapshotNoticeAcknowledgedFingerprint(selectedWorkspaceId, localSnapshotNoticeFingerprint)
                    setLocalSnapshotNoticeDismissed(true)
                  }}
                  disabled={localSnapshotImporting}
                >
                  {UI_TEXT.dismissLocalSnapshotNotice}
                </button>
              </div>
            </div>
          ) : null}
          <div className="preset-save-row snapshot-save-row">
            <input
              type="text"
              className="search-input"
              value={snapshotNameInput}
              onChange={(event) => setSnapshotNameInput(event.target.value)}
              placeholder={UI_TEXT.snapshotNamePlaceholder}
            />
            <textarea
              className="search-input snapshot-note-input"
              value={snapshotNoteInput}
              onChange={(event) => setSnapshotNoteInput(event.target.value)}
              placeholder={UI_TEXT.snapshotNotePlaceholder}
              rows={3}
            />
            <div className="button-row preset-toolbar-row">
              <button
                type="button"
                className="toolbar-button primary"
                onClick={handleSaveCurrentSnapshot}
                disabled={!selectedWorkspaceId}
              >
                {UI_TEXT.saveCurrentSnapshot}
              </button>
              <button
                type="button"
                className="toolbar-button"
                onClick={handleExportSavedSnapshots}
                disabled={!savedSnapshots.length}
              >
                {UI_TEXT.exportSnapshots}
              </button>
              <button type="button" className="toolbar-button" onClick={handleImportSnapshotClick}>
                {UI_TEXT.importSnapshots}
              </button>
              <input
                ref={snapshotImportInputRef}
                type="file"
                accept="application/json,.json"
                className="visually-hidden"
                onChange={handleImportSnapshotFile}
              />
            </div>
          </div>
          {savedSnapshots.length ? (
            <div className="compare-chip-grid preset-list-grid">
              {savedSnapshots.map((snapshot) => {
                const isActiveSnapshot = snapshot.id === activeSavedSnapshotId
                return (
                  <div
                    key={snapshot.id}
                    className={`compare-chip-card preset-card snapshot-card ${isActiveSnapshot ? 'active-preset-card active-snapshot-card' : ''}`}
                  >
                    {snapshot.thumbnailDataUrl ? (
                      <div className="snapshot-thumb-shell">
                        <img
                          src={snapshot.thumbnailDataUrl}
                          alt={`${snapshot.name} topology preview`}
                          className="snapshot-thumb"
                          loading="lazy"
                        />
                      </div>
                    ) : null}
                    <div className="preset-card-copy">
                      <div className="preset-card-title-row">
                        <strong>{snapshot.name}</strong>
                        <span className={`mini-chip snapshot-source-chip snapshot-source-chip-${snapshot.storageKind}`}>
                          {UI_TEXT.snapshotStorageBadgeLabel(snapshot.storageKind)}
                        </span>
                        {isActiveSnapshot ? <span className="mini-chip">{UI_TEXT.activeSnapshotBadge}</span> : null}
                      </div>
                      <p className="hint preset-card-meta">
                        {UI_TEXT.snapshotMeta(
                          getSearchScopeMeta(snapshot.scope).label,
                          snapshot.compareRefs.length,
                          workspacesById.get(snapshot.workspaceId)?.name ?? snapshot.workspaceId,
                        )}
                      </p>
                      <p className="hint preset-card-meta">{UI_TEXT.snapshotStorageMeta(snapshot.storageKind)}</p>
                      <p className="hint preset-card-meta">{UI_TEXT.snapshotResourceGroupMeta(snapshot.resourceGroupName)}</p>
                      <p className="hint preset-card-meta">
                        {UI_TEXT.snapshotCounts(snapshot.visibleNodeCount, snapshot.loadedNodeCount, snapshot.edgeCount)}
                      </p>
                      {snapshot.note ? <p className="hint snapshot-note">{snapshot.note}</p> : null}
                      <p className="hint preset-card-meta">
                        Generated {formatDateTime(snapshot.topologyGeneratedAt)} • Saved {formatDateTime(snapshot.updatedAt || snapshot.createdAt)}
                      </p>
                      <p className="hint storage-restore-meta">{UI_TEXT.snapshotRestoreMetaHint}</p>
                    </div>
                    <div className="button-row preset-card-actions">
                      <button
                        type="button"
                        className="toolbar-button search-inline-button"
                        onClick={() => handleLoadSavedSnapshot(snapshot)}
                      >
                        {UI_TEXT.loadSnapshot}
                      </button>
                      <button
                        type="button"
                        className="toolbar-button search-inline-button"
                        onClick={() => handleRenameSavedSnapshot(snapshot)}
                      >
                        {UI_TEXT.renameSnapshot}
                      </button>
                      <button
                        type="button"
                        className="toolbar-button search-inline-button"
                        onClick={() => handleDeleteSavedSnapshot(snapshot)}
                      >
                        {UI_TEXT.deleteSnapshot}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="hint">{snapshotsLoading ? UI_TEXT.loading : UI_TEXT.noSavedSnapshots}</p>
          )}

          <h3 className="section-spacer">{UI_TEXT.savedPresetsTitle}</h3>
          <div className="storage-guide-card preset-guide-card">
            <strong>{UI_TEXT.presetGuideTitle}</strong>
            <p className="hint">{UI_TEXT.presetHint}</p>
            <p className="hint storage-guide-copy">{UI_TEXT.presetGuideBody}</p>
          </div>
          <div className="preset-save-row">
            <input
              type="text"
              className="search-input"
              value={presetNameInput}
              onChange={(event) => setPresetNameInput(event.target.value)}
              placeholder={UI_TEXT.presetNamePlaceholder}
            />
            <div className="button-row preset-toolbar-row">
              <button
                type="button"
                className="toolbar-button primary"
                onClick={handleSaveCurrentPreset}
                disabled={!selectedWorkspaceId}
              >
                {UI_TEXT.saveCurrentPreset}
              </button>
              <button
                type="button"
                className="toolbar-button"
                onClick={handleExportSavedPresets}
                disabled={!savedPresets.length}
              >
                {UI_TEXT.exportPresets}
              </button>
              <button type="button" className="toolbar-button" onClick={handleImportPresetClick}>
                {UI_TEXT.importPresets}
              </button>
              <input
                ref={presetImportInputRef}
                type="file"
                accept="application/json,.json"
                className="visually-hidden"
                onChange={handleImportPresetFile}
              />
            </div>
          </div>
          {savedPresets.length ? (
            <div className="compare-chip-grid preset-list-grid">
              {savedPresets.map((preset) => {
                const isActivePreset = preset.id === activeSavedPresetId
                return (
                  <div
                    key={preset.id}
                    className={`compare-chip-card preset-card ${isActivePreset ? 'active-preset-card' : ''}`}
                  >
                  <div className="preset-card-copy">
                    <div className="preset-card-title-row">
                      <strong>{preset.name}</strong>
                      {isActivePreset ? <span className="mini-chip">{UI_TEXT.activePresetBadge}</span> : null}
                    </div>
                    <p className="hint preset-card-meta">
                      {UI_TEXT.presetMeta(
                        getSearchScopeMeta(preset.scope).label,
                        preset.compareRefs.length,
                        workspacesById.get(preset.workspaceId)?.name ?? preset.workspaceId,
                      )}
                    </p>
                    <p className="hint preset-card-meta">Updated {formatDateTime(preset.updatedAt || preset.createdAt)}</p>
                  </div>
                  <div className="button-row preset-card-actions">
                    <button type="button" className="toolbar-button search-inline-button" onClick={() => handleLoadSavedPreset(preset)}>
                      {UI_TEXT.loadPreset}
                    </button>
                    <button type="button" className="toolbar-button search-inline-button" onClick={() => handleRenameSavedPreset(preset)}>
                      {UI_TEXT.renamePreset}
                    </button>
                    <button type="button" className="toolbar-button search-inline-button" onClick={() => handleDeleteSavedPreset(preset)}>
                      {UI_TEXT.deletePreset}
                    </button>
                  </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="hint">{UI_TEXT.noSavedPresets}</p>
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
          <p className="hint">{UI_TEXT.resourceFilterHint}</p>
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
          {graphRuntimeLoading ? <p className="hint compare-layout-hint">Graph engine loading...</p> : null}

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
                disabled={exportLoading || !canExportTopology}
              >
                {exportLoading ? 'Exporting...' : 'Export PNG'}
              </button>
              <button
                type="button"
                className="toolbar-button"
                onClick={handleExportPdf}
                disabled={exportLoading || !canExportTopology}
              >
                {exportLoading ? 'Exporting...' : 'Export PDF'}
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

          {!canExportTopology && exportUnavailableMessage ? (
            <p className="hint export-hint">{exportUnavailableMessage}</p>
          ) : null}
          <p className="hint export-hint">{UI_TEXT.searchTip}</p>
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
                      ? UI_TEXT.resourceGroupFocusedHint(selectedNode.display_name)
                      : UI_TEXT.resourceGroupLoadHint}
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
                  <p className="hint detail-inline-hint">{UI_TEXT.parentManagedInstanceHint}</p>
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
                      ? UI_TEXT.managedInstanceExpandedHint
                      : UI_TEXT.managedInstanceCollapsedHint}
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
                  <p className="hint">{UI_TEXT.noProjectedDetails}</p>
                )}
              </div>
            </div>
          ) : (
            <p className="hint">{UI_TEXT.noSelectedNode}</p>
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
