import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import type { Core } from 'cytoscape'

import { CopilotPanel } from '../components/CopilotPanel'
import { useI18n } from '../i18n/context'

import {
  compareTopologyArchives,
  compareTopologySnapshots,
  createExport,
  createManualEdge,
  createManualNode,
  deleteManualEdge,
  deleteManualNode,
  updateManualEdge,
  updateManualNode,
  getAuthConfigCheck,
  getPathAnalysis,
  getTopology,
  getTopologyNodeDetail,
  getTopologySnapshot,
  getWorkspaceInventorySummary,
  getWorkspaceResourceGroups,
  getWorkspaceResources,
  getWorkspaceSubscriptions,
  getWorkspaces,
  listManualEdges,
  listManualNodes,
  type ExportItem,
  type InventoryResource,
  type InventoryResourceGroup,
  type InventorySubscription,
  type InventorySummaryResponse,
  type ManualEdge,
  type ManualNode,
  type PathAnalysisResponse,
  type UpdateManualEdgeRequest,
  type UpdateManualNodeRequest,
  type TopologyArchiveCompareResponse,
  type TopologyEdge,
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
  RECENT_SNAPSHOT_LIMIT,
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
  type SnapshotFilterTab,
  type SnapshotSortBy,
  type SnapshotSortOrder,
  type TopologyPresetState,
} from './topology/model'
import { buildSearchResultGroups, getSearchScopeMeta, searchTopologyNodes } from './topology/search'
import {
  getDisplayedSnapshots,
  getSnapshotFilterCounts,
  orderSavedSnapshots,
} from './topology/snapshot-order'
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

import {
  buildTopologyDiffMarkdown,
  extractDetailScope,
  formatConfidenceLabel,
  formatDateTime,
  formatDeltaCounts,
  formatDeltaItemLabel,
  formatEdgeDetail,
  formatNodeDetail,
  formatPeeringEvidenceHint,
  formatPeeringTraversalLabel,
  formatRelativeTime,
  formatRouteNextHopLabel,
  formatSourceLabel,
  getConfidenceTone,
  getSourceTone,
  prettifyKey,
  type GraphHoverCard,
} from './topology/formatting'


export function TopologyPage() {
  const { t } = useI18n()
  const initialPreset = readTopologyPresetFromUrl()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('')
  const [selectedSubscriptionId, setSelectedSubscriptionId] = useState(initialPreset.selectedSubscriptionId)
  const [availableSubscriptions, setAvailableSubscriptions] = useState<InventorySubscription[]>([])
  const [availableResourceGroups, setAvailableResourceGroups] = useState<InventoryResourceGroup[]>([])
  const [availableResources, setAvailableResources] = useState<InventoryResource[]>([])
  const [inventorySummary, setInventorySummary] = useState<InventorySummaryResponse | null>(null)
  const [inventoryLoading, setInventoryLoading] = useState(false)
  const [inventoryMode, setInventoryMode] = useState('')
  const [inventoryWarning, setInventoryWarning] = useState('')
  const [topology, setTopology] = useState<TopologyResponse | null>(null)
  const [selectedNodeKey, setSelectedNodeKey] = useState<string>('')
  const [nodeDetail, setNodeDetail] = useState<TopologyNodeDetail | null>(null)
  const [authReady, setAuthReady] = useState<boolean>(false)
  const [error, setError] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [topologyLoading, setTopologyLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [graphRuntimeLoading, setGraphRuntimeLoading] = useState(false)
  const [pathSourceNodeRef, setPathSourceNodeRef] = useState('')
  const [pathDestinationNodeRef, setPathDestinationNodeRef] = useState('')
  const [pathProtocolInput, setPathProtocolInput] = useState('Tcp')
  const [pathSourceAddressInput, setPathSourceAddressInput] = useState('')
  const [pathDestinationAddressInput, setPathDestinationAddressInput] = useState('')
  const [pathSourcePortInput, setPathSourcePortInput] = useState('')
  const [pathDestinationPortInput, setPathDestinationPortInput] = useState('443')
  const [pathAnalysisResult, setPathAnalysisResult] = useState<PathAnalysisResponse | null>(null)
  const [pathAnalysisLoading, setPathAnalysisLoading] = useState(false)
  const [pathAnalysisMessage, setPathAnalysisMessage] = useState('')
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
  const [serverSnapshotThumbnailById, setServerSnapshotThumbnailById] = useState<Record<string, string>>({})
  const [snapshotStorageMode] = useState<SnapshotStorageMode>(() => getSnapshotStorageMode())
  const snapshotStorageProvider = useMemo(
    () => createSnapshotStorageProvider(snapshotStorageMode),
    [snapshotStorageMode],
  )
  const [localWorkspaceSnapshots, setLocalWorkspaceSnapshots] = useState<SavedTopologySnapshot[]>([])
  const [localSnapshotNoticeDismissed, setLocalSnapshotNoticeDismissed] = useState(false)
  const [localSnapshotImporting, setLocalSnapshotImporting] = useState(false)
  const [snapshotsLoading, setSnapshotsLoading] = useState(false)
  const [snapshotFilter, setSnapshotFilter] = useState<SnapshotFilterTab>('all')
  const [snapshotSortBy, setSnapshotSortBy] = useState<SnapshotSortBy>('last_restored_at')
  const [snapshotSortOrder, setSnapshotSortOrder] = useState<SnapshotSortOrder>('desc')
  const [snapshotCompareBaseId, setSnapshotCompareBaseId] = useState('')
  const [snapshotTopologyCompareResult, setSnapshotTopologyCompareResult] = useState<TopologyArchiveCompareResponse | null>(null)
  const [diffExpandedSections, setDiffExpandedSections] = useState<Set<string>>(new Set())
  const [snapshotNameInput, setSnapshotNameInput] = useState('')
  const [snapshotNoteInput, setSnapshotNoteInput] = useState('')
  const [manualNodes, setManualNodes] = useState<ManualNode[]>([])
  const [graphHoverCard, setGraphHoverCard] = useState<GraphHoverCard | null>(null)
  const [manualEdges, setManualEdges] = useState<ManualEdge[]>([])
  const [manualLoading, setManualLoading] = useState(false)
  const [canvasMaximized, setCanvasMaximized] = useState(false)
  const [manualNodeNameInput, setManualNodeNameInput] = useState('')
  const [manualNodeTypeInput, setManualNodeTypeInput] = useState('external-system')
  const [manualNodeVendorInput, setManualNodeVendorInput] = useState('')
  const [manualNodeEnvironmentInput, setManualNodeEnvironmentInput] = useState('')
  const [manualNodeNotesInput, setManualNodeNotesInput] = useState('')
  const [manualEdgeSourceNodeKey, setManualEdgeSourceNodeKey] = useState('')
  const [manualEdgeTargetNodeKey, setManualEdgeTargetNodeKey] = useState('')
  const [manualEdgeRelationTypeInput, setManualEdgeRelationTypeInput] = useState('connects_to')
  const [manualEdgeNotesInput, setManualEdgeNotesInput] = useState('')
  const [manualModelRefreshKey, setManualModelRefreshKey] = useState(0)
  const [editingManualNodeRef, setEditingManualNodeRef] = useState<string>('')
  const [editManualNodeName, setEditManualNodeName] = useState('')
  const [editManualNodeType, setEditManualNodeType] = useState('external-system')
  const [editManualNodeVendor, setEditManualNodeVendor] = useState('')
  const [editManualNodeEnvironment, setEditManualNodeEnvironment] = useState('')
  const [editManualNodeNotes, setEditManualNodeNotes] = useState('')
  const [editingManualEdgeRef, setEditingManualEdgeRef] = useState<string>('')
  const [editManualEdgeSource, setEditManualEdgeSource] = useState('')
  const [editManualEdgeTarget, setEditManualEdgeTarget] = useState('')
  const [editManualEdgeRelationType, setEditManualEdgeRelationType] = useState('connects_to')
  const [editManualEdgeNotes, setEditManualEdgeNotes] = useState('')
  const localSnapshotNoticeFingerprint = useMemo(
    () => createSnapshotNoticeFingerprint(localWorkspaceSnapshots),
    [localWorkspaceSnapshots],
  )
  const topologyCopilotOptions = useMemo(
    () => ({
      subscriptionId: selectedSubscriptionId || undefined,
      resourceGroupName: focusedResourceGroupName || undefined,
      resourceGroupLimit: 20,
      resourceLimit: 80,
    }),
    [focusedResourceGroupName, selectedSubscriptionId],
  )

  const graphContainerRef = useRef<HTMLDivElement | null>(null)
  const cyRef = useRef<Core | null>(null)
  const presetImportInputRef = useRef<HTMLInputElement | null>(null)
  const snapshotImportInputRef = useRef<HTMLInputElement | null>(null)

  function tr(key: Parameters<typeof t>[0], replacements: Record<string, string | number> = {}) {
    return Object.entries(replacements).reduce(
      (text, [placeholder, value]) => text.split(`{${placeholder}}`).join(String(value)),
      t(key),
    )
  }

  function formatSnapshotScopeText(subscriptionId: string, resourceGroupName: string) {
    return [
      subscriptionId
        ? tr('topology.snapshots.scopeSubscription', { id: subscriptionId })
        : t('topology.snapshots.scopeAllSubscriptions'),
      resourceGroupName
        ? tr('topology.snapshots.scopeResourceGroup', { name: resourceGroupName })
        : t('topology.snapshots.scopeAllResourceGroups'),
    ].join(' • ')
  }

  function formatTimestampText(key: Parameters<typeof t>[0], value: string, relativeTime?: string) {
    return tr(key, { time: `${formatDateTime(value)}${relativeTime ? ` (${relativeTime})` : ''}` })
  }

  function formatSnapshotImportSummary(importedCount: number, skippedCount: number, failedCount: number) {
    if (!importedCount && !skippedCount && !failedCount) {
      return t('topology.snapshots.importNone')
    }
    return tr('topology.snapshots.importedSummary', {
      imported: importedCount,
      skipped: skippedCount,
      failed: failedCount,
    })
  }

  function formatLocalizedRelativeTime(value?: string) {
    if (!value) {
      return ''
    }

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      return ''
    }

    const diffMs = Date.now() - date.getTime()
    const diffSec = Math.floor(diffMs / 1000)
    if (diffSec < 60) return t('topology.common.justNow')
    const diffMin = Math.floor(diffSec / 60)
    if (diffMin < 60) return tr('topology.common.minutesAgo', { count: diffMin })
    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) return tr('topology.common.hoursAgo', { count: diffHr })
    const diffDay = Math.floor(diffHr / 24)
    if (diffDay < 30) return tr('topology.common.daysAgo', { count: diffDay })
    const diffMo = Math.floor(diffDay / 30)
    if (diffMo < 12) return tr('topology.common.monthsAgo', { count: diffMo })
    return tr('topology.common.yearsAgo', { count: Math.floor(diffMo / 12) })
  }

  function formatLocalizedDeltaCounts(delta?: { added: unknown[]; removed: unknown[]; changed: unknown[] }) {
    return tr('topology.common.deltaCounts', {
      added: delta?.added.length ?? 0,
      removed: delta?.removed.length ?? 0,
      changed: delta?.changed.length ?? 0,
    })
  }

  function localizeSnapshotStorageMessage(message: string) {
    if (message === UI_TEXT.snapshotStorageReadFailed) return t('topology.error.snapshotStorageReadFailed')
    if (message === UI_TEXT.snapshotStorageWriteFailed) return t('topology.error.snapshotStorageWriteFailed')
    if (message === UI_TEXT.snapshotServerThumbnailRejectedWarning) return t('topology.snapshots.serverThumbnailRejectedWarning')
    if (message === UI_TEXT.snapshotLocalThumbnailRejectedWarning) return t('topology.snapshots.localThumbnailRejectedWarning')
    if (message === UI_TEXT.snapshotStorageNearLimit) return t('topology.snapshots.storageNearLimit')
    if (message === UI_TEXT.snapshotStorageQuotaExceeded) return t('topology.snapshots.storageQuotaExceeded')
    return message
  }

  useEffect(() => {
    const storageWarning = consumeTopologySnapshotStorageWarning()
    if (!storageWarning) {
      return
    }

    setExportMessage(localizeSnapshotStorageMessage(storageWarning))
  }, [t])

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
      setExportMessage(error instanceof Error ? error.message : t('topology.error.snapshotLoadFailed'))
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

  async function refreshManualModeling(workspaceId = selectedWorkspaceId) {
    if (!workspaceId) {
      setManualNodes([])
      setManualEdges([])
      return
    }

    try {
      setManualLoading(true)
      const [nextManualNodes, nextManualEdges] = await Promise.all([
        listManualNodes(workspaceId),
        listManualEdges(workspaceId),
      ])
      setManualNodes(nextManualNodes)
      setManualEdges(nextManualEdges)
    } catch (error) {
      setManualNodes([])
      setManualEdges([])
      setExportMessage(error instanceof Error ? error.message : t('topology.error.manualModelingLoadFailed'))
    } finally {
      setManualLoading(false)
    }
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
        setError(err instanceof Error ? err.message : t('topology.error.unknown'))
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
    setServerSnapshotThumbnailById({})
    setSnapshotCompareBaseId('')
  }, [selectedWorkspaceId, snapshotStorageMode])

  useEffect(() => {
    void refreshManualModeling(selectedWorkspaceId)
  }, [selectedWorkspaceId])

  useEffect(() => {
    refreshLocalWorkspaceSnapshots(selectedWorkspaceId)
  }, [selectedWorkspaceId, snapshotStorageMode])

  useEffect(() => {
    if (!selectedWorkspaceId) {
      setAvailableSubscriptions([])
      setAvailableResourceGroups([])
      setAvailableResources([])
      setInventorySummary(null)
      setSelectedSubscriptionId('')
      setInventoryMode('')
      setInventoryWarning('')
      return
    }

    let active = true

    async function loadInventoryScope() {
      try {
        setInventoryLoading(true)

        const subscriptionResult = await getWorkspaceSubscriptions(selectedWorkspaceId)
        if (!active) {
          return
        }

        setAvailableSubscriptions(subscriptionResult.items)
        setInventoryMode(subscriptionResult.mode ?? '')
        setInventoryWarning(subscriptionResult.warning ?? '')

        const resourceGroupResult = await getWorkspaceResourceGroups(selectedWorkspaceId, {
          subscriptionId: selectedSubscriptionId || undefined,
          limit: 200,
        })
        if (!active) {
          return
        }

        setAvailableResourceGroups(resourceGroupResult.items)
        if (resourceGroupResult.warning && !subscriptionResult.warning) {
          setInventoryWarning(resourceGroupResult.warning)
        }
        if (resourceGroupResult.mode) {
          setInventoryMode(resourceGroupResult.mode)
        }

        const resourceResult = await getWorkspaceResources(selectedWorkspaceId, {
          subscriptionId: selectedSubscriptionId || undefined,
          resourceGroupName: focusedResourceGroupName || undefined,
          limit: 12,
        })
        if (!active) {
          return
        }

        setAvailableResources(resourceResult.items)
        if (resourceResult.warning && !resourceGroupResult.warning && !subscriptionResult.warning) {
          setInventoryWarning(resourceResult.warning)
        }
        if (resourceResult.mode) {
          setInventoryMode(resourceResult.mode)
        }

        const summaryResult = await getWorkspaceInventorySummary(selectedWorkspaceId, {
          subscriptionId: selectedSubscriptionId || undefined,
          resourceGroupName: focusedResourceGroupName || undefined,
          resourceGroupLimit: 200,
          resourceLimit: 500,
        })
        if (!active) {
          return
        }

        setInventorySummary(summaryResult)
        if (
          summaryResult.warning &&
          !resourceResult.warning &&
          !resourceGroupResult.warning &&
          !subscriptionResult.warning
        ) {
          setInventoryWarning(summaryResult.warning)
        }
        if (summaryResult.mode) {
          setInventoryMode(summaryResult.mode)
        }
      } catch (err) {
        if (!active) {
          return
        }
        setAvailableSubscriptions([])
        setAvailableResourceGroups([])
        setAvailableResources([])
        setInventorySummary(null)
        setInventoryWarning(err instanceof Error ? err.message : t('topology.error.inventoryScopeLoadFailed'))
      } finally {
        if (active) {
          setInventoryLoading(false)
        }
      }
    }

    void loadInventoryScope()

    return () => {
      active = false
    }
  }, [focusedResourceGroupName, selectedSubscriptionId, selectedWorkspaceId])

  useEffect(() => {
    if (snapshotStorageMode !== 'server' || !selectedWorkspaceId || !localWorkspaceSnapshots.length) {
      setLocalSnapshotNoticeDismissed(false)
      return
    }

    const acknowledgedFingerprint = getSnapshotNoticeAcknowledgedFingerprint(selectedWorkspaceId)
    setLocalSnapshotNoticeDismissed(acknowledgedFingerprint === localSnapshotNoticeFingerprint)
  }, [localSnapshotNoticeFingerprint, localWorkspaceSnapshots.length, selectedWorkspaceId, snapshotStorageMode])

  useEffect(() => {
    if (!focusedResourceGroupName) {
      return
    }

    const hasFocusedResourceGroup = availableResourceGroups.some(
      (resourceGroup) => resourceGroup.name === focusedResourceGroupName,
    )

    if (!hasFocusedResourceGroup) {
      setFocusedResourceGroupName('')
    }
  }, [availableResourceGroups, focusedResourceGroupName])

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
          subscriptionId: selectedSubscriptionId || undefined,
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
        setError(err instanceof Error ? err.message : t('topology.error.unknown'))
      } finally {
        setTopologyLoading(false)
      }
    }

    void loadTopology()
  }, [
    expandedManagedInstanceRefs,
    focusedResourceGroupName,
    includeNetworkInference,
    manualModelRefreshKey,
    selectedSubscriptionId,
    selectedWorkspaceId,
  ])

  const filteredTopology = useMemo(
    () => buildFilteredTopology(topology, resourceFilters, relationFilters, relationTypeFilters),
    [relationTypeFilters, relationFilters, resourceFilters, topology],
  )

  const searchResults = useMemo(
    () => searchTopologyNodes(filteredTopology.nodes, searchQuery, searchScope),
    [filteredTopology.nodes, searchQuery, searchScope],
  )

  const searchLabels = useMemo(
    () => ({
      groups: {
        data: t('topology.search.group.data'),
        network: t('topology.search.group.network'),
        web: t('topology.search.group.web'),
        compute: t('topology.search.group.compute'),
        scope: t('topology.search.group.scope'),
        other: t('topology.search.group.other'),
      },
      scopes: {
        visible: {
          label: t('topology.search.scope.visible.label'),
          placeholder: t('topology.search.scope.visible.placeholder'),
          hint: t('topology.search.scope.visible.hint'),
          empty: t('topology.search.scope.visible.empty'),
        },
        'child-only': {
          label: t('topology.search.scope.childOnly.label'),
          placeholder: t('topology.search.scope.childOnly.placeholder'),
          hint: t('topology.search.scope.childOnly.hint'),
          empty: t('topology.search.scope.childOnly.empty'),
        },
        'collapsed-preview': {
          label: t('topology.search.scope.collapsedPreview.label'),
          placeholder: t('topology.search.scope.collapsedPreview.placeholder'),
          hint: t('topology.search.scope.collapsedPreview.hint'),
          empty: t('topology.search.scope.collapsedPreview.empty'),
        },
      },
    }),
    [t],
  )

  const searchResultGroups = useMemo(
    () => buildSearchResultGroups(searchResults.slice(0, 12), searchLabels),
    [searchLabels, searchResults],
  )

  const activeSearchResult = searchResults[searchResultIndex] ?? null
  const topologyNodesByRef = useMemo(() => {
    const map = new Map<string, TopologyNode>()

    for (const node of topology?.nodes ?? []) {
      map.set(node.node_ref, node)
    }

    return map
  }, [topology])
  const filteredNodesByKey = useMemo(
    () => new Map<string, TopologyNode>(filteredTopology.nodes.map((node) => [node.node_key, node])),
    [filteredTopology.nodes],
  )
  const filteredEdgesById = useMemo(
    () =>
      new Map<string, TopologyEdge>(
        filteredTopology.edges.map((edge) => [
          `${edge.source_node_key}::${edge.relation_type}::${edge.target_node_key}`,
          edge,
        ]),
      ),
    [filteredTopology.edges],
  )
  const workspacesById = useMemo(
    () => new Map(workspaces.map((workspace) => [workspace.id, workspace])),
    [workspaces],
  )
  const manualEdgeNodeOptions = useMemo(
    () =>
      [...(topology?.nodes ?? [])].sort((left, right) =>
        left.display_name.localeCompare(right.display_name, undefined, { sensitivity: 'base' }),
      ),
    [topology],
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
  const pathSourceNode = useMemo(
    () => filteredTopology.nodes.find((node) => node.node_ref === pathSourceNodeRef) ?? null,
    [filteredTopology.nodes, pathSourceNodeRef],
  )
  const pathDestinationNode = useMemo(
    () => filteredTopology.nodes.find((node) => node.node_ref === pathDestinationNodeRef) ?? null,
    [filteredTopology.nodes, pathDestinationNodeRef],
  )
  const selectedParentNode = useMemo(() => {
    const parentNode = getParentNode(selectedNode, topologyNodesByRef)
    return isManagedInstanceNode(parentNode) ? parentNode : null
  }, [selectedNode, topologyNodesByRef])
  const selectedPathStatus = selectedParentNode
    ? t('topology.detail.pathFocusParentChild')
        .replace('{parent}', selectedParentNode.display_name)
        .replace('{child}', selectedNode?.display_name ?? '-')
    : selectedNode
      ? t('topology.detail.pathFocusNeighborhood').replace('{node}', selectedNode.display_name)
      : t('topology.detail.pathFocusNone')

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
          {
            subscriptionId: selectedSubscriptionId || undefined,
            resourceGroupName: focusedResourceGroupName || undefined,
          },
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
          message: err instanceof Error ? err.message : t('topology.error.unknown'),
          details: {},
        })
      } finally {
        setDetailLoading(false)
      }
    }

    void loadNodeDetail()
  }, [selectedNode, selectedWorkspaceId])

  const hasPathSourcePortInput = Boolean(pathSourcePortInput.trim())
  const pathSourcePortNumber = hasPathSourcePortInput
    ? Number(pathSourcePortInput)
    : undefined
  const hasPathDestinationPortInput = Boolean(pathDestinationPortInput.trim())
  const pathDestinationPortNumber = hasPathDestinationPortInput
    ? Number(pathDestinationPortInput)
    : undefined
  const pathAnalysisFilterSummary = [
    pathProtocolInput.trim() ? `${t('topology.detail.pathProtocol')} ${pathProtocolInput.trim()}` : null,
    pathSourceAddressInput.trim() ? `${t('topology.detail.pathSource')} ${pathSourceAddressInput.trim()}` : null,
    pathDestinationAddressInput.trim() ? `${t('topology.detail.pathDestination')} ${pathDestinationAddressInput.trim()}` : null,
    hasPathSourcePortInput ? `${t('topology.detail.pathSourcePort')} ${pathSourcePortInput.trim()}` : null,
    hasPathDestinationPortInput ? `${t('topology.detail.pathDestinationPort')} ${pathDestinationPortInput.trim()}` : null,
  ].filter((item): item is string => Boolean(item))

  async function runPathAnalysis() {
    if (!selectedWorkspaceId || !pathSourceNodeRef || !pathDestinationNodeRef) {
      setPathAnalysisMessage(t('topology.detail.pathSelectBoth'))
      return
    }
    if (hasPathSourcePortInput && (!Number.isInteger(pathSourcePortNumber) || Number(pathSourcePortNumber) < 0 || Number(pathSourcePortNumber) > 65535)) {
      setPathAnalysisMessage(t('topology.detail.pathSourcePortInvalid'))
      return
    }
    if (hasPathDestinationPortInput && (!Number.isInteger(pathDestinationPortNumber) || Number(pathDestinationPortNumber) < 0 || Number(pathDestinationPortNumber) > 65535)) {
      setPathAnalysisMessage(t('topology.detail.pathDestinationPortInvalid'))
      return
    }

    try {
      setPathAnalysisLoading(true)
      setPathAnalysisMessage('')
      const result = await getPathAnalysis(
        selectedWorkspaceId,
        pathSourceNodeRef,
        pathDestinationNodeRef,
        {
          subscriptionId: selectedSubscriptionId || undefined,
          resourceGroupName: focusedResourceGroupName || undefined,
          resourceLimit: 1000,
          protocol: pathProtocolInput.trim() || undefined,
          sourceAddressPrefix: pathSourceAddressInput.trim() || undefined,
          destinationAddressPrefix: pathDestinationAddressInput.trim() || undefined,
          sourcePort: pathSourcePortInput.trim() ? Number(pathSourcePortInput) : undefined,
          destinationPort: pathDestinationPortInput.trim() ? Number(pathDestinationPortInput) : undefined,
        },
      )
      setPathAnalysisResult(result)
    } catch (err) {
      setPathAnalysisResult(null)
      setPathAnalysisMessage(err instanceof Error ? err.message : t('topology.detail.pathAnalysisFailed'))
    } finally {
      setPathAnalysisLoading(false)
    }
  }

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
      selectedSubscriptionId,
      resourceGroupName: focusedResourceGroupName,
    })
  }, [
    clusterManagedInstanceChildren,
    expandedManagedInstanceRefs,
    focusedResourceGroupName,
    searchQuery,
    searchScope,
    selectedSubscriptionId,
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
        setGraphHoverCard(null)
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
          setGraphHoverCard(null)
        }

        const getHoverPosition = (event: any) => {
          const renderedPosition = event.renderedPosition ?? event.target?.renderedPosition?.() ?? { x: 0, y: 0 }
          return {
            x: Number(renderedPosition.x ?? 0) + 14,
            y: Number(renderedPosition.y ?? 0) + 14,
          }
        }

        const showNodeHoverCard = (event: any) => {
          const node = filteredNodesByKey.get(String(event.target.id()))
          if (!node) {
            setGraphHoverCard(null)
            return
          }

          const position = getHoverPosition(event)
          const subtitleBase = [prettifyKey(node.node_type), node.resource_type ?? '', node.location ?? '']
            .map((item) => String(item).trim())
            .filter(Boolean)
            .join(' • ')

          setGraphHoverCard({
            kind: 'node',
            title: node.display_name,
            subtitle: subtitleBase || node.node_key,
            source: node.source,
            confidence: node.confidence,
            x: position.x,
            y: position.y,
          })
        }

        const showEdgeHoverCard = (event: any) => {
          const edge = filteredEdgesById.get(String(event.target.id()))
          if (!edge) {
            setGraphHoverCard(null)
            return
          }

          const sourceNode = filteredNodesByKey.get(edge.source_node_key)
          const targetNode = filteredNodesByKey.get(edge.target_node_key)
          const position = getHoverPosition(event)

          setGraphHoverCard({
            kind: 'edge',
            title: prettifyKey(edge.relation_type),
            subtitle: `${sourceNode?.display_name ?? edge.source_node_key} → ${targetNode?.display_name ?? edge.target_node_key}`,
            source: edge.source,
            confidence: edge.confidence,
            resolver: edge.resolver,
            evidence: edge.evidence,
            x: position.x,
            y: position.y,
          })
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
          showNodeHoverCard(event)
        })

        cy.on('mousemove', 'node', showNodeHoverCard)
        cy.on('mouseout', 'node', clearHoverState)

        cy.on('mouseover', 'edge', (event: any) => {
          clearHoverState()
          const edge = event.target
          edge.addClass('hovered-edge')
          edge.connectedNodes().addClass('hovered-neighbor')
          showEdgeHoverCard(event)
        })

        cy.on('mousemove', 'edge', showEdgeHoverCard)
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
      setGraphHoverCard(null)
      activeCy?.destroy()
      if (cyRef.current === activeCy) {
        cyRef.current = null
      }
    }
  }, [filteredEdgesById, filteredNodesByKey, graphElements, layoutOptions])

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
    document.body.classList.toggle('canvas-focus-lock', canvasMaximized)
    const resizeTimer = window.setTimeout(() => {
      const cy = cyRef.current
      if (!cy) {
        return
      }
      cy.resize()
      cy.fit(undefined, canvasMaximized ? 64 : 36)
    }, 80)

    return () => {
      window.clearTimeout(resizeTimer)
      document.body.classList.remove('canvas-focus-lock')
    }
  }, [canvasMaximized, graphElements.length])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (canvasMaximized) {
          setCanvasMaximized(false)
          return
        }
        setSelectedNodeKey('')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [canvasMaximized])

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

  const edgePreview = useMemo(() => filteredTopology.edges, [filteredTopology.edges])
  const detailEntries = useMemo(() => Object.entries(nodeDetail?.details ?? {}), [nodeDetail])
  const detailScope = useMemo(() => extractDetailScope(nodeDetail), [nodeDetail])
  const inventoryTopResourceTypes = useMemo(() => {
    const counts = new Map<string, number>()

    for (const resource of inventorySummary?.items.resources ?? []) {
      const resourceType = resource.type?.trim() || t('topology.workspace.unknownType')
      counts.set(resourceType, (counts.get(resourceType) ?? 0) + 1)
    }

    return [...counts.entries()]
      .map(([resourceType, count]) => ({ resourceType, count }))
      .sort((left, right) => {
        if (right.count !== left.count) {
          return right.count - left.count
        }
        return left.resourceType.localeCompare(right.resourceType)
      })
      .slice(0, 5)
  }, [inventorySummary, t])
  const searchScopeMeta = useMemo(() => getSearchScopeMeta(searchScope, searchLabels), [searchLabels, searchScope])
  const topologyCopilotViewContext = useMemo(
    () => ({
      graph: {
        loaded: loadedSummary,
        visible: visibleSummary,
        includeNetworkInference,
        clusterManagedInstanceChildren,
        expandedManagedInstanceCount: expandedManagedInstanceRefs.length,
        focusedResourceGroupName: focusedResourceGroupName || null,
        searchQuery: searchQuery || null,
        searchScope,
        searchResultCount: searchResults.length,
      },
      nodeTypeCounts: nodeTypeCounts.slice(0, 8),
      relationCounts: relationCounts.slice(0, 8),
      relationCategoryCounts,
      selectedNode: selectedNode
        ? {
            key: selectedNode.node_key,
            ref: selectedNode.node_ref,
            name: selectedNode.display_name,
            type: selectedNode.node_type,
            resourceType: selectedNode.resource_type,
            category: getResourceCategory(selectedNode),
            source: selectedNode.source,
            confidence: selectedNode.confidence,
            location: selectedNode.location,
            childSummary: selectedNode.child_summary ?? null,
          }
        : null,
      pathAnalysis: pathAnalysisResult
        ? {
            overallVerdict: pathAnalysisResult.overall_verdict,
            candidateCount: pathAnalysisResult.path_candidates.length,
            warnings: pathAnalysisResult.warnings.slice(0, 5),
            firstCandidate: pathAnalysisResult.path_candidates[0]
              ? {
                  verdict: pathAnalysisResult.path_candidates[0].verdict,
                  reason: pathAnalysisResult.path_candidates[0].reason,
                  hopCount: pathAnalysisResult.path_candidates[0].hops.length,
                  peeringHopCount: pathAnalysisResult.path_candidates[0].peering_hop_count,
                  forwardedTraffic: pathAnalysisResult.path_candidates[0].is_forwarded_traffic,
                }
              : null,
          }
        : null,
    }),
    [
      clusterManagedInstanceChildren,
      expandedManagedInstanceRefs.length,
      focusedResourceGroupName,
      includeNetworkInference,
      loadedSummary,
      nodeTypeCounts,
      pathAnalysisResult,
      relationCategoryCounts,
      relationCounts,
      searchQuery,
      searchResults.length,
      searchScope,
      selectedNode,
      visibleSummary,
    ],
  )
  const currentPresetState = useMemo<TopologyPresetState>(
    () => ({
      presetVersion: TOPOLOGY_PRESET_VERSION,
      workspaceId: selectedWorkspaceId,
      compareRefs: expandedManagedInstanceRefs,
      clusterChildren: clusterManagedInstanceChildren,
      scope: searchScope,
      query: searchQuery,
      selectedSubscriptionId,
      resourceGroupName: focusedResourceGroupName,
    }),
    [
      clusterManagedInstanceChildren,
      expandedManagedInstanceRefs,
      focusedResourceGroupName,
      searchQuery,
      searchScope,
      selectedSubscriptionId,
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
  const orderedSavedSnapshots = useMemo(
    () => orderSavedSnapshots(savedSnapshots, snapshotSortBy, snapshotSortOrder),
    [savedSnapshots, snapshotSortBy, snapshotSortOrder],
  )
  const snapshotFilterCounts = useMemo(
    () => getSnapshotFilterCounts(savedSnapshots, RECENT_SNAPSHOT_LIMIT),
    [savedSnapshots],
  )
  const displayedSavedSnapshots = useMemo(
    () =>
      getDisplayedSnapshots(
        savedSnapshots,
        snapshotFilter,
        snapshotSortBy,
        snapshotSortOrder,
        RECENT_SNAPSHOT_LIMIT,
      ),
    [savedSnapshots, snapshotFilter, snapshotSortBy, snapshotSortOrder],
  )
  const renderedSavedSnapshots = useMemo(
    () =>
      displayedSavedSnapshots.map((snapshot) => ({
        ...snapshot,
        thumbnailDataUrl: snapshot.thumbnailDataUrl || serverSnapshotThumbnailById[snapshot.id] || '',
      })),
    [displayedSavedSnapshots, serverSnapshotThumbnailById],
  )

  useEffect(() => {
    if (snapshotStorageMode !== 'server' || !selectedWorkspaceId || !displayedSavedSnapshots.length) {
      return
    }

    const missingThumbnailSnapshots = displayedSavedSnapshots
      .filter((snapshot) => {
        const hasCachedThumbnail = Object.prototype.hasOwnProperty.call(
          serverSnapshotThumbnailById,
          snapshot.id,
        )

        return (
          snapshot.storageKind === 'server' &&
          snapshot.hasThumbnail &&
          !snapshot.thumbnailDataUrl &&
          !hasCachedThumbnail
        )
      })
      .slice(0, RECENT_SNAPSHOT_LIMIT)

    if (!missingThumbnailSnapshots.length) {
      return
    }

    let active = true

    async function hydrateSnapshotThumbnails() {
      const results = await Promise.all(
        missingThumbnailSnapshots.map(async (snapshot) => {
          try {
            const detail = await getTopologySnapshot(selectedWorkspaceId, snapshot.id)
            return [snapshot.id, detail.thumbnail_data_url || ''] as const
          } catch {
            return [snapshot.id, ''] as const
          }
        }),
      )

      if (!active) {
        return
      }

      setServerSnapshotThumbnailById((current) => {
        const next = { ...current }
        for (const [snapshotId, thumbnailDataUrl] of results) {
          next[snapshotId] = thumbnailDataUrl
        }
        return next
      })
    }

    void hydrateSnapshotThumbnails()

    return () => {
      active = false
    }
  }, [displayedSavedSnapshots, selectedWorkspaceId, serverSnapshotThumbnailById, snapshotStorageMode])

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
      ? tr('topology.controls.compareLayoutMode', { count: expandedManagedInstanceRefs.length })
      : clusterManagedInstanceChildren
        ? t('topology.controls.clusterLayoutMode')
        : t('topology.controls.defaultLayoutMode')
  const canExportTopology = Boolean(selectedWorkspaceId && graphElements.length && !topologyLoading && !graphRuntimeLoading)
  const exportUnavailableMessage = topologyLoading
    ? t('topology.export.unavailableLoading')
    : topology?.status === 'error' || error
      ? t('topology.export.unavailableError')
      : !graphElements.length
        ? t('topology.export.unavailableEmpty')
        : ''
  const managedInstanceExpanded = selectedNode
    ? expandedManagedInstanceRefs.includes(selectedNode.node_ref)
    : false
  const resourceGroupFocused = selectedNode ? focusedResourceGroupName === selectedNode.display_name : false
  const managedInstanceChildSampleNames = useMemo(
    () => getManagedInstanceChildSampleNames(selectedNode, nodeDetail).slice(0, 5),
    [nodeDetail, selectedNode],
  )
  const detailScopeSummary = useMemo(
    () =>
      formatSnapshotScopeText(
        detailScope?.subscriptionId ?? selectedSubscriptionId,
        detailScope?.resourceGroupName ?? focusedResourceGroupName,
      ),
    [detailScope, focusedResourceGroupName, selectedSubscriptionId, t],
  )
  const hasDetailScopeContext = Boolean(
    detailScope?.subscriptionId ||
      detailScope?.resourceGroupName ||
      selectedSubscriptionId ||
      focusedResourceGroupName,
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
      setExportMessage(t('topology.snapshot.presetCopyUnsupported'))
      return
    }

    try {
      await navigator.clipboard.writeText(window.location.href)
      setExportMessage(t('topology.snapshot.presetCopied'))
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : t('topology.snapshot.presetCopyFailed'))
    }
  }

  function handleSaveCurrentPreset() {
    if (!selectedWorkspaceId) {
      return
    }

    const now = new Date().toISOString()
    const nextPreset: SavedTopologyPreset = {
      id: createPresetId(),
      name: presetNameInput.trim() || `${t('topology.presets.defaultName')} ${savedPresets.length + 1}`,
      createdAt: now,
      updatedAt: now,
      ...sanitizePresetState(currentPresetState),
    }

    const nextPresets = [nextPreset, ...savedPresets]
    setSavedPresets(nextPresets)
    persistSavedTopologyPresets(nextPresets)
    setPresetNameInput('')
    setExportMessage(`${t('topology.presets.savedPrefix')} ${nextPreset.name}`)
  }

  async function handleSaveCurrentSnapshot() {
    if (!selectedWorkspaceId) {
      return
    }

    const now = new Date().toISOString()
    const thumbnailDataUrl = buildSnapshotThumbnailDataUrl(cyRef.current)
    let nextSnapshot: SavedTopologySnapshot = {
      id: createPresetId(),
      name: snapshotNameInput.trim() || `${t('topology.snapshots.defaultName')} ${savedSnapshots.length + 1}`,
      capturedAt: now,
      createdAt: now,
      updatedAt: now,
      lastRestoredAt: '',
      restoreCount: 0,
      isPinned: false,
      archivedAt: '',
      hasThumbnail: Boolean(thumbnailDataUrl),
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
    if (
      snapshotStorageMode === 'local' &&
      estimateSerializedBytes(nextSnapshots) >= SNAPSHOT_STORAGE_WARN_BYTES &&
      nextSnapshot.thumbnailDataUrl
    ) {
      savedWithoutThumbnail = true
      nextSnapshot = {
        ...nextSnapshot,
        thumbnailDataUrl: '',
        hasThumbnail: false,
      }
      nextSnapshots = [nextSnapshot, ...savedSnapshots]
    }

    const successMessage = savedWithoutThumbnail
      ? `${t('topology.snapshots.savedPrefix')} ${nextSnapshot.name} — ${t('topology.snapshots.savedWithoutThumbnail')}`
      : `${t('topology.snapshots.savedPrefix')} ${nextSnapshot.name}`

    try {
      const result = await snapshotStorageProvider.create(selectedWorkspaceId, nextSnapshot)
      await refreshSavedSnapshots(selectedWorkspaceId)
      setExportMessage(result.warning ? `${successMessage} — ${localizeSnapshotStorageMessage(result.warning)}` : successMessage)
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : t('topology.error.snapshotStorageWriteFailed'))
      return
    }

    setSnapshotNameInput('')
    setSnapshotNoteInput('')
  }

  function handleLoadSavedPreset(preset: SavedTopologyPreset) {
    const normalizedPreset = sanitizePresetState(preset)

    setSelectedWorkspaceId(normalizedPreset.workspaceId)
    setSelectedSubscriptionId(normalizedPreset.selectedSubscriptionId)
    setExpandedManagedInstanceRefs(normalizedPreset.compareRefs)
    setClusterManagedInstanceChildren(normalizedPreset.clusterChildren)
    setFocusedResourceGroupName(normalizedPreset.resourceGroupName)
    setSearchQuery(normalizedPreset.query)
    setSearchScope(normalizedPreset.scope)
    setSelectedNodeKey('')
    setNodeDetail(null)
    setSearchResultIndex(0)
    setPendingFocusNodeKey('')
    setExportMessage(`${t('topology.presets.loadedPrefix')} ${preset.name}`)
  }

  async function handleLoadSavedSnapshot(snapshot: SavedTopologySnapshot) {
    const normalizedSnapshot = sanitizeSnapshotState(snapshot)

    setSelectedWorkspaceId(normalizedSnapshot.workspaceId)
    setSelectedSubscriptionId(normalizedSnapshot.selectedSubscriptionId)
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

    try {
      await snapshotStorageProvider.recordRestore(snapshot.workspaceId, snapshot.id)
      await refreshSavedSnapshots(snapshot.workspaceId)
      setExportMessage(`${t('topology.snapshots.loadedPrefix')} ${snapshot.name} — ${t('topology.snapshots.restoreNotice')}`)
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : t('topology.error.snapshotStorageWriteFailed'))
    }
  }

  async function handleRenameSavedSnapshot(snapshot: SavedTopologySnapshot) {
    if (typeof window === 'undefined') {
      return
    }

    const nextName = window.prompt(t('topology.snapshots.renamePrompt'), snapshot.name)?.trim()
    if (!nextName || nextName === snapshot.name) {
      return
    }

    try {
      await snapshotStorageProvider.update(selectedWorkspaceId, snapshot.id, { name: nextName })
      await refreshSavedSnapshots(selectedWorkspaceId)
      setExportMessage(`${t('topology.snapshots.renamedPrefix')} ${nextName}`)
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : t('topology.error.snapshotStorageWriteFailed'))
    }
  }

  function handleRenameSavedPreset(preset: SavedTopologyPreset) {
    if (typeof window === 'undefined') {
      return
    }

    const nextName = window.prompt(t('topology.presets.renamePrompt'), preset.name)?.trim()
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
    setExportMessage(`${t('topology.presets.renamedPrefix')} ${nextName}`)
  }

  function handleDeleteSavedPreset(preset: SavedTopologyPreset) {
    if (typeof window !== 'undefined' && !window.confirm(tr('topology.presets.deleteConfirm', { name: preset.name }))) {
      return
    }

    const nextPresets = savedPresets.filter((item) => item.id !== preset.id)
    setSavedPresets(nextPresets)
    persistSavedTopologyPresets(nextPresets)
    setExportMessage(`${t('topology.presets.deletedPrefix')} ${preset.name}`)
  }

  async function handleDeleteSavedSnapshot(snapshot: SavedTopologySnapshot) {
    if (typeof window !== 'undefined' && !window.confirm(tr('topology.snapshots.deleteConfirm', { name: snapshot.name }))) {
      return
    }

    try {
      await snapshotStorageProvider.remove(selectedWorkspaceId, snapshot.id)
      await refreshSavedSnapshots(selectedWorkspaceId)
      setExportMessage(`${t('topology.snapshots.deletedPrefix')} ${snapshot.name}`)
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : t('topology.error.snapshotStorageWriteFailed'))
    }
  }

  async function handleToggleSnapshotPin(snapshot: SavedTopologySnapshot) {
    try {
      await snapshotStorageProvider.update(selectedWorkspaceId, snapshot.id, {
        isPinned: !snapshot.isPinned,
      })
      await refreshSavedSnapshots(selectedWorkspaceId)
      setExportMessage(
        `${snapshot.isPinned ? t('topology.snapshots.unpin') : t('topology.snapshots.pin')}: ${snapshot.name}`,
      )
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : t('topology.error.snapshotStorageWriteFailed'))
    }
  }

  async function handleToggleSnapshotArchive(snapshot: SavedTopologySnapshot) {
    try {
      await snapshotStorageProvider.update(selectedWorkspaceId, snapshot.id, {
        archived: !Boolean(snapshot.archivedAt),
      })
      await refreshSavedSnapshots(selectedWorkspaceId)
      setExportMessage(
        `${snapshot.archivedAt ? t('topology.snapshots.unarchive') : t('topology.snapshots.archive')}: ${snapshot.name}`,
      )
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : t('topology.error.snapshotStorageWriteFailed'))
    }
  }

  async function handleCompareSavedSnapshot(snapshot: SavedTopologySnapshot) {
    if (snapshotStorageMode !== 'server') {
      setExportMessage(t('topology.snapshot.compareServerOnly'))
      return
    }
    if (!selectedWorkspaceId || !snapshotCompareBaseId) {
      setSnapshotCompareBaseId(snapshot.id)
      setSnapshotTopologyCompareResult(null)
      setExportMessage(t('topology.snapshot.compareBaseSet').replace('{name}', snapshot.name))
      return
    }
    if (snapshotCompareBaseId === snapshot.id) {
      setExportMessage(t('topology.snapshot.compareDifferentTarget'))
      return
    }

    try {
      const result = await compareTopologySnapshots(selectedWorkspaceId, snapshotCompareBaseId, snapshot.id)
      const topologyResult = await compareTopologyArchives(selectedWorkspaceId, snapshotCompareBaseId, snapshot.id)
      setSnapshotTopologyCompareResult(topologyResult)
      const summary = result.summary.length ? result.summary.join(' • ') : t('topology.snapshot.noMetadataDiff')
      const archiveSummary =
        topologyResult.archive_status === 'available'
          ? `${t('topology.snapshot.topologyNodes')} ${formatLocalizedDeltaCounts(topologyResult.node_delta)}, ${t('topology.snapshot.edges')} ${formatLocalizedDeltaCounts(topologyResult.edge_delta)}`
          : t('topology.snapshot.archiveMissingFallback')
      setExportMessage(`${t('topology.snapshot.comparePrefix')}: ${result.base_name} → ${result.target_name} — ${summary} — ${archiveSummary}`)
    } catch (error) {
      setSnapshotTopologyCompareResult(null)
      setExportMessage(error instanceof Error ? error.message : t('topology.snapshot.compareFailed'))
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

      const summaryMessage = formatSnapshotImportSummary(
        summary.importedCount,
        summary.skippedCount,
        summary.failedCount,
      )
      setExportMessage(summary.warning ? `${summaryMessage} — ${localizeSnapshotStorageMessage(summary.warning)}` : summaryMessage)
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : t('topology.error.snapshotStorageWriteFailed'))
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
    setExportMessage(`${t('topology.presets.exportedPrefix')} ${savedPresets.length}`)
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
    setExportMessage(`${t('topology.snapshots.exportedPrefix')} ${savedSnapshots.length}`)
  }

  function handleExportTopologyDiffMarkdown() {
    if (typeof window === 'undefined' || !snapshotTopologyCompareResult) {
      return
    }

    const blob = new Blob([buildTopologyDiffMarkdown(t, snapshotTopologyCompareResult)], { type: 'text/markdown' })
    const url = window.URL.createObjectURL(blob)
    const anchor = window.document.createElement('a')
    anchor.href = url
    anchor.download = `azvision-raw-topology-diff-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.md`
    anchor.click()
    window.URL.revokeObjectURL(url)
    setExportMessage(t('topology.snapshot.rawDiffExported'))
  }

  function toggleDiffSection(section: string) {
    setDiffExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(section)) next.delete(section)
      else next.add(section)
      return next
    })
  }

  function renderDiffDrilldownSection(
    title: string,
    sectionKey: string,
    items: unknown[],
    renderItem: (item: unknown) => string,
    renderDetail?: (item: unknown) => string,
  ) {
    if (!items.length) return null
    const expanded = diffExpandedSections.has(sectionKey)
    const DISPLAY_LIMIT = 50
    return (
      <div className="snapshot-diff-drilldown-section">
        <button
          type="button"
          className="snapshot-diff-drilldown-toggle"
          onClick={() => toggleDiffSection(sectionKey)}
        >
          <span className="drilldown-caret">{expanded ? '▼' : '▶'}</span>
          <span className="drilldown-title">{title}</span>
          <span className="drilldown-count">{items.length}</span>
        </button>
        {expanded ? (
          <div className="snapshot-diff-drilldown-body">
            {items.slice(0, DISPLAY_LIMIT).map((item, idx) => (
              <div key={`${sectionKey}-${idx}`} className="snapshot-diff-drilldown-row">
                <code className="snapshot-diff-drilldown-label">{renderItem(item)}</code>
                {renderDetail ? <span className="snapshot-diff-drilldown-detail">{renderDetail(item)}</span> : null}
              </div>
            ))}
            {items.length > DISPLAY_LIMIT ? (
              <p className="hint preset-card-meta">… and {items.length - DISPLAY_LIMIT} more rows capped</p>
            ) : null}
          </div>
        ) : null}
      </div>
    )
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
        setExportMessage(t('topology.presets.noValidImport'))
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
      setExportMessage(`${t('topology.presets.importedPrefix')} ${mergedPresets.length}`)
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : t('topology.error.unknown'))
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
        setExportMessage(t('topology.snapshots.noValidImport'))
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

      const summaryMessage = formatSnapshotImportSummary(
        summary.importedCount,
        summary.skippedCount,
        summary.failedCount,
      )
      setExportMessage(
        summary.warning ? `${summaryMessage} — ${localizeSnapshotStorageMessage(summary.warning)}` : summaryMessage,
      )
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : t('topology.error.unknown'))
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
      setExportMessage(t('topology.export.unavailableNoGraph'))
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
      setExportMessage(`${t('topology.export.savedPrefix')} ${exportRecord.output_path}`)
    } catch (err) {
      setExportMessage(err instanceof Error ? err.message : t('topology.canvas.pngExportFailed'))
    } finally {
      setExportLoading(false)
    }
  }

  async function handleExportPdf() {
    const cy = cyRef.current
    if (!selectedWorkspaceId || !graphElements.length || !cy) {
      setExportMessage(t('topology.export.unavailableNoGraph'))
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
        img.onerror = () => reject(new Error(t('topology.canvas.pdfImageLoadFailed')))
      })

      const orientation = img.width > img.height ? 'landscape' : 'portrait'
      const pdf = new jsPDF({ orientation, unit: 'px', format: [img.width, img.height] })
      pdf.addImage(imageDataUrl, 'PNG', 0, 0, img.width, img.height)
      const pdfBase64 = pdf.output('datauristring')

      const exportRecord = await createExport(selectedWorkspaceId, 'pdf', pdfBase64)
      setLastExport(exportRecord)
      setExportMessage(`${t('topology.export.savedPrefix')} ${exportRecord.output_path}`)
    } catch (err) {
      setExportMessage(err instanceof Error ? err.message : t('topology.canvas.pdfExportFailed'))
    } finally {
      setExportLoading(false)
    }
  }

  function handleOpenCanvasWindow() {
    const cy = cyRef.current
    if (!graphElements.length || !cy) {
      setExportMessage(t('topology.export.unavailableNoGraph'))
      return
    }

    const imageDataUrl = cy.png({
      full: true,
      scale: 2,
      bg: '#0b1220',
    })
    const popup = window.open('', '_blank', 'noopener,noreferrer,width=1440,height=960')
    if (!popup) {
      setExportMessage(t('topology.canvas.openWindowFailed'))
      return
    }

    popup.document.write(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AzVision topology canvas</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; min-height: 100vh; background: #020617; color: #e5eefc; font-family: Inter, system-ui, sans-serif; }
    header { position: sticky; top: 0; z-index: 1; display: flex; justify-content: space-between; gap: 16px; padding: 14px 18px; background: rgba(15, 23, 42, 0.92); border-bottom: 1px solid rgba(148, 163, 184, 0.2); backdrop-filter: blur(14px); }
    h1 { margin: 0; font-size: 16px; }
    p { margin: 4px 0 0; color: #94a3b8; font-size: 12px; }
    main { padding: 18px; }
    img { display: block; width: 100%; height: auto; border-radius: 18px; border: 1px solid rgba(148, 163, 184, 0.22); background: #0b1220; }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>AzVision topology canvas</h1>
      <p>${filteredTopology.nodes.length} visible nodes • ${filteredTopology.edges.length} edges</p>
    </div>
  </header>
  <main><img src="${imageDataUrl}" alt="AzVision topology canvas" /></main>
</body>
</html>`)
    popup.document.close()
    popup.focus()
    setExportMessage(t('topology.canvas.openedWindow'))
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
    if (selectedNode.subscription_id) {
      setSelectedSubscriptionId(selectedNode.subscription_id)
    }
    setFocusedResourceGroupName((current) =>
      current === selectedNode.display_name ? '' : selectedNode.display_name,
    )
  }

  async function handleCreateManualNode() {
    if (!selectedWorkspaceId || !manualNodeNameInput.trim()) {
      setExportMessage(t('topology.manual.nodeNameRequired'))
      return
    }

    try {
      const created = await createManualNode(selectedWorkspaceId, {
        display_name: manualNodeNameInput.trim(),
        manual_type: manualNodeTypeInput,
        vendor: manualNodeVendorInput.trim() || undefined,
        environment: manualNodeEnvironmentInput.trim() || undefined,
        notes: manualNodeNotesInput.trim() || undefined,
      })

      await refreshManualModeling(selectedWorkspaceId)
      setManualModelRefreshKey((current) => current + 1)
      setManualNodeNameInput('')
      setManualNodeVendorInput('')
      setManualNodeEnvironmentInput('')
      setManualNodeNotesInput('')
      setManualEdgeSourceNodeKey((current) => current || created.node_key || `manual:${created.manual_ref}`)
      setExportMessage(t('topology.manual.nodeCreated').replace('{name}', created.display_name))
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : t('topology.manual.nodeCreateFailed'))
    }
  }

  async function handleDeleteManualNodeItem(node: ManualNode) {
    if (typeof window !== 'undefined' && !window.confirm(t('topology.manual.confirmDeleteNode').replace('{name}', node.display_name))) {
      return
    }

    try {
      await deleteManualNode(selectedWorkspaceId, node.manual_ref)
      await refreshManualModeling(selectedWorkspaceId)
      setManualModelRefreshKey((current) => current + 1)
      const nodeKey = node.node_key || `manual:${node.manual_ref}`
      if (manualEdgeSourceNodeKey === nodeKey) {
        setManualEdgeSourceNodeKey('')
      }
      if (manualEdgeTargetNodeKey === nodeKey) {
        setManualEdgeTargetNodeKey('')
      }
      setExportMessage(t('topology.manual.nodeDeleted').replace('{name}', node.display_name))
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : t('topology.manual.nodeDeleteFailed'))
    }
  }

  async function handleCreateManualEdge() {
    if (!selectedWorkspaceId || !manualEdgeSourceNodeKey || !manualEdgeTargetNodeKey) {
      setExportMessage(t('topology.manual.edgeRequired'))
      return
    }

    try {
      await createManualEdge(selectedWorkspaceId, {
        source_node_key: manualEdgeSourceNodeKey,
        target_node_key: manualEdgeTargetNodeKey,
        relation_type: manualEdgeRelationTypeInput,
        notes: manualEdgeNotesInput.trim() || undefined,
      })
      await refreshManualModeling(selectedWorkspaceId)
      setManualModelRefreshKey((current) => current + 1)
      setManualEdgeNotesInput('')
      setExportMessage(t('topology.manual.edgeCreated').replace('{relation}', manualEdgeRelationTypeInput))
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : t('topology.manual.edgeCreateFailed'))
    }
  }

  async function handleDeleteManualEdgeItem(edge: ManualEdge) {
    if (typeof window !== 'undefined' && !window.confirm(t('topology.manual.confirmDeleteEdge').replace('{relation}', edge.relation_type))) {
      return
    }

    try {
      await deleteManualEdge(selectedWorkspaceId, edge.manual_edge_ref)
      await refreshManualModeling(selectedWorkspaceId)
      setManualModelRefreshKey((current) => current + 1)
      setExportMessage(t('topology.manual.edgeDeleted').replace('{relation}', edge.relation_type))
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : t('topology.manual.edgeDeleteFailed'))
    }
  }

  function startEditManualNode(node: ManualNode) {
    setEditingManualNodeRef(node.manual_ref)
    setEditManualNodeName(node.display_name)
    setEditManualNodeType(node.manual_type)
    setEditManualNodeVendor(node.vendor ?? '')
    setEditManualNodeEnvironment(node.environment ?? '')
    setEditManualNodeNotes(node.notes ?? '')
    setEditingManualEdgeRef('')
  }

  function cancelEditManualNode() {
    setEditingManualNodeRef('')
  }

  async function handleUpdateManualNode() {
    if (!selectedWorkspaceId || !editingManualNodeRef) {
      return
    }

    const patch: UpdateManualNodeRequest = {}
    if (editManualNodeName.trim()) {
      patch.display_name = editManualNodeName.trim()
    }
    if (editManualNodeType) {
      patch.manual_type = editManualNodeType
    }
    if (editManualNodeVendor.trim()) {
      patch.vendor = editManualNodeVendor.trim()
    }
    if (editManualNodeEnvironment.trim()) {
      patch.environment = editManualNodeEnvironment.trim()
    }
    if (editManualNodeNotes.trim()) {
      patch.notes = editManualNodeNotes.trim()
    }

    try {
      await updateManualNode(selectedWorkspaceId, editingManualNodeRef, patch)
      await refreshManualModeling(selectedWorkspaceId)
      setManualModelRefreshKey((current) => current + 1)
      setEditingManualNodeRef('')
      setExportMessage(t('topology.manual.nodeUpdated'))
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : t('topology.manual.nodeUpdateFailed'))
    }
  }

  function startEditManualEdge(edge: ManualEdge) {
    setEditingManualEdgeRef(edge.manual_edge_ref)
    setEditManualEdgeSource(edge.source_node_key)
    setEditManualEdgeTarget(edge.target_node_key)
    setEditManualEdgeRelationType(edge.relation_type)
    setEditManualEdgeNotes(edge.notes ?? '')
    setEditingManualNodeRef('')
  }

  function cancelEditManualEdge() {
    setEditingManualEdgeRef('')
  }

  async function handleUpdateManualEdge() {
    if (!selectedWorkspaceId || !editingManualEdgeRef) {
      return
    }

    const patch: UpdateManualEdgeRequest = {}
    if (editManualEdgeSource) {
      patch.source_node_key = editManualEdgeSource
    }
    if (editManualEdgeTarget) {
      patch.target_node_key = editManualEdgeTarget
    }
    if (editManualEdgeRelationType) {
      patch.relation_type = editManualEdgeRelationType
    }
    if (editManualEdgeNotes.trim()) {
      patch.notes = editManualEdgeNotes.trim()
    }

    try {
      await updateManualEdge(selectedWorkspaceId, editingManualEdgeRef, patch)
      await refreshManualModeling(selectedWorkspaceId)
      setManualModelRefreshKey((current) => current + 1)
      setEditingManualEdgeRef('')
      setExportMessage(t('topology.manual.edgeUpdated'))
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : t('topology.manual.edgeUpdateFailed'))
    }
  }

  return (
    <main className="page-shell">
      <header className="hero-card">
        <div>
          <p className="eyebrow">{t('topology.hero.eyebrow')}</p>
          <h1>{t('topology.hero.title')}</h1>
          <p className="subtext">{t('topology.hero.subtext')}</p>
        </div>
        <div className={`status-pill ${authReady ? 'ready' : 'pending'}`}>
          {t('topology.hero.authReadiness')}: {authReady ? t('topology.hero.authLive') : t('topology.hero.authDiag')}
        </div>
      </header>

      {error ? <div className="error-banner">{t('topology.error.apiPrefix')} {error}</div> : null}
      {topology?.status === 'error' ? (
        <div className="error-banner">{t('topology.error.topologyPrefix')} {topology.message ?? t('topology.error.unknown')}</div>
      ) : null}
      {exportMessage ? <div className="info-banner">{exportMessage}</div> : null}

      <CopilotPanel
        workspaceId={selectedWorkspaceId}
        queryOptions={topologyCopilotOptions}
        currentView="topology"
        viewContext={topologyCopilotViewContext}
        className="topology-copilot-card"
        onError={setError}
      />

      <section className="panel-grid">
        <article className="panel-card">
          <h2>{t('topology.workspace.heading')}</h2>
          {loading ? (
            <p>{t('topology.loading')}</p>
          ) : (
            <>
              <select
                value={selectedWorkspaceId}
                onChange={(event) => {
                  setExpandedManagedInstanceRefs([])
                  setSelectedSubscriptionId('')
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
              <select
                value={selectedSubscriptionId}
                onChange={(event) => {
                  setExpandedManagedInstanceRefs([])
                  setFocusedResourceGroupName('')
                  setSelectedSubscriptionId(event.target.value)
                }}
                disabled={!selectedWorkspaceId || inventoryLoading}
              >
                <option value="">{t('topology.workspace.allSubs')}</option>
                {availableSubscriptions.map((subscription) => (
                  <option
                    key={subscription.subscription_id ?? subscription.display_name ?? 'subscription'}
                    value={subscription.subscription_id ?? ''}
                  >
                    {subscription.display_name ?? subscription.subscription_id ?? t('topology.workspace.unnamedSubscription')}
                  </option>
                ))}
              </select>
              <select
                value={focusedResourceGroupName}
                onChange={(event) => {
                  setExpandedManagedInstanceRefs([])
                  setFocusedResourceGroupName(event.target.value)
                }}
                disabled={!selectedWorkspaceId || inventoryLoading}
              >
                <option value="">{t('topology.workspace.allRGs')}</option>
                {availableResourceGroups.map((resourceGroup) => (
                  <option key={resourceGroup.id ?? resourceGroup.name ?? 'resource-group'} value={resourceGroup.name ?? ''}>
                    {resourceGroup.name ?? t('topology.workspace.unnamedRG')}
                    {resourceGroup.location ? ` • ${resourceGroup.location}` : ''}
                  </option>
                ))}
              </select>
              <p className="hint">
                {t('topology.workspace.generatedAt')} {formatDateTime(topology?.generated_at)}
                {topology?.mode ? ` • ${topology.mode}` : ''}
                {inventoryMode ? ` • ${t('topology.workspace.inventoryModeInline').replace('{mode}', inventoryMode)}` : ''}
              </p>
              <p className="hint">
                {t('topology.workspace.scope')} {selectedSubscriptionId ? t('topology.workspace.singleSubscription') : t('topology.workspace.allSubscriptions')}
                {' • '}
                {focusedResourceGroupName
                  ? t('topology.workspace.resourceGroupScoped').replace('{name}', focusedResourceGroupName)
                  : t('topology.workspace.allRGs')}
                {' • '}
                {t('topology.workspace.scopeCounts')
                  .replace('{subs}', String(availableSubscriptions.length))
                  .replace('{rgs}', String(availableResourceGroups.length))
                  .replace('{resources}', String(availableResources.length))}
              </p>
              {inventoryWarning ? <p className="hint">{t('topology.workspace.inventoryNote')} {inventoryWarning}</p> : null}
              {inventorySummary ? (
                <>
                  <div className="summary-grid summary-grid-wide section-spacer">
                    <div className="metric-box">
                      <span className="metric-label">{t('topology.workspace.scopedCollectorSubs')}</span>
                      <strong>{inventorySummary.summary.subscription_count}</strong>
                      <small>{t('topology.workspace.resourcesInWindow')}</small>
                    </div>
                    <div className="metric-box">
                      <span className="metric-label">{t('topology.workspace.scopedCollectorRGs')}</span>
                      <strong>{inventorySummary.summary.resource_group_count}</strong>
                      <small>{t('topology.workspace.resourcesInWindow')}</small>
                    </div>
                    <div className="metric-box">
                      <span className="metric-label">{t('topology.workspace.scopedCollectorResources')}</span>
                      <strong>{inventorySummary.summary.resource_count}</strong>
                      <small>{t('topology.workspace.separateProjectionCap')}</small>
                    </div>
                  </div>
                  {inventoryTopResourceTypes.length ? (
                    <div>
                      <h3 className="section-spacer">{t('topology.workspace.topResourceTypes')}</h3>
                      <ul className="edge-list compact-list">
                        {inventoryTopResourceTypes.map((item) => (
                          <li key={item.resourceType}>
                            <strong>{item.resourceType}</strong>
                            <p>{item.count} {t('topology.workspace.resourcesInWindow')}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </>
              ) : null}
              {availableResources.length ? (
                <div>
                  <h3 className="section-spacer">{t('topology.workspace.inventoryPreview')}</h3>
                  <ul className="edge-list compact-list workspace-inventory-list">
                    {availableResources.map((resource) => (
                      <li key={resource.id ?? `${resource.resource_group ?? 'rg'}:${resource.name ?? 'resource'}`}>
                        <strong>{resource.name ?? t('topology.workspace.unnamedResource')}</strong>
                        <p>{resource.type ?? t('topology.workspace.unknownType')}</p>
                        <p>
                          {(resource.resource_group ?? t('topology.workspace.noResourceGroup'))}
                          {resource.location ? ` • ${resource.location}` : ''}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </article>

        <article className="panel-card">
          <h2>{t('topology.summary.heading')}</h2>
          <div className="summary-grid summary-grid-wide">
            <div className="metric-box">
              <span className="metric-label">{t('topology.summary.metric.visibleNodes')}</span>
              <strong>{visibleSummary.totalNodes}</strong>
              <small>{t('topology.summary.loaded')} {loadedSummary.totalNodes}</small>
            </div>
            <div className="metric-box">
              <span className="metric-label">{t('topology.summary.visibleEdges')}</span>
              <strong>{visibleSummary.totalEdges}</strong>
              <small>{t('topology.summary.loaded')} {loadedSummary.totalEdges}</small>
            </div>
            <div className="metric-box">
              <span className="metric-label">{t('topology.summary.collapsedChildren')}</span>
              <strong>{loadedSummary.hiddenResources}</strong>
              <small>{t('topology.summary.miChildrenHidden')}</small>
            </div>
            <div className="metric-box">
              <span className="metric-label">{t('topology.summary.subscriptions')}</span>
              <strong>{visibleSummary.subscriptions}</strong>
            </div>
            <div className="metric-box">
              <span className="metric-label">{t('topology.summary.resourceGroups')}</span>
              <strong>{visibleSummary.resourceGroups}</strong>
            </div>
            <div className="metric-box">
              <span className="metric-label">{t('topology.summary.resources')}</span>
              <strong>{visibleSummary.resources}</strong>
            </div>
            <div className="metric-box">
              <span className="metric-label">{t('topology.summary.expandedMI')}</span>
              <strong>{expandedManagedInstances.length}</strong>
              <small>{clusterManagedInstanceChildren ? t('topology.summary.compoundClusterOn') : t('topology.summary.compoundClusterOff')}</small>
            </div>
          </div>
        </article>
      </section>

      <section className="panel-grid controls-layout collapsible-panel-grid">
        <details className="panel-card collapsible-panel topology-control-panel">
          <summary className="collapsible-summary">
            <span>{t('topology.controls.heading')}</span>
            <span className="mini-status">{t('topology.controls.defaultLayoutMode')}</span>
          </summary>
          <div className="collapsible-body">
            <div className="section-heading section-heading-inline-action">
              <span className="mini-status">{t('topology.controls.heading')}</span>
              <button type="button" className="toolbar-button" onClick={resetRelationFilters}>
                {t('topology.controls.resetRelation')}
              </button>
            </div>

          <div className="control-grid">
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={includeNetworkInference}
                onChange={(event) => setIncludeNetworkInference(event.target.checked)}
              />
              <span>{t('topology.controls.networkInferenceToggle')}</span>
            </label>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={clusterManagedInstanceChildren}
                onChange={(event) => setClusterManagedInstanceChildren(event.target.checked)}
              />
              <span>{t('topology.controls.miChildCluster')}</span>
            </label>
          </div>

          <h3 className="section-spacer">{t('topology.controls.miCompare')}</h3>
          <div className="section-heading compare-heading">
            <span className="mini-status">
              {expandedManagedInstances.length
                ? `${expandedManagedInstances.length} MI expanded for compare`
                : t('topology.controls.noCompareTargets')}
            </span>
            <div className="button-row">
              <button type="button" className="toolbar-button" onClick={handleCopyPresetLink}>
                {t('topology.controls.copyPresetLink')}
              </button>
              <button
                type="button"
                className="toolbar-button"
                onClick={clearManagedInstanceCompare}
                disabled={!expandedManagedInstances.length || topologyLoading}
              >
                {t('topology.controls.collapseAllMI')}
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
                    {t('topology.controls.collapse')}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="hint">{t('topology.controls.compareHint')}</p>
          )}

          <h3 className="section-spacer">{t('topology.snapshots.savedTitle')}</h3>
          <div className="storage-guide-card snapshot-guide-card">
            <strong>{t('topology.snapshots.guideTitle')}</strong>
            <p className="hint">{t('topology.snapshots.hint')}</p>
            <p className="hint storage-guide-copy">{t('topology.snapshots.guideBody')}</p>
            <p className="hint storage-guide-copy">
              {snapshotStorageMode === 'server' ? t('topology.snapshots.serverGuardHint') : t('topology.snapshots.localGuardHint')}
            </p>
          </div>
          {snapshotStorageMode === 'server' && localWorkspaceSnapshots.length > 0 && !localSnapshotNoticeDismissed ? (
            <div className="info-banner snapshot-import-banner">
              <strong>{tr('topology.snapshots.localNoticeTitle', { count: localWorkspaceSnapshots.length })}</strong>
              <p className="hint snapshot-import-banner-copy">{t('topology.snapshots.localNoticeBody')}</p>
              <div className="button-row preset-toolbar-row snapshot-import-banner-actions">
                <button
                  type="button"
                  className="toolbar-button primary"
                  onClick={handleImportLocalSnapshots}
                  disabled={localSnapshotImporting || !selectedWorkspaceId}
                >
                  {localSnapshotImporting ? t('topology.snapshots.importingLocal') : t('topology.snapshots.importLocal')}
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
                  {t('topology.snapshots.dismissLocalNotice')}
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
              placeholder={t('topology.snapshots.namePlaceholder')}
            />
            <textarea
              className="search-input snapshot-note-input"
              value={snapshotNoteInput}
              onChange={(event) => setSnapshotNoteInput(event.target.value)}
              placeholder={t('topology.snapshots.notePlaceholder')}
              rows={3}
            />
            <div className="button-row preset-toolbar-row">
              <button
                type="button"
                className="toolbar-button primary"
                onClick={handleSaveCurrentSnapshot}
                disabled={!selectedWorkspaceId}
              >
                {t('topology.snapshots.saveCurrent')}
              </button>
              <button
                type="button"
                className="toolbar-button"
                onClick={handleExportSavedSnapshots}
                disabled={!savedSnapshots.length}
              >
                {t('topology.snapshots.exportJson')}
              </button>
              <button type="button" className="toolbar-button" onClick={handleImportSnapshotClick}>
                {t('topology.snapshots.importJson')}
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
            <>
              <div className="snapshot-filter-tabs" role="tablist">
                {(
                  [
                    { tab: 'all' as const, label: t('topology.snapshots.filterAll'), count: snapshotFilterCounts.all },
                    { tab: 'pinned' as const, label: t('topology.snapshots.filterPinned'), count: snapshotFilterCounts.pinned },
                    { tab: 'recent' as const, label: t('topology.snapshots.filterRecent'), count: snapshotFilterCounts.recent },
                    { tab: 'archived' as const, label: t('topology.snapshots.filterArchived'), count: snapshotFilterCounts.archived },
                  ] satisfies { tab: SnapshotFilterTab; label: string; count: number }[]
                ).map(({ tab, label, count }) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={snapshotFilter === tab}
                    className={`snapshot-filter-tab${snapshotFilter === tab ? ' snapshot-filter-tab-active' : ''}`}
                    onClick={() => setSnapshotFilter(tab)}
                  >
                    {label}
                    {count > 0 ? <span className="snapshot-filter-tab-count">{count}</span> : null}
                  </button>
                ))}
              </div>
              {snapshotFilter !== 'recent' ? (
                <div className="snapshot-sort-row">
                  <span className="snapshot-sort-label">{t('topology.snapshots.sortLabel')}</span>
                  <select
                    className="snapshot-sort-select"
                    value={snapshotSortBy}
                    onChange={(e) => setSnapshotSortBy(e.target.value as SnapshotSortBy)}
                  >
                    {(
                      [
                        ['last_restored_at', t('topology.snapshots.sortLastRestored')],
                        ['captured_at', t('topology.snapshots.sortCaptured')],
                        ['updated_at', t('topology.snapshots.sortUpdated')],
                      ] satisfies [SnapshotSortBy, string][]
                    ).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="toolbar-button snapshot-sort-order-button"
                    onClick={() => setSnapshotSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'))}
                  >
                    {snapshotSortOrder === 'desc' ? t('topology.snapshots.sortDesc') : t('topology.snapshots.sortAsc')}
                  </button>
                </div>
              ) : null}
              {snapshotFilter !== 'archived' && snapshotFilterCounts.archived > 0 ? (
                <p className="hint snapshot-archived-hint">{t('topology.snapshots.archivedHint').replace('{count}', String(snapshotFilterCounts.archived))}</p>
              ) : null}
              {snapshotTopologyCompareResult ? (
                <div className="snapshot-topology-diff-card">
                  <div className="preset-card-title-row">
                    <strong>{t('topology.controls.rawDiff')}</strong>
                    <span className="mini-chip">{snapshotTopologyCompareResult.archive_status}</span>
                  </div>
                  <p className="hint preset-card-meta">
                    {t('topology.snapshot.nodes')} {formatLocalizedDeltaCounts(snapshotTopologyCompareResult.node_delta)} • {t('topology.snapshot.edges')} {formatLocalizedDeltaCounts(snapshotTopologyCompareResult.edge_delta)}
                  </p>
                  {snapshotTopologyCompareResult.summary.length ? (
                    <ul className="snapshot-diff-summary-list">
                      {snapshotTopologyCompareResult.summary.slice(0, 5).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="hint preset-card-meta">{t('topology.controls.noDiff')}</p>
                  )}
                  {snapshotTopologyCompareResult.archive_status === 'available' ? (
                    <div className="snapshot-diff-drilldown">
                      {renderDiffDrilldownSection(t('topology.diff.addedNodes'), 'node-added', snapshotTopologyCompareResult.node_delta.added, formatDeltaItemLabel, formatNodeDetail)}
                      {renderDiffDrilldownSection(t('topology.diff.removedNodes'), 'node-removed', snapshotTopologyCompareResult.node_delta.removed, formatDeltaItemLabel, formatNodeDetail)}
                      {renderDiffDrilldownSection(t('topology.diff.changedNodes'), 'node-changed', snapshotTopologyCompareResult.node_delta.changed, (item) => {
                        const c = item as Record<string, unknown>
                        return String(c.node_key ?? formatDeltaItemLabel(item))
                      }, (item) => {
                        const c = item as Record<string, unknown>
                        return `${formatNodeDetail(c.base)} → ${formatNodeDetail(c.target)}`
                      })}
                      {renderDiffDrilldownSection(t('topology.diff.addedEdges'), 'edge-added', snapshotTopologyCompareResult.edge_delta.added, formatDeltaItemLabel, formatEdgeDetail)}
                      {renderDiffDrilldownSection(t('topology.diff.removedEdges'), 'edge-removed', snapshotTopologyCompareResult.edge_delta.removed, formatDeltaItemLabel, formatEdgeDetail)}
                      {renderDiffDrilldownSection(t('topology.diff.changedEdges'), 'edge-changed', snapshotTopologyCompareResult.edge_delta.changed, (item) => {
                        const c = item as Record<string, unknown>
                        return String(c.edge_key ?? c.relation_key ?? formatDeltaItemLabel(item))
                      }, (item) => {
                        const c = item as Record<string, unknown>
                        return `${formatEdgeDetail(c.base)} → ${formatEdgeDetail(c.target)}`
                      })}
                    </div>
                  ) : null}
                  {snapshotTopologyCompareResult.archive_status === 'missing' ? (
                    <p className="hint preset-card-meta">{t('topology.controls.rawArchiveMissing')}</p>
                  ) : null}
                  <div className="button-row snapshot-diff-actions">
                    {snapshotTopologyCompareResult.archive_status === 'available' ? (
                      <button
                        type="button"
                        className="toolbar-button search-inline-button"
                        onClick={() => {
                          const all = ['node-added','node-removed','node-changed','edge-added','edge-removed','edge-changed']
                          setDiffExpandedSections((prev) => {
                            const any = all.some((s) => prev.has(s))
                            const next = new Set(prev)
                            if (any) { for (const s of all) next.delete(s) }
                            else { for (const s of all) next.add(s) }
                            return next
                          })
                        }}
                      >
                        {(() => {
                          const all = ['node-added','node-removed','node-changed','edge-added','edge-removed','edge-changed']
                          return all.some((s) => diffExpandedSections.has(s)) ? t('topology.controls.collapseAll') : t('topology.controls.expandAll')
                        })()}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="toolbar-button search-inline-button"
                      onClick={handleExportTopologyDiffMarkdown}
                    >
                      {t('topology.controls.downloadDiffMd')}
                    </button>
                  </div>
                </div>
              ) : null}
              {renderedSavedSnapshots.length ? (
                <div className="compare-chip-grid preset-list-grid">
                  {renderedSavedSnapshots.map((snapshot) => {
                    const isActiveSnapshot = snapshot.id === activeSavedSnapshotId
                    const isArchivedSnapshot = Boolean(snapshot.archivedAt)
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
                              {snapshot.storageKind === 'server' ? t('topology.snapshots.storageServer') : t('topology.snapshots.storageLocal')}
                            </span>
                            {snapshot.isPinned ? <span className="mini-chip">{t('topology.snapshots.pinnedBadge')}</span> : null}
                            {snapshotCompareBaseId === snapshot.id ? <span className="mini-chip">{t('topology.controls.compareBase')}</span> : null}
                            {isArchivedSnapshot ? <span className="mini-chip">{t('topology.snapshots.archivedBadge')}</span> : null}
                            {!snapshot.lastRestoredAt ? <span className="mini-chip">{t('topology.snapshots.neverRestoredBadge')}</span> : null}
                            {isActiveSnapshot ? <span className="mini-chip">{t('topology.snapshots.activeBadge')}</span> : null}
                          </div>
                          <p className="hint preset-card-meta">
                            {tr('topology.snapshots.meta', {
                              workspace: workspacesById.get(snapshot.workspaceId)?.name ?? snapshot.workspaceId,
                              scope: getSearchScopeMeta(snapshot.scope, searchLabels).label,
                              count: snapshot.compareRefs.length,
                            })}
                          </p>
                          <p className="hint preset-card-meta">
                            {formatSnapshotScopeText(snapshot.selectedSubscriptionId, snapshot.resourceGroupName)}
                          </p>
                          <p className="hint preset-card-meta">
                            {tr('topology.snapshots.counts', {
                              visible: snapshot.visibleNodeCount,
                              loaded: snapshot.loadedNodeCount,
                              edges: snapshot.edgeCount,
                            })}
                          </p>
                          <p className="hint preset-card-meta">
                            {snapshot.storageKind === 'server' ? t('topology.snapshots.storageServerMeta') : t('topology.snapshots.storageLocalMeta')}
                          </p>
                          {snapshot.note ? <p className="hint snapshot-note">{snapshot.note}</p> : null}
                          <p className="hint preset-card-meta">
                            {tr('topology.snapshots.generated', { time: formatDateTime(snapshot.topologyGeneratedAt) })}
                          </p>
                          <p className="hint preset-card-meta">
                            {formatTimestampText('topology.snapshots.captured', snapshot.capturedAt, formatLocalizedRelativeTime(snapshot.capturedAt))}
                          </p>
                          <p className="hint preset-card-meta">
                            {formatTimestampText('topology.snapshots.updated', snapshot.updatedAt, formatLocalizedRelativeTime(snapshot.updatedAt))}
                          </p>
                          <p className="hint preset-card-meta">
                            {snapshot.lastRestoredAt
                              ? tr('topology.snapshots.restored', {
                                time: `${formatDateTime(snapshot.lastRestoredAt)}${formatLocalizedRelativeTime(snapshot.lastRestoredAt) ? ` (${formatLocalizedRelativeTime(snapshot.lastRestoredAt)})` : ''}`,
                                count: snapshot.restoreCount,
                              })
                              : t('topology.snapshots.neverRestored')}
                          </p>
                          {isArchivedSnapshot ? (
                            <p className="hint preset-card-meta">
                              {formatTimestampText('topology.snapshots.archivedAt', snapshot.archivedAt, formatLocalizedRelativeTime(snapshot.archivedAt))}
                            </p>
                          ) : null}
                          <p className="hint storage-restore-meta">{t('topology.snapshots.restoreMetaHint')}</p>
                        </div>
                        <div className="button-row preset-card-actions">
                          <button
                            type="button"
                            className="toolbar-button search-inline-button"
                            onClick={() => handleLoadSavedSnapshot(snapshot)}
                          >
                            {t('topology.snapshots.restore')}
                          </button>
                          <button
                            type="button"
                            className="toolbar-button search-inline-button"
                            onClick={() => handleRenameSavedSnapshot(snapshot)}
                          >
                            {t('topology.snapshots.rename')}
                          </button>
                          <button
                            type="button"
                            className="toolbar-button search-inline-button"
                            onClick={() => handleToggleSnapshotPin(snapshot)}
                          >
                            {snapshot.isPinned ? t('topology.snapshots.unpin') : t('topology.snapshots.pin')}
                          </button>
                          <button
                            type="button"
                            className="toolbar-button search-inline-button"
                            onClick={() => handleToggleSnapshotArchive(snapshot)}
                          >
                            {isArchivedSnapshot ? t('topology.snapshots.unarchive') : t('topology.snapshots.archive')}
                          </button>
                          <button
                            type="button"
                            className="toolbar-button search-inline-button"
                            onClick={() => handleCompareSavedSnapshot(snapshot)}
                            disabled={snapshotStorageMode !== 'server'}
                          >
                            {snapshotCompareBaseId && snapshotCompareBaseId !== snapshot.id ? t('topology.snapshot.compare') : t('topology.snapshot.setCompareBase')}
                          </button>
                          <button
                            type="button"
                            className="toolbar-button search-inline-button"
                            onClick={() => handleDeleteSavedSnapshot(snapshot)}
                          >
                            {t('topology.snapshots.delete')}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="hint">
                  {snapshotsLoading
                    ? t('topology.loading')
                    : snapshotStorageMode === 'server'
                      ? localWorkspaceSnapshots.length > 0
                        ? t('topology.snapshots.noServerWithLocalHint')
                        : t('topology.snapshots.noServer')
                      : t('topology.snapshots.noSaved')}
                </p>
              )}
            </>
          ) : (
            <p className="hint">
              {snapshotsLoading
                ? t('topology.loading')
                : snapshotStorageMode === 'server'
                  ? localWorkspaceSnapshots.length > 0
                    ? t('topology.snapshots.noServerWithLocalHint')
                    : t('topology.snapshots.noServer')
                  : t('topology.snapshots.noSaved')}
            </p>
          )}

          <h3 className="section-spacer">{t('topology.presets.savedTitle')}</h3>
          <div className="storage-guide-card preset-guide-card">
            <strong>{t('topology.presets.guideTitle')}</strong>
            <p className="hint">{t('topology.presets.hint')}</p>
            <p className="hint storage-guide-copy">{t('topology.presets.guideBody')}</p>
          </div>
          <div className="preset-save-row">
            <input
              type="text"
              className="search-input"
              value={presetNameInput}
              onChange={(event) => setPresetNameInput(event.target.value)}
              placeholder={t('topology.presets.namePlaceholder')}
            />
            <div className="button-row preset-toolbar-row">
              <button
                type="button"
                className="toolbar-button primary"
                onClick={handleSaveCurrentPreset}
                disabled={!selectedWorkspaceId}
              >
                {t('topology.presets.saveCurrent')}
              </button>
              <button
                type="button"
                className="toolbar-button"
                onClick={handleExportSavedPresets}
                disabled={!savedPresets.length}
              >
                {t('topology.presets.exportJson')}
              </button>
              <button type="button" className="toolbar-button" onClick={handleImportPresetClick}>
                {t('topology.presets.importJson')}
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
                      {isActivePreset ? <span className="mini-chip">{t('topology.presets.activeBadge')}</span> : null}
                    </div>
                    <p className="hint preset-card-meta">
                      {tr('topology.snapshots.meta', {
                        workspace: workspacesById.get(preset.workspaceId)?.name ?? preset.workspaceId,
                        scope: getSearchScopeMeta(preset.scope, searchLabels).label,
                        count: preset.compareRefs.length,
                      })}
                    </p>
                    <p className="hint preset-card-meta">
                      {formatSnapshotScopeText(preset.selectedSubscriptionId, preset.resourceGroupName)}
                    </p>
                    <p className="hint preset-card-meta">{tr('topology.presets.updated', { time: formatDateTime(preset.updatedAt || preset.createdAt) })}</p>
                  </div>
                  <div className="button-row preset-card-actions">
                    <button type="button" className="toolbar-button search-inline-button" onClick={() => handleLoadSavedPreset(preset)}>
                      {t('topology.presets.load')}
                    </button>
                    <button type="button" className="toolbar-button search-inline-button" onClick={() => handleRenameSavedPreset(preset)}>
                      {t('topology.presets.rename')}
                    </button>
                    <button type="button" className="toolbar-button search-inline-button" onClick={() => handleDeleteSavedPreset(preset)}>
                      {t('topology.presets.delete')}
                    </button>
                  </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="hint">{t('topology.presets.noSaved')}</p>
          )}

          <h3 className="section-spacer">{t('topology.relations.categories')}</h3>
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

          <h3 className="section-spacer">{t('topology.relations.types')}</h3>
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
          </div>
        </details>

        <details className="panel-card collapsible-panel topology-control-panel">
          <summary className="collapsible-summary">
            <span>{t('topology.resourceFilters.heading')}</span>
            <span className="mini-status">{Object.values(resourceFilters).filter(Boolean).length}/5</span>
          </summary>
          <div className="collapsible-body">
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
          <p className="hint">{t('topology.controls.resourceFilterHint')}</p>
          <p className="hint">
            {tr('topology.controls.rgLazyLoad', { name: focusedResourceGroupName ? focusedResourceGroupName : t('topology.controls.allResourceGroups') })}
          </p>
          </div>
        </details>

        <details className="panel-card collapsible-panel topology-control-panel">
          <summary className="collapsible-summary">
            <span>{t('topology.manual.heading')}</span>
            <span className="mini-status">
              {manualLoading ? t('topology.canvas.syncing') : tr('topology.manual.countSummary', { nodes: manualNodes.length, edges: manualEdges.length })}
            </span>
          </summary>
          <div className="collapsible-body">

          <div className="storage-guide-card preset-guide-card">
            <strong>{t('topology.manual.overlay')}</strong>
            <p className="hint">
              {t('topology.manual.overlayDesc')}
            </p>
          </div>

          <h3 className="section-spacer">{t('topology.manual.heading.createNode')}</h3>
          <div className="preset-save-row snapshot-save-row">
            <input
              type="text"
              className="search-input"
              value={manualNodeNameInput}
              onChange={(event) => setManualNodeNameInput(event.target.value)}
              placeholder={t('topology.placeholder.displayName')}
            />
            <select value={manualNodeTypeInput} onChange={(event) => setManualNodeTypeInput(event.target.value)}>
              <option value="external-system">external-system</option>
              <option value="onprem-service">onprem-service</option>
              <option value="saas">saas</option>
              <option value="vendor-appliance">vendor-appliance</option>
              <option value="other">other</option>
            </select>
            <input
              type="text"
              className="search-input"
              value={manualNodeVendorInput}
              onChange={(event) => setManualNodeVendorInput(event.target.value)}
              placeholder={t('topology.placeholder.vendorOptional')}
            />
            <input
              type="text"
              className="search-input"
              value={manualNodeEnvironmentInput}
              onChange={(event) => setManualNodeEnvironmentInput(event.target.value)}
              placeholder={t('topology.placeholder.environmentOptional')}
            />
            <textarea
              className="search-input snapshot-note-input"
              value={manualNodeNotesInput}
              onChange={(event) => setManualNodeNotesInput(event.target.value)}
              placeholder={t('topology.placeholder.notesOptional')}
              rows={3}
            />
            <div className="button-row preset-toolbar-row">
              <button
                type="button"
                className="toolbar-button primary"
                onClick={handleCreateManualNode}
                disabled={!selectedWorkspaceId || !manualNodeNameInput.trim()}
              >
                {t('topology.manual.action.createNode')}
              </button>
            </div>
          </div>

          <h3 className="section-spacer">{t('topology.manual.heading.createEdge')}</h3>
          <div className="preset-save-row snapshot-save-row">
            <select
              value={manualEdgeSourceNodeKey}
              onChange={(event) => setManualEdgeSourceNodeKey(event.target.value)}
              disabled={!selectedWorkspaceId || !manualEdgeNodeOptions.length}
            >
              <option value="">{t('topology.manual.srcNode')}</option>
              {manualEdgeNodeOptions.map((node) => (
                <option key={`source-${node.node_key}`} value={node.node_key}>
                  {node.display_name} • {node.node_key}
                </option>
              ))}
            </select>
            <select
              value={manualEdgeTargetNodeKey}
              onChange={(event) => setManualEdgeTargetNodeKey(event.target.value)}
              disabled={!selectedWorkspaceId || !manualEdgeNodeOptions.length}
            >
              <option value="">{t('topology.manual.tgtNode')}</option>
              {manualEdgeNodeOptions.map((node) => (
                <option key={`target-${node.node_key}`} value={node.node_key}>
                  {node.display_name} • {node.node_key}
                </option>
              ))}
            </select>
            <select
              value={manualEdgeRelationTypeInput}
              onChange={(event) => setManualEdgeRelationTypeInput(event.target.value)}
            >
              <option value="connects_to">connects_to</option>
              <option value="contains">contains</option>
              <option value="manages">manages</option>
              <option value="routes">routes</option>
              <option value="secures">secures</option>
            </select>
            <textarea
              className="search-input snapshot-note-input"
              value={manualEdgeNotesInput}
              onChange={(event) => setManualEdgeNotesInput(event.target.value)}
              placeholder={t('topology.placeholder.edgeNotesOptional')}
              rows={2}
            />
            <div className="button-row preset-toolbar-row">
              <button
                type="button"
                className="toolbar-button primary"
                onClick={handleCreateManualEdge}
                disabled={!selectedWorkspaceId || !manualEdgeSourceNodeKey || !manualEdgeTargetNodeKey}
              >
                {t('topology.manual.action.createEdge')}
              </button>
            </div>
          </div>

          <h3 className="section-spacer">{t('topology.manual.listNodes')}</h3>
          {manualNodes.length ? (
            <ul className="edge-list compact-list">
              {manualNodes.map((node) => (
                <li key={node.manual_ref}>
                  {editingManualNodeRef === node.manual_ref ? (
                    <div className="preset-save-row snapshot-save-row">
                      <input type="text" className="search-input" value={editManualNodeName} onChange={(event) => setEditManualNodeName(event.target.value)} placeholder={t('topology.placeholder.displayName')} />
                      <select value={editManualNodeType} onChange={(event) => setEditManualNodeType(event.target.value)}>
                        <option value="external-system">external-system</option>
                        <option value="onprem-service">onprem-service</option>
                        <option value="saas">saas</option>
                        <option value="vendor-appliance">vendor-appliance</option>
                        <option value="other">other</option>
                      </select>
                      <input type="text" className="search-input" value={editManualNodeVendor} onChange={(event) => setEditManualNodeVendor(event.target.value)} placeholder={t('topology.placeholder.vendor')} />
                      <input type="text" className="search-input" value={editManualNodeEnvironment} onChange={(event) => setEditManualNodeEnvironment(event.target.value)} placeholder={t('topology.placeholder.environment')} />
                      <textarea className="search-input snapshot-note-input" value={editManualNodeNotes} onChange={(event) => setEditManualNodeNotes(event.target.value)} placeholder={t('topology.placeholder.notes')} rows={2} />
                      <div className="button-row preset-toolbar-row">
                        <button type="button" className="toolbar-button primary" onClick={handleUpdateManualNode}>{t('topology.manual.save')}</button>
                        <button type="button" className="toolbar-button" onClick={cancelEditManualNode}>{t('topology.manual.cancel')}</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <strong>{node.display_name}</strong>
                      <p>{node.manual_type}{node.vendor ? ` • ${node.vendor}` : ''}{node.environment ? ` • ${node.environment}` : ''}</p>
                      {node.notes ? <p>{node.notes}</p> : null}
                      <div className="button-row detail-button-row">
                        <button type="button" className="toolbar-button search-inline-button" onClick={() => selectNode(node.node_key || `manual:${node.manual_ref}`, { focus: true })}>{t('topology.manual.focus')}</button>
                        <button type="button" className="toolbar-button search-inline-button" onClick={() => startEditManualNode(node)}>{t('topology.manual.edit')}</button>
                        <button type="button" className="toolbar-button search-inline-button" onClick={() => handleDeleteManualNodeItem(node)}>{t('topology.manual.delete')}</button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">{t('topology.manual.noNodes')}</p>
          )}

          <h3 className="section-spacer">{t('topology.manual.listEdges')}</h3>
          {manualEdges.length ? (
            <ul className="edge-list compact-list">
              {manualEdges.map((edge) => (
                <li key={edge.manual_edge_ref}>
                  {editingManualEdgeRef === edge.manual_edge_ref ? (
                    <div className="preset-save-row snapshot-save-row">
                      <select value={editManualEdgeSource} onChange={(event) => setEditManualEdgeSource(event.target.value)} disabled={!manualEdgeNodeOptions.length}>
                        <option value="">{t('topology.manual.srcNode')}</option>
                        {manualEdgeNodeOptions.map((node) => (
                          <option key={`edit-source-${node.node_key}`} value={node.node_key}>{node.display_name} • {node.node_key}</option>
                        ))}
                      </select>
                      <select value={editManualEdgeTarget} onChange={(event) => setEditManualEdgeTarget(event.target.value)} disabled={!manualEdgeNodeOptions.length}>
                        <option value="">{t('topology.manual.tgtNode')}</option>
                        {manualEdgeNodeOptions.map((node) => (
                          <option key={`edit-target-${node.node_key}`} value={node.node_key}>{node.display_name} • {node.node_key}</option>
                        ))}
                      </select>
                      <select value={editManualEdgeRelationType} onChange={(event) => setEditManualEdgeRelationType(event.target.value)}>
                        <option value="connects_to">connects_to</option>
                        <option value="contains">contains</option>
                        <option value="manages">manages</option>
                        <option value="routes">routes</option>
                        <option value="secures">secures</option>
                      </select>
                      <textarea className="search-input snapshot-note-input" value={editManualEdgeNotes} onChange={(event) => setEditManualEdgeNotes(event.target.value)} placeholder={t('topology.placeholder.edgeNotes')} rows={2} />
                      <div className="button-row preset-toolbar-row">
                        <button type="button" className="toolbar-button primary" onClick={handleUpdateManualEdge}>{t('topology.manual.save')}</button>
                        <button type="button" className="toolbar-button" onClick={cancelEditManualEdge}>{t('topology.manual.cancel')}</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <strong>{edge.relation_type}</strong>
                      <p>{edge.source_node_key}</p>
                      <p>→ {edge.target_node_key}</p>
                      {edge.notes ? <p>{edge.notes}</p> : null}
                      <div className="button-row detail-button-row">
                        <button type="button" className="toolbar-button search-inline-button" onClick={() => startEditManualEdge(edge)}>{t('topology.manual.edit')}</button>
                        <button type="button" className="toolbar-button search-inline-button" onClick={() => handleDeleteManualEdgeItem(edge)}>{t('topology.manual.delete')}</button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">{t('topology.manual.noEdges')}</p>
          )}
          </div>
        </details>
      </section>

      <section className="panel-grid canvas-layout">
        <article className={`panel-card canvas-card ${canvasMaximized ? 'canvas-card-maximized' : ''}`}>
          <div className="section-heading">
            <h2>{t('topology.canvas.heading')}</h2>
            <span className="mini-status">
              {topologyLoading
                ? t('topology.canvas.syncing')
                : `${filteredTopology.nodes.length} visible / ${topology?.nodes.length ?? 0} loaded`}
            </span>
          </div>

          <p className="hint compare-layout-hint">{t('topology.controls.layoutLabel')} {compareLayoutStatus}</p>
          <p className="hint compare-layout-hint compare-path-hint">{t('topology.detail.pathSelection')}: {selectedPathStatus}</p>
          {graphRuntimeLoading ? <p className="hint compare-layout-hint">{t('topology.canvas.graphEngineLoading')}</p> : null}

          <div className="graph-toolbar">
            <div className="button-row">
              <button type="button" className="toolbar-button" onClick={fitGraph}>
                {t('topology.canvas.fitView')}
              </button>
              <button type="button" className="toolbar-button" onClick={focusSelection}>
                {t('topology.canvas.focusSel')}
              </button>
              <button type="button" className="toolbar-button" onClick={rerunLayout}>
                {t('topology.canvas.relayout')}
              </button>
              <button
                type="button"
                className="toolbar-button"
                onClick={() => setCanvasMaximized((current) => !current)}
                aria-pressed={canvasMaximized}
              >
                {canvasMaximized ? t('topology.canvas.exitFocus') : t('topology.canvas.focusMode')}
              </button>
              <button
                type="button"
                className="toolbar-button primary"
                onClick={handleExportPng}
                disabled={exportLoading || !canExportTopology}
              >
                {exportLoading ? t('topology.canvas.exporting') : t('topology.canvas.exportPng')}
              </button>
              <button
                type="button"
                className="toolbar-button"
                onClick={handleExportPdf}
                disabled={exportLoading || !canExportTopology}
              >
                {exportLoading ? t('topology.canvas.exporting') : t('topology.canvas.exportPdf')}
              </button>
              <button
                type="button"
                className="toolbar-button"
                onClick={handleOpenCanvasWindow}
                disabled={!canExportTopology}
              >
                {t('topology.canvas.openWindow')}
              </button>
            </div>

            <div className="search-toolbar">
              <div className="section-heading search-heading">
                <h3>{t('topology.canvas.searchJump')}</h3>
                <span className="mini-status">
                  {searchQuery
                    ? `${searchResults.length} match${searchResults.length === 1 ? '' : 'es'} • ${
                        searchScopeMeta.label
                      } • ${
                        activeSearchResult ? `active ${searchResultIndex + 1}/${searchResults.length}` : t('topology.search.visibleOnly')
                      }`
                    : `search ${searchScopeMeta.label.toLowerCase()}`}
                </span>
              </div>

              <div className="filter-chip-grid search-scope-grid">
                {(
                  [
                    ['visible', t('topology.search.visible')],
                    ['child-only', t('topology.search.childOnly')],
                    ['collapsed-preview', t('topology.search.collapsedPreview')],
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
                    {t('topology.canvas.prev')}
                  </button>
                  <button
                    type="button"
                    className="toolbar-button"
                    onClick={() => jumpToSearchResult(searchResultIndex + 1)}
                    disabled={!searchResults.length}
                  >
                    {t('topology.canvas.next')}
                  </button>
                  <button
                    type="submit"
                    className="toolbar-button primary"
                    disabled={!searchResults.length}
                  >
                    {t('topology.canvas.jump')}
                  </button>
                  <button
                    type="button"
                    className="toolbar-button"
                    onClick={() => setSearchQuery('')}
                    disabled={!searchQuery}
                  >
                    {t('topology.canvas.clear')}
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
                                          <span className="mini-chip">{t('topology.label.parentMI')}</span>
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
              <span className="legend-item subscription">{t('topology.label.legendSubscription')}</span>
              <span className="legend-item resourcegroup">{t('topology.label.legendResourceGroup')}</span>
              <span className="legend-item resource-data">{t('topology.label.legendData')}</span>
              <span className="legend-item resource-network">{t('topology.label.legendNetwork')}</span>
              <span className="legend-item resource-web">{t('topology.label.legendWeb')}</span>
              <span className="legend-item resource-compute">{t('topology.label.legendCompute')}</span>
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

          <div className="graph-canvas-shell">
            <div ref={graphContainerRef} className={`graph-canvas ${canvasMaximized ? 'graph-canvas-maximized' : ''}`} />
            {graphHoverCard ? (
              <div
                className="graph-hover-card"
                style={{ transform: `translate(${graphHoverCard.x}px, ${graphHoverCard.y}px)` }}
              >
                <div className="graph-hover-card-header">
                  <strong>{graphHoverCard.title}</strong>
                  <span className="mini-chip graph-hover-kind-chip">{graphHoverCard.kind}</span>
                </div>
                <p>{graphHoverCard.subtitle}</p>
                <div className="graph-hover-card-meta">
                  <span className={`mini-chip detail-source-chip source-${getSourceTone(graphHoverCard.source)}`}>
                    {formatSourceLabel(t, graphHoverCard.source)}
                  </span>
                  <span className={`mini-chip detail-confidence-chip confidence-${getConfidenceTone(graphHoverCard.confidence)}`}>
                    {formatConfidenceLabel(graphHoverCard.confidence)}
                  </span>
                  {graphHoverCard.resolver ? (
                    <span className="mini-chip graph-hover-resolver-chip">{graphHoverCard.resolver}</span>
                  ) : null}
                </div>
                {graphHoverCard.evidence?.length ? (
                  <p className="graph-hover-evidence">{t('topology.label.evidence')}: {graphHoverCard.evidence.slice(0, 2).join(' • ')}</p>
                ) : null}
              </div>
            ) : null}
          </div>

          {!canExportTopology && exportUnavailableMessage ? (
            <p className="hint export-hint">{exportUnavailableMessage}</p>
          ) : null}
          <p className="hint export-hint">{t('topology.search.tip')}</p>
          {lastExport ? (
            <p className="hint export-hint">
              {t('topology.export.lastExport')}: {formatDateTime(lastExport.created_at)} • {lastExport.output_path}
            </p>
          ) : null}
        </article>

        <article className="panel-card detail-card">
          <div className="section-heading">
            <h2>{t('topology.detail.heading')}</h2>
            <span className="mini-status">{detailLoading ? t('topology.detail.loading') : selectedNode?.node_type ?? '-'}</span>
          </div>

          {selectedNode ? (
            <div className="detail-stack">
              <div className="detail-hero">
                <strong>{selectedNode.display_name}</strong>
                <p>{selectedNode.node_key}</p>
                <div className="detail-meta-chip-row">
                  <span className={`mini-chip detail-source-chip source-${getSourceTone(selectedNode.source)}`}>
                    Source • {formatSourceLabel(t, selectedNode.source)}
                  </span>
                  <span className={`mini-chip detail-confidence-chip confidence-${getConfidenceTone(selectedNode.confidence)}`}>
                    Confidence • {formatConfidenceLabel(selectedNode.confidence)}
                  </span>
                </div>
                {selectedParentNode ? (
                  <div className="detail-breadcrumb-row">
                    <span className="mini-chip">{t('topology.label.parentMI')}</span>
                    <strong className="detail-breadcrumb-value">{selectedParentNode.display_name}</strong>
                  </div>
                ) : null}
              </div>

              <div className="detail-grid">
                <div className="detail-item">
                  <span>{t('topology.detail.source')}</span>
                  <strong>{formatSourceLabel(t, selectedNode.source)}</strong>
                </div>
                <div className="detail-item">
                  <span>{t('topology.detail.confidence')}</span>
                  <strong>{formatConfidenceLabel(selectedNode.confidence)}</strong>
                </div>
                <div className="detail-item">
                  <span>{t('topology.detail.category')}</span>
                  <strong>{getResourceCategory(selectedNode)}</strong>
                </div>
                <div className="detail-item">
                  <span>{t('topology.detail.location')}</span>
                  <strong>{selectedNode.location ?? '-'}</strong>
                </div>
              </div>

              {selectedNode.node_type === 'resource' ? (
                <div className="detail-item">
                  <span>{t('topology.detail.pathAnalysis')}</span>
                  <strong>
                    {pathAnalysisResult
                      ? `${t('topology.detail.pathVerdict')}: ${pathAnalysisResult.overall_verdict} (${t('topology.detail.pathNsgRouteEvidence')})`
                      : t('topology.detail.pathSelectSourceAndDest')}
                  </strong>
                  <p className="hint detail-inline-hint">
                    {t('topology.detail.pathSource')}: {pathSourceNode?.display_name ?? '-'} • {t('topology.detail.pathDestination')}: {pathDestinationNode?.display_name ?? '-'}
                  </p>
                  {pathAnalysisFilterSummary.length ? (
                    <p className="hint detail-inline-hint">
                      {t('topology.detail.pathActiveFilters')}: {pathAnalysisFilterSummary.join(' • ')}
                    </p>
                  ) : null}
                  <p className="hint detail-inline-hint">
                    {t('topology.detail.pathMvpNote')}
                  </p>
                  <div className="search-form detail-inline-hint">
                    <input
                      className="search-input"
                      type="text"
                      value={pathProtocolInput}
                      onChange={(event) => setPathProtocolInput(event.target.value)}
                      placeholder={t('topology.placeholder.protocol')}
                      aria-label={t('topology.detail.pathProtocol')}
                    />
                    <input
                      className="search-input"
                      type="text"
                      value={pathSourceAddressInput}
                      onChange={(event) => setPathSourceAddressInput(event.target.value)}
                      placeholder={t('topology.placeholder.sourcePrefix')}
                      aria-label={t('topology.placeholder.sourcePrefix')}
                    />
                    <input
                      className="search-input"
                      type="text"
                      value={pathDestinationAddressInput}
                      onChange={(event) => setPathDestinationAddressInput(event.target.value)}
                      placeholder={t('topology.placeholder.destinationPrefix')}
                      aria-label={t('topology.placeholder.destinationPrefix')}
                    />
                    <input
                      className="search-input"
                      type="number"
                      min="0"
                      max="65535"
                      value={pathSourcePortInput}
                      onChange={(event) => setPathSourcePortInput(event.target.value)}
                      placeholder={t('topology.placeholder.sourcePort')}
                      aria-label={t('topology.detail.pathSourcePort')}
                    />
                    <input
                      className="search-input"
                      type="number"
                      min="0"
                      max="65535"
                      value={pathDestinationPortInput}
                      onChange={(event) => setPathDestinationPortInput(event.target.value)}
                      placeholder={t('topology.placeholder.destinationPort')}
                      aria-label={t('topology.detail.pathDestinationPort')}
                    />
                  </div>
                  <div className="button-row detail-button-row">
                    <button
                      type="button"
                      className="toolbar-button"
                      onClick={() => {
                        setPathSourceNodeRef(selectedNode.node_ref)
                        setPathAnalysisResult(null)
                      }}
                    >
                      {t('topology.detail.setAsSource')}
                    </button>
                    <button
                      type="button"
                      className="toolbar-button"
                      onClick={() => {
                        setPathDestinationNodeRef(selectedNode.node_ref)
                        setPathAnalysisResult(null)
                      }}
                    >
                      {t('topology.detail.setAsDest')}
                    </button>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => void runPathAnalysis()}
                      disabled={pathAnalysisLoading || !pathSourceNodeRef || !pathDestinationNodeRef}
                    >
                      {pathAnalysisLoading ? t('topology.detail.analyzing') : t('topology.detail.analyzePath')}
                    </button>
                  </div>
                  {pathAnalysisResult ? (
                    <div className="detail-inline-hint">
                      <p className="hint">
                        {pathAnalysisResult.path_candidates[0]?.reason ?? pathAnalysisResult.warnings[0] ?? t('topology.detail.pathNoCandidate')}
                      </p>
                      {pathAnalysisResult.path_candidates[0] ? (
                        <p className="hint detail-inline-hint">
                          {t('topology.detail.pathPeering')}: {formatPeeringTraversalLabel(
                            pathAnalysisResult.path_candidates[0].peering_hop_count,
                            pathAnalysisResult.path_candidates[0].is_forwarded_traffic,
                          )}
                          {' — '}
                          {formatPeeringEvidenceHint(
                            t,
                            pathAnalysisResult.path_candidates[0].peering_hop_count,
                            pathAnalysisResult.path_candidates[0].is_forwarded_traffic,
                          )}
                        </p>
                      ) : null}
                      {pathAnalysisResult.path_candidates[0]?.hops.length ? (
                        <div className="sample-chip-list">
                          {pathAnalysisResult.path_candidates[0].hops.slice(0, 6).map((hop, index) => (
                            <span key={`${hop.resource_id}-${index}`} className="sample-chip">
                              {hop.display_name} • {hop.hop_type}
                              {hop.is_peering_boundary ? (
                                <span className="mini-chip" title={t('topology.detail.pathPeeringBoundaryHint')}>
                                  {t('topology.detail.pathPeeringBoundary')}
                                </span>
                              ) : null}
                              {hop.nsg_verdict ? (
                                <span className="mini-chip" title={[hop.nsg_name, hop.nsg_rule_name].filter(Boolean).join(' / ') || undefined}>
                                  {t('topology.detail.pathNsg')}{hop.nsg_direction ? ` ${hop.nsg_direction}` : ''}: {hop.nsg_verdict}
                                  {hop.nsg_rule_name ? ` (${hop.nsg_rule_name})` : ''}
                                </span>
                              ) : null}
                              {hop.nsg_outbound_verdict ? (
                                <span className="mini-chip" title={[hop.nsg_outbound_name, hop.nsg_outbound_rule_name].filter(Boolean).join(' / ') || undefined}>
                                  {t('topology.detail.pathNsgOutbound')}: {hop.nsg_outbound_verdict}
                                  {hop.nsg_outbound_rule_name ? ` (${hop.nsg_outbound_rule_name})` : ''}
                                </span>
                              ) : null}
                              {hop.route_verdict ? (
                                <span className="mini-chip" title={[hop.route_table_name, hop.route_name, hop.route_next_hop_type, hop.route_next_hop_ip].filter(Boolean).join(' / ') || undefined}>
                                  {t('topology.detail.pathRoute')}: {hop.route_verdict}{hop.route_name ? ` (${hop.route_name})` : ''}{hop.route_next_hop_type ? ` — ${formatRouteNextHopLabel(hop.route_next_hop_type, hop.route_next_hop_ip)}` : ''}
                                </span>
                              ) : null}
                            </span>
                          ))}
                          {pathAnalysisResult.path_candidates[0].hops.length > 6 ? (
                            <span className="sample-chip">
                              {t('topology.detail.pathMoreHops').replace('{count}', String(pathAnalysisResult.path_candidates[0].hops.length - 6))}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                      {pathAnalysisResult.warnings.length ? (
                        <p className="hint">{t('topology.label.warning')}: {pathAnalysisResult.warnings.join('; ')}</p>
                      ) : null}
                    </div>
                  ) : null}
                  {pathAnalysisMessage ? <p className="hint detail-inline-hint">{pathAnalysisMessage}</p> : null}
                </div>
              ) : null}

              {hasDetailScopeContext ? (
                <div className="detail-item">
                  <span>{t('topology.detail.scopedInvWin')}</span>
                  <strong>{detailScopeSummary}</strong>
                  <p className="hint detail-inline-hint">
                    {nodeDetail?.status === 'not-found'
                      ? t('topology.detail.scopedDetailNotFoundHint')
                      : t('topology.detail.scopedDetailHint')}
                  </p>
                  <div className="button-row detail-button-row">
                    {focusedResourceGroupName ? (
                      <button
                        type="button"
                        className="toolbar-button"
                        onClick={() => setFocusedResourceGroupName('')}
                      >
                        {t('topology.detail.loadAllRGs')}
                      </button>
                    ) : null}
                    {selectedSubscriptionId ? (
                      <button
                        type="button"
                        className="toolbar-button"
                        onClick={() => {
                          setSelectedSubscriptionId('')
                          setFocusedResourceGroupName('')
                        }}
                      >
                        {t('topology.detail.loadAllSubs')}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {isResourceGroupNode(selectedNode) ? (
                <div className="detail-item">
                  <span>{t('topology.detail.rgLazyLoad')}</span>
                  <strong>{resourceGroupFocused ? t('topology.detail.focused') : t('topology.detail.allRGsLoaded')}</strong>
                  <p className="hint detail-inline-hint">
                    {resourceGroupFocused
                      ? t('topology.detail.resourceGroupFocusedHint').replace('{name}', selectedNode.display_name)
                      : t('topology.detail.resourceGroupLoadHint')}
                  </p>
                  <div className="button-row detail-button-row">
                    <button type="button" className="toolbar-button" onClick={toggleResourceGroupFocus}>
                      {resourceGroupFocused ? t('topology.detail.loadAllRGs') : t('topology.detail.loadOnlyRG')}
                    </button>
                  </div>
                </div>
              ) : null}

              {selectedParentNode ? (
                <div className="detail-item">
                  <span>{t('topology.detail.parentMI')}</span>
                  <strong>{selectedParentNode.display_name}</strong>
                  <p className="hint detail-inline-hint">{t('topology.detail.parentManagedInstanceHint')}</p>
                  <div className="button-row detail-button-row">
                    <button
                      type="button"
                      className="toolbar-button"
                      onClick={() => selectNode(selectedParentNode.node_key, { focus: true })}
                    >
                      {t('topology.detail.focusParentMI')}
                    </button>
                  </div>
                </div>
              ) : null}

              {isManagedInstanceNode(selectedNode) && selectedNode.child_summary?.total ? (
                <div className="detail-item">
                  <span>{t('topology.detail.miChildren')}</span>
                  <strong>
                    {managedInstanceExpanded
                      ? t('topology.detail.expandedOnCanvas').replace('{count}', String(visibleManagedInstanceChildCount))
                      : t('topology.detail.availableChildren').replace('{count}', String(selectedNode.child_summary.total))}
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
                        ? t('topology.detail.expandingChildren')
                        : managedInstanceTransition === 'collapse'
                          ? t('topology.detail.collapsingChildren')
                          : managedInstanceExpanded
                            ? t('topology.detail.collapseChildren')
                            : t('topology.detail.expandChildren')}
                    </button>
                    <button type="button" className="toolbar-button" onClick={focusSelection}>
                      {t('topology.detail.focusMI')}
                    </button>
                  </div>
                  <p className="hint detail-inline-hint">
                    {managedInstanceExpanded
                      ? t('topology.detail.managedInstanceExpandedHint')
                      : t('topology.detail.managedInstanceCollapsedHint')}
                  </p>
                </div>
              ) : null}

              {nodeDetail?.message ? <div className="hint">{nodeDetail.message}</div> : null}

              <div>
                <h3>{t('topology.detail.projectedDetails')}</h3>
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
                  <p className="hint">{t('topology.detail.noProjectedDetails')}</p>
                )}
              </div>
            </div>
          ) : (
            <p className="hint">{t('topology.detail.noSelectedNode')}</p>
          )}
        </article>
      </section>

      <section className="panel-grid three-panels collapsible-panel-grid">
        <details className="panel-card collapsible-panel">
          <summary className="collapsible-summary">
            <span>{t('topology.bottom.heading.visibleNodes')}</span>
            <span className="mini-status">
              {selectedNode ? `selected: ${selectedNode.display_name}` : t('topology.bottom.noSelection')}
            </span>
          </summary>
          <div className="collapsible-body">
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
          </div>
        </details>

        <details className="panel-card collapsible-panel">
          <summary className="collapsible-summary">
            <span>{t('topology.bottom.composition')}</span>
            <span className="mini-status">{nodeTypeCounts.length} / {relationCounts.length}</span>
          </summary>
          <div className="collapsible-body">
            <div className="composition-list">
              {nodeTypeCounts.map((item) => (
                <div key={item.key} className="composition-row">
                  <span>{item.key}</span>
                  <strong>{item.count}</strong>
                </div>
              ))}
            </div>

            <h3 className="section-spacer">{t('topology.bottom.relationTypes')}</h3>
            <div className="composition-list">
              {relationCounts.map((item) => (
                <div key={item.key} className="composition-row relation-row">
                  <span>{item.key}</span>
                  <strong>{item.count}</strong>
                </div>
              ))}
            </div>
          </div>
        </details>

        <details className="panel-card collapsible-panel">
          <summary className="collapsible-summary">
            <span>{t('topology.bottom.edgePreview')}</span>
            <span className="mini-status">{edgePreview.length} edges</span>
          </summary>
          <div className="collapsible-body">
            <ul className="edge-list compact-list edge-preview-list">
              {edgePreview.map((edge) => (
                <li key={`${edge.source_node_key}-${edge.relation_type}-${edge.target_node_key}`}>
                  <strong>{edge.relation_type}</strong>
                  <p>{edge.source_node_key}</p>
                  <p>→ {edge.target_node_key}</p>
                </li>
              ))}
            </ul>
          </div>
        </details>
      </section>
    </main>
  )
}
