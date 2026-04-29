import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import type { Core } from 'cytoscape'

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

function formatRelativeTime(value?: string) {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const diffMs = Date.now() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return 'just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 30) return `${diffDay}d ago`
  const diffMo = Math.floor(diffDay / 30)
  if (diffMo < 12) return `${diffMo}mo ago`
  return `${Math.floor(diffMo / 12)}y ago`
}

function prettifyKey(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatSourceLabel(value?: string) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized) {
    return '-'
  }
  if (normalized === 'azure') {
    return 'Azure live'
  }
  if (normalized === 'azure-explicit') {
    return 'Azure explicit'
  }
  if (normalized === 'manual') {
    return 'Manual'
  }
  if (normalized === 'inferred') {
    return 'Inferred'
  }
  return prettifyKey(normalized)
}

function formatDeltaCounts(delta?: { added: unknown[]; removed: unknown[]; changed: unknown[] }) {
  if (!delta) {
    return '+0 / -0 / changed 0'
  }

  return `+${delta.added.length} / -${delta.removed.length} / changed ${delta.changed.length}`
}

function formatDeltaItemLabel(item: unknown) {
  if (!item || typeof item !== 'object') {
    return String(item ?? '-')
  }

  const row = item as Record<string, unknown>
  const displayName = row.display_name ?? row.name
  if (typeof displayName === 'string' && displayName.trim()) {
    return displayName
  }

  const nodeKey = row.node_key ?? row.node_ref ?? row.id
  if (typeof nodeKey === 'string' && nodeKey.trim()) {
    return nodeKey
  }

  const source = row.source_node_key ?? row.source
  const target = row.target_node_key ?? row.target
  const relationType = row.relation_type ?? row.type
  if (typeof source === 'string' && typeof target === 'string') {
    return `${source} → ${target}${typeof relationType === 'string' ? ` (${relationType})` : ''}`
  }

  return JSON.stringify(row)
}

function getDeltaPreviewRows(
  label: 'node' | 'edge',
  delta: { added: unknown[]; removed: unknown[]; changed: unknown[] },
) {
  return ([
    ...delta.added.slice(0, 3).map((item) => ({ key: `${label}-added-${formatDeltaItemLabel(item)}`, kind: 'added', label: formatDeltaItemLabel(item) })),
    ...delta.removed.slice(0, 3).map((item) => ({ key: `${label}-removed-${formatDeltaItemLabel(item)}`, kind: 'removed', label: formatDeltaItemLabel(item) })),
    ...delta.changed.slice(0, 3).map((item) => ({ key: `${label}-changed-${formatDeltaItemLabel(item)}`, kind: 'changed', label: formatDeltaItemLabel(item) })),
  ]).slice(0, 6)
}

function buildTopologyDiffMarkdown(result: TopologyArchiveCompareResponse) {
  const lines = [
    '# AzVision Raw Topology Diff',
    '',
    `- Workspace: ${result.workspace_id}`,
    `- Base snapshot: ${result.base_snapshot_id}`,
    `- Target snapshot: ${result.target_snapshot_id}`,
    `- Archive status: ${result.archive_status}`,
    `- Nodes: ${formatDeltaCounts(result.node_delta)}`,
    `- Edges: ${formatDeltaCounts(result.edge_delta)}`,
    '',
    '## Summary',
  ]

  if (result.summary.length) {
    for (const item of result.summary.slice(0, 20)) {
      lines.push(`- ${item}`)
    }
  } else {
    lines.push('- No raw topology differences reported.')
  }

  const previews = [
    ...getDeltaPreviewRows('node', result.node_delta),
    ...getDeltaPreviewRows('edge', result.edge_delta),
  ]

  if (previews.length) {
    lines.push('', '## Preview rows')
    for (const row of previews) {
      lines.push(`- ${row.kind}: ${row.label}`)
    }
  }

  if (result.archive_status === 'missing') {
    lines.push('', 'Archive missing for one or both snapshots; metadata compare remains the fallback.')
  }

  return `${lines.join('\n')}\n`
}


function formatPeeringTraversalLabel(peeringHopCount?: number, isForwardedTraffic?: boolean | null) {
  if (!peeringHopCount) {
    return 'intra-VNet'
  }
  if (isForwardedTraffic === true || peeringHopCount > 1) {
    return `forwarded peering (${peeringHopCount} hops)`
  }
  return 'direct peering'
}

function formatRouteNextHopLabel(nextHopType?: string, nextHopIp?: string) {
  const normalized = String(nextHopType ?? '').trim().toLowerCase()
  if (!normalized) {
    return ''
  }
  if (normalized === 'vnetlocal') {
    return 'direct within VNet'
  }
  if (normalized === 'virtualnetwork') {
    return 'direct within virtual network'
  }
  if (normalized === 'internet') {
    return 'internet-bound'
  }
  if (normalized === 'virtualappliance') {
    return nextHopIp ? `via appliance ${nextHopIp}` : 'via appliance'
  }
  if (normalized === 'virtualnetworkgateway') {
    return 'via virtual network gateway'
  }
  if (normalized === 'none') {
    return 'black hole dropped'
  }
  return nextHopIp ? `via ${nextHopType} ${nextHopIp}` : `via ${nextHopType}`
}

function formatConfidenceLabel(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '-'
  }

  return `${Math.round(value * 100)}%`
}

function getConfidenceTone(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'unknown'
  }
  if (value >= 0.95) {
    return 'high'
  }
  if (value >= 0.7) {
    return 'medium'
  }
  return 'low'
}

function getSourceTone(value?: string) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'azure') {
    return 'azure'
  }
  if (normalized === 'azure-explicit') {
    return 'azure-explicit'
  }
  if (normalized === 'manual') {
    return 'manual'
  }
  if (normalized === 'inferred') {
    return 'inferred'
  }
  return 'default'
}

type GraphHoverCard = {
  kind: 'node' | 'edge'
  title: string
  subtitle: string
  source: string
  confidence: number
  resolver?: string
  evidence?: string[]
  x: number
  y: number
}

function extractDetailScope(detail: TopologyNodeDetail | null) {
  const scope = detail?.details?.scope
  if (!scope || typeof scope !== 'object') {
    return null
  }

  const scopeRecord = scope as Record<string, unknown>
  const subscriptionId =
    typeof scopeRecord.subscription_id === 'string' ? scopeRecord.subscription_id : ''
  const resourceGroupName =
    typeof scopeRecord.resource_group_name === 'string' ? scopeRecord.resource_group_name : ''

  if (!subscriptionId && !resourceGroupName) {
    return null
  }

  return {
    subscriptionId,
    resourceGroupName,
  }
}

export function TopologyPage() {
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
  const [snapshotNameInput, setSnapshotNameInput] = useState('')
  const [snapshotNoteInput, setSnapshotNoteInput] = useState('')
  const [manualNodes, setManualNodes] = useState<ManualNode[]>([])
  const [graphHoverCard, setGraphHoverCard] = useState<GraphHoverCard | null>(null)
  const [manualEdges, setManualEdges] = useState<ManualEdge[]>([])
  const [manualLoading, setManualLoading] = useState(false)
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
      setExportMessage(error instanceof Error ? error.message : 'Manual modeling load failed')
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
        setInventoryWarning(err instanceof Error ? err.message : 'Inventory scope load failed')
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
        setError(err instanceof Error ? err.message : 'Unknown error')
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
          message: err instanceof Error ? err.message : 'Unknown error',
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
    pathProtocolInput.trim() ? `Protocol ${pathProtocolInput.trim()}` : null,
    pathSourceAddressInput.trim() ? `Source ${pathSourceAddressInput.trim()}` : null,
    pathDestinationAddressInput.trim() ? `Destination ${pathDestinationAddressInput.trim()}` : null,
    hasPathSourcePortInput ? `Source port ${pathSourcePortInput.trim()}` : null,
    hasPathDestinationPortInput ? `Destination port ${pathDestinationPortInput.trim()}` : null,
  ].filter((item): item is string => Boolean(item))

  async function runPathAnalysis() {
    if (!selectedWorkspaceId || !pathSourceNodeRef || !pathDestinationNodeRef) {
      setPathAnalysisMessage('Select both source and destination resource nodes first.')
      return
    }
    if (hasPathSourcePortInput && (!Number.isInteger(pathSourcePortNumber) || Number(pathSourcePortNumber) < 0 || Number(pathSourcePortNumber) > 65535)) {
      setPathAnalysisMessage('Source port must be an integer between 0 and 65535.')
      return
    }
    if (hasPathDestinationPortInput && (!Number.isInteger(pathDestinationPortNumber) || Number(pathDestinationPortNumber) < 0 || Number(pathDestinationPortNumber) > 65535)) {
      setPathAnalysisMessage('Destination port must be an integer between 0 and 65535.')
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
      setPathAnalysisMessage(err instanceof Error ? err.message : 'Path analysis failed')
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
  const detailScope = useMemo(() => extractDetailScope(nodeDetail), [nodeDetail])
  const inventoryTopResourceTypes = useMemo(() => {
    const counts = new Map<string, number>()

    for (const resource of inventorySummary?.items.resources ?? []) {
      const resourceType = resource.type?.trim() || 'unknown type'
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
  }, [inventorySummary])
  const searchScopeMeta = useMemo(() => getSearchScopeMeta(searchScope), [searchScope])
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
  const detailScopeSummary = useMemo(
    () =>
      UI_TEXT.snapshotScopeMeta(
        detailScope?.subscriptionId ?? selectedSubscriptionId,
        detailScope?.resourceGroupName ?? focusedResourceGroupName,
      ),
    [detailScope, focusedResourceGroupName, selectedSubscriptionId],
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
    setExportMessage(`${UI_TEXT.loadedPresetPrefix} ${preset.name}`)
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
      setExportMessage(`${UI_TEXT.loadedSnapshotPrefix} ${snapshot.name} — ${UI_TEXT.snapshotRestoreNotice}`)
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : UI_TEXT.snapshotStorageWriteFailed)
    }
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

  async function handleToggleSnapshotPin(snapshot: SavedTopologySnapshot) {
    try {
      await snapshotStorageProvider.update(selectedWorkspaceId, snapshot.id, {
        isPinned: !snapshot.isPinned,
      })
      await refreshSavedSnapshots(selectedWorkspaceId)
      setExportMessage(
        `${snapshot.isPinned ? UI_TEXT.unpinSnapshot : UI_TEXT.pinSnapshot}: ${snapshot.name}`,
      )
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : UI_TEXT.snapshotStorageWriteFailed)
    }
  }

  async function handleToggleSnapshotArchive(snapshot: SavedTopologySnapshot) {
    try {
      await snapshotStorageProvider.update(selectedWorkspaceId, snapshot.id, {
        archived: !Boolean(snapshot.archivedAt),
      })
      await refreshSavedSnapshots(selectedWorkspaceId)
      setExportMessage(
        `${snapshot.archivedAt ? UI_TEXT.unarchiveSnapshot : UI_TEXT.archiveSnapshot}: ${snapshot.name}`,
      )
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : UI_TEXT.snapshotStorageWriteFailed)
    }
  }

  async function handleCompareSavedSnapshot(snapshot: SavedTopologySnapshot) {
    if (snapshotStorageMode !== 'server') {
      setExportMessage('Snapshot compare is available in server snapshot mode.')
      return
    }
    if (!selectedWorkspaceId || !snapshotCompareBaseId) {
      setSnapshotCompareBaseId(snapshot.id)
      setSnapshotTopologyCompareResult(null)
      setExportMessage(`Snapshot compare base set: ${snapshot.name}`)
      return
    }
    if (snapshotCompareBaseId === snapshot.id) {
      setExportMessage('Choose a different target snapshot to compare.')
      return
    }

    try {
      const result = await compareTopologySnapshots(selectedWorkspaceId, snapshotCompareBaseId, snapshot.id)
      const topologyResult = await compareTopologyArchives(selectedWorkspaceId, snapshotCompareBaseId, snapshot.id)
      setSnapshotTopologyCompareResult(topologyResult)
      const summary = result.summary.length ? result.summary.join(' • ') : 'no metadata-level differences'
      const archiveSummary =
        topologyResult.archive_status === 'available'
          ? `topology nodes ${formatDeltaCounts(topologyResult.node_delta)}, edges ${formatDeltaCounts(topologyResult.edge_delta)}`
          : 'topology archive missing; metadata fallback shown'
      setExportMessage(`Snapshot compare: ${result.base_name} → ${result.target_name} — ${summary} — ${archiveSummary}`)
    } catch (error) {
      setSnapshotTopologyCompareResult(null)
      setExportMessage(error instanceof Error ? error.message : 'Snapshot compare failed')
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

  function handleExportTopologyDiffMarkdown() {
    if (typeof window === 'undefined' || !snapshotTopologyCompareResult) {
      return
    }

    const blob = new Blob([buildTopologyDiffMarkdown(snapshotTopologyCompareResult)], { type: 'text/markdown' })
    const url = window.URL.createObjectURL(blob)
    const anchor = window.document.createElement('a')
    anchor.href = url
    anchor.download = `azvision-raw-topology-diff-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.md`
    anchor.click()
    window.URL.revokeObjectURL(url)
    setExportMessage('Raw topology diff markdown exported.')
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
    if (selectedNode.subscription_id) {
      setSelectedSubscriptionId(selectedNode.subscription_id)
    }
    setFocusedResourceGroupName((current) =>
      current === selectedNode.display_name ? '' : selectedNode.display_name,
    )
  }

  async function handleCreateManualNode() {
    if (!selectedWorkspaceId || !manualNodeNameInput.trim()) {
      setExportMessage('Manual node name is required')
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
      setExportMessage(`Manual node created: ${created.display_name}`)
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : 'Manual node create failed')
    }
  }

  async function handleDeleteManualNodeItem(node: ManualNode) {
    if (typeof window !== 'undefined' && !window.confirm(`Delete manual node "${node.display_name}"?`)) {
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
      setExportMessage(`Manual node deleted: ${node.display_name}`)
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : 'Manual node delete failed')
    }
  }

  async function handleCreateManualEdge() {
    if (!selectedWorkspaceId || !manualEdgeSourceNodeKey || !manualEdgeTargetNodeKey) {
      setExportMessage('Manual edge source and target are required')
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
      setExportMessage(`Manual edge created: ${manualEdgeRelationTypeInput}`)
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : 'Manual edge create failed')
    }
  }

  async function handleDeleteManualEdgeItem(edge: ManualEdge) {
    if (typeof window !== 'undefined' && !window.confirm(`Delete manual edge "${edge.relation_type}"?`)) {
      return
    }

    try {
      await deleteManualEdge(selectedWorkspaceId, edge.manual_edge_ref)
      await refreshManualModeling(selectedWorkspaceId)
      setManualModelRefreshKey((current) => current + 1)
      setExportMessage(`Manual edge deleted: ${edge.relation_type}`)
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : 'Manual edge delete failed')
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
      setExportMessage('Manual node updated')
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : 'Manual node update failed')
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
      setExportMessage('Manual edge updated')
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : 'Manual edge update failed')
    }
  }

  return (
    <main className="page-shell">
      <header className="hero-card">
        <div>
          <p className="eyebrow">AzVision</p>
          <h1>Azure topology explorer</h1>
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
                <option value="">All subscriptions</option>
                {availableSubscriptions.map((subscription) => (
                  <option
                    key={subscription.subscription_id ?? subscription.display_name ?? 'subscription'}
                    value={subscription.subscription_id ?? ''}
                  >
                    {subscription.display_name ?? subscription.subscription_id ?? 'Unnamed subscription'}
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
                <option value="">All resource groups</option>
                {availableResourceGroups.map((resourceGroup) => (
                  <option key={resourceGroup.id ?? resourceGroup.name ?? 'resource-group'} value={resourceGroup.name ?? ''}>
                    {resourceGroup.name ?? 'Unnamed RG'}
                    {resourceGroup.location ? ` • ${resourceGroup.location}` : ''}
                  </option>
                ))}
              </select>
              <p className="hint">
                Generated at: {formatDateTime(topology?.generated_at)}
                {topology?.mode ? ` • ${topology.mode}` : ''}
                {inventoryMode ? ` • inventory ${inventoryMode}` : ''}
              </p>
              <p className="hint">
                Scope: {selectedSubscriptionId ? 'single subscription' : 'all subscriptions'}
                {' • '}
                {focusedResourceGroupName ? `RG ${focusedResourceGroupName}` : 'all resource groups'}
                {' • '}
                {availableSubscriptions.length} subscriptions / {availableResourceGroups.length} RGs listed / {availableResources.length} resources previewed
              </p>
              {inventoryWarning ? <p className="hint">Inventory note: {inventoryWarning}</p> : null}
              {inventorySummary ? (
                <>
                  <div className="summary-grid summary-grid-wide section-spacer">
                    <div className="metric-box">
                      <span className="metric-label">Scoped Collector Subs</span>
                      <strong>{inventorySummary.summary.subscription_count}</strong>
                      <small>current collector window</small>
                    </div>
                    <div className="metric-box">
                      <span className="metric-label">Scoped Collector RGs</span>
                      <strong>{inventorySummary.summary.resource_group_count}</strong>
                      <small>current collector window</small>
                    </div>
                    <div className="metric-box">
                      <span className="metric-label">Scoped Collector Resources</span>
                      <strong>{inventorySummary.summary.resource_count}</strong>
                      <small>separate from topology projection cap</small>
                    </div>
                  </div>
                  {inventoryTopResourceTypes.length ? (
                    <div>
                      <h3 className="section-spacer">Top Resource Types In Scope</h3>
                      <ul className="edge-list compact-list">
                        {inventoryTopResourceTypes.map((item) => (
                          <li key={item.resourceType}>
                            <strong>{item.resourceType}</strong>
                            <p>{item.count} resources in current collector window</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </>
              ) : null}
              {availableResources.length ? (
                <div>
                  <h3 className="section-spacer">Scoped Inventory Preview</h3>
                  <ul className="edge-list compact-list">
                    {availableResources.slice(0, 8).map((resource) => (
                      <li key={resource.id ?? `${resource.resource_group ?? 'rg'}:${resource.name ?? 'resource'}`}>
                        <strong>{resource.name ?? 'Unnamed resource'}</strong>
                        <p>{resource.type ?? 'unknown type'}</p>
                        <p>
                          {(resource.resource_group ?? 'no-rg')}
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
            <p className="hint storage-guide-copy">
              {snapshotStorageMode === 'server' ? UI_TEXT.snapshotServerGuardHint : UI_TEXT.snapshotLocalGuardHint}
            </p>
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
            <>
              <div className="snapshot-filter-tabs" role="tablist">
                {(
                  [
                    { tab: 'all' as const, label: UI_TEXT.snapshotFilterAll, count: snapshotFilterCounts.all },
                    { tab: 'pinned' as const, label: UI_TEXT.snapshotFilterPinned, count: snapshotFilterCounts.pinned },
                    { tab: 'recent' as const, label: UI_TEXT.snapshotFilterRecent, count: snapshotFilterCounts.recent },
                    { tab: 'archived' as const, label: UI_TEXT.snapshotFilterArchived, count: snapshotFilterCounts.archived },
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
                  <span className="snapshot-sort-label">{UI_TEXT.snapshotSortLabel}</span>
                  <select
                    className="snapshot-sort-select"
                    value={snapshotSortBy}
                    onChange={(e) => setSnapshotSortBy(e.target.value as SnapshotSortBy)}
                  >
                    {(Object.entries(UI_TEXT.snapshotSortByOptions) as [SnapshotSortBy, string][]).map(
                      ([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ),
                    )}
                  </select>
                  <button
                    type="button"
                    className="toolbar-button snapshot-sort-order-button"
                    onClick={() => setSnapshotSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'))}
                  >
                    {snapshotSortOrder === 'desc' ? UI_TEXT.snapshotSortOrderDesc : UI_TEXT.snapshotSortOrderAsc}
                  </button>
                </div>
              ) : null}
              {snapshotFilter !== 'archived' && snapshotFilterCounts.archived > 0 ? (
                <p className="hint snapshot-archived-hint">{UI_TEXT.snapshotArchivedHint(snapshotFilterCounts.archived)}</p>
              ) : null}
              {snapshotTopologyCompareResult ? (
                <div className="snapshot-topology-diff-card">
                  <div className="preset-card-title-row">
                    <strong>Raw topology diff</strong>
                    <span className="mini-chip">{snapshotTopologyCompareResult.archive_status}</span>
                  </div>
                  <p className="hint preset-card-meta">
                    Nodes {formatDeltaCounts(snapshotTopologyCompareResult.node_delta)} • Edges {formatDeltaCounts(snapshotTopologyCompareResult.edge_delta)}
                  </p>
                  {snapshotTopologyCompareResult.summary.length ? (
                    <ul className="snapshot-diff-summary-list">
                      {snapshotTopologyCompareResult.summary.slice(0, 5).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="hint preset-card-meta">No raw topology differences reported.</p>
                  )}
                  {snapshotTopologyCompareResult.archive_status === 'available' ? (
                    <div className="snapshot-diff-preview-grid">
                      {[
                        ...getDeltaPreviewRows('node', snapshotTopologyCompareResult.node_delta),
                        ...getDeltaPreviewRows('edge', snapshotTopologyCompareResult.edge_delta),
                      ].map((row) => (
                        <span key={row.key} className={`snapshot-diff-preview-row snapshot-diff-preview-${row.kind}`}>
                          {row.kind}: {row.label}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {snapshotTopologyCompareResult.archive_status === 'missing' ? (
                    <p className="hint preset-card-meta">Raw archive is missing for one or both snapshots; metadata compare remains the safe fallback.</p>
                  ) : null}
                  <div className="button-row snapshot-diff-actions">
                    <button
                      type="button"
                      className="toolbar-button search-inline-button"
                      onClick={handleExportTopologyDiffMarkdown}
                    >
                      Download diff markdown
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
                              {UI_TEXT.snapshotStorageBadgeLabel(snapshot.storageKind)}
                            </span>
                            {snapshot.isPinned ? <span className="mini-chip">{UI_TEXT.pinnedSnapshotBadge}</span> : null}
                            {snapshotCompareBaseId === snapshot.id ? <span className="mini-chip">Compare base</span> : null}
                            {isArchivedSnapshot ? <span className="mini-chip">{UI_TEXT.archivedSnapshotBadge}</span> : null}
                            {!snapshot.lastRestoredAt ? <span className="mini-chip">{UI_TEXT.neverRestoredSnapshotBadge}</span> : null}
                            {isActiveSnapshot ? <span className="mini-chip">{UI_TEXT.activeSnapshotBadge}</span> : null}
                          </div>
                          <p className="hint preset-card-meta">
                            {UI_TEXT.snapshotMeta(
                              getSearchScopeMeta(snapshot.scope).label,
                              snapshot.compareRefs.length,
                              workspacesById.get(snapshot.workspaceId)?.name ?? snapshot.workspaceId,
                            )}
                          </p>
                          <p className="hint preset-card-meta">
                            {UI_TEXT.snapshotScopeMeta(snapshot.selectedSubscriptionId, snapshot.resourceGroupName)}
                          </p>
                          <p className="hint preset-card-meta">
                            {UI_TEXT.snapshotCounts(snapshot.visibleNodeCount, snapshot.loadedNodeCount, snapshot.edgeCount)}
                          </p>
                          <p className="hint preset-card-meta">
                            {UI_TEXT.snapshotStorageMeta(snapshot.storageKind)}
                          </p>
                          {snapshot.note ? <p className="hint snapshot-note">{snapshot.note}</p> : null}
                          <p className="hint preset-card-meta">
                            Generated {formatDateTime(snapshot.topologyGeneratedAt)}
                          </p>
                          <p className="hint preset-card-meta">
                            {UI_TEXT.snapshotCapturedMeta(snapshot.capturedAt, formatRelativeTime(snapshot.capturedAt))}
                          </p>
                          <p className="hint preset-card-meta">
                            {UI_TEXT.snapshotUpdatedMeta(snapshot.updatedAt, formatRelativeTime(snapshot.updatedAt))}
                          </p>
                          <p className="hint preset-card-meta">
                            {UI_TEXT.snapshotRestoredMeta(snapshot.lastRestoredAt, snapshot.restoreCount, formatRelativeTime(snapshot.lastRestoredAt))}
                          </p>
                          {isArchivedSnapshot ? (
                            <p className="hint preset-card-meta">
                              {UI_TEXT.snapshotArchivedMeta(snapshot.archivedAt, formatRelativeTime(snapshot.archivedAt))}
                            </p>
                          ) : null}
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
                            onClick={() => handleToggleSnapshotPin(snapshot)}
                          >
                            {snapshot.isPinned ? UI_TEXT.unpinSnapshot : UI_TEXT.pinSnapshot}
                          </button>
                          <button
                            type="button"
                            className="toolbar-button search-inline-button"
                            onClick={() => handleToggleSnapshotArchive(snapshot)}
                          >
                            {isArchivedSnapshot ? UI_TEXT.unarchiveSnapshot : UI_TEXT.archiveSnapshot}
                          </button>
                          <button
                            type="button"
                            className="toolbar-button search-inline-button"
                            onClick={() => handleCompareSavedSnapshot(snapshot)}
                            disabled={snapshotStorageMode !== 'server'}
                          >
                            {snapshotCompareBaseId && snapshotCompareBaseId !== snapshot.id ? 'Compare' : 'Set compare base'}
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
                <p className="hint">
                  {snapshotsLoading
                    ? UI_TEXT.loading
                    : snapshotStorageMode === 'server'
                      ? localWorkspaceSnapshots.length > 0
                        ? UI_TEXT.noServerSnapshotsWithLocalHint
                        : UI_TEXT.noServerSnapshots
                      : UI_TEXT.noSavedSnapshots}
                </p>
              )}
            </>
          ) : (
            <p className="hint">
              {snapshotsLoading
                ? UI_TEXT.loading
                : snapshotStorageMode === 'server'
                  ? localWorkspaceSnapshots.length > 0
                    ? UI_TEXT.noServerSnapshotsWithLocalHint
                    : UI_TEXT.noServerSnapshots
                  : UI_TEXT.noSavedSnapshots}
            </p>
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
                    <p className="hint preset-card-meta">
                      {UI_TEXT.snapshotScopeMeta(preset.selectedSubscriptionId, preset.resourceGroupName)}
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

        <article className="panel-card">
          <div className="section-heading">
            <h2>Manual Modeling</h2>
            <span className="mini-status">
              {manualLoading ? 'syncing...' : `${manualNodes.length} nodes • ${manualEdges.length} edges`}
            </span>
          </div>

          <div className="storage-guide-card preset-guide-card">
            <strong>Manual topology overlay</strong>
            <p className="hint">
              Add external systems or consultant annotations, then connect them to Azure nodes with manual edges.
            </p>
          </div>

          <h3 className="section-spacer">Create Manual Node</h3>
          <div className="preset-save-row snapshot-save-row">
            <input
              type="text"
              className="search-input"
              value={manualNodeNameInput}
              onChange={(event) => setManualNodeNameInput(event.target.value)}
              placeholder="Display name"
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
              placeholder="Vendor (optional)"
            />
            <input
              type="text"
              className="search-input"
              value={manualNodeEnvironmentInput}
              onChange={(event) => setManualNodeEnvironmentInput(event.target.value)}
              placeholder="Environment (optional)"
            />
            <textarea
              className="search-input snapshot-note-input"
              value={manualNodeNotesInput}
              onChange={(event) => setManualNodeNotesInput(event.target.value)}
              placeholder="Notes (optional)"
              rows={3}
            />
            <div className="button-row preset-toolbar-row">
              <button
                type="button"
                className="toolbar-button primary"
                onClick={handleCreateManualNode}
                disabled={!selectedWorkspaceId || !manualNodeNameInput.trim()}
              >
                Create manual node
              </button>
            </div>
          </div>

          <h3 className="section-spacer">Create Manual Edge</h3>
          <div className="preset-save-row snapshot-save-row">
            <select
              value={manualEdgeSourceNodeKey}
              onChange={(event) => setManualEdgeSourceNodeKey(event.target.value)}
              disabled={!selectedWorkspaceId || !manualEdgeNodeOptions.length}
            >
              <option value="">Source node</option>
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
              <option value="">Target node</option>
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
              placeholder="Edge notes (optional)"
              rows={2}
            />
            <div className="button-row preset-toolbar-row">
              <button
                type="button"
                className="toolbar-button primary"
                onClick={handleCreateManualEdge}
                disabled={!selectedWorkspaceId || !manualEdgeSourceNodeKey || !manualEdgeTargetNodeKey}
              >
                Create manual edge
              </button>
            </div>
          </div>

          <h3 className="section-spacer">Manual Nodes</h3>
          {manualNodes.length ? (
            <ul className="edge-list compact-list">
              {manualNodes.map((node) => (
                <li key={node.manual_ref}>
                  {editingManualNodeRef === node.manual_ref ? (
                    <div className="preset-save-row snapshot-save-row">
                      <input type="text" className="search-input" value={editManualNodeName} onChange={(event) => setEditManualNodeName(event.target.value)} placeholder="Display name" />
                      <select value={editManualNodeType} onChange={(event) => setEditManualNodeType(event.target.value)}>
                        <option value="external-system">external-system</option>
                        <option value="onprem-service">onprem-service</option>
                        <option value="saas">saas</option>
                        <option value="vendor-appliance">vendor-appliance</option>
                        <option value="other">other</option>
                      </select>
                      <input type="text" className="search-input" value={editManualNodeVendor} onChange={(event) => setEditManualNodeVendor(event.target.value)} placeholder="Vendor" />
                      <input type="text" className="search-input" value={editManualNodeEnvironment} onChange={(event) => setEditManualNodeEnvironment(event.target.value)} placeholder="Environment" />
                      <textarea className="search-input snapshot-note-input" value={editManualNodeNotes} onChange={(event) => setEditManualNodeNotes(event.target.value)} placeholder="Notes" rows={2} />
                      <div className="button-row preset-toolbar-row">
                        <button type="button" className="toolbar-button primary" onClick={handleUpdateManualNode}>Save</button>
                        <button type="button" className="toolbar-button" onClick={cancelEditManualNode}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <strong>{node.display_name}</strong>
                      <p>{node.manual_type}{node.vendor ? ` • ${node.vendor}` : ''}{node.environment ? ` • ${node.environment}` : ''}</p>
                      {node.notes ? <p>{node.notes}</p> : null}
                      <div className="button-row detail-button-row">
                        <button type="button" className="toolbar-button search-inline-button" onClick={() => selectNode(node.node_key || `manual:${node.manual_ref}`, { focus: true })}>Focus</button>
                        <button type="button" className="toolbar-button search-inline-button" onClick={() => startEditManualNode(node)}>Edit</button>
                        <button type="button" className="toolbar-button search-inline-button" onClick={() => handleDeleteManualNodeItem(node)}>Delete</button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">No manual nodes yet</p>
          )}

          <h3 className="section-spacer">Manual Edges</h3>
          {manualEdges.length ? (
            <ul className="edge-list compact-list">
              {manualEdges.map((edge) => (
                <li key={edge.manual_edge_ref}>
                  {editingManualEdgeRef === edge.manual_edge_ref ? (
                    <div className="preset-save-row snapshot-save-row">
                      <select value={editManualEdgeSource} onChange={(event) => setEditManualEdgeSource(event.target.value)} disabled={!manualEdgeNodeOptions.length}>
                        <option value="">Source node</option>
                        {manualEdgeNodeOptions.map((node) => (
                          <option key={`edit-source-${node.node_key}`} value={node.node_key}>{node.display_name} • {node.node_key}</option>
                        ))}
                      </select>
                      <select value={editManualEdgeTarget} onChange={(event) => setEditManualEdgeTarget(event.target.value)} disabled={!manualEdgeNodeOptions.length}>
                        <option value="">Target node</option>
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
                      <textarea className="search-input snapshot-note-input" value={editManualEdgeNotes} onChange={(event) => setEditManualEdgeNotes(event.target.value)} placeholder="Edge notes" rows={2} />
                      <div className="button-row preset-toolbar-row">
                        <button type="button" className="toolbar-button primary" onClick={handleUpdateManualEdge}>Save</button>
                        <button type="button" className="toolbar-button" onClick={cancelEditManualEdge}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <strong>{edge.relation_type}</strong>
                      <p>{edge.source_node_key}</p>
                      <p>→ {edge.target_node_key}</p>
                      {edge.notes ? <p>{edge.notes}</p> : null}
                      <div className="button-row detail-button-row">
                        <button type="button" className="toolbar-button search-inline-button" onClick={() => startEditManualEdge(edge)}>Edit</button>
                        <button type="button" className="toolbar-button search-inline-button" onClick={() => handleDeleteManualEdgeItem(edge)}>Delete</button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">No manual edges yet</p>
          )}
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

          <div className="graph-canvas-shell">
            <div ref={graphContainerRef} className="graph-canvas" />
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
                    {formatSourceLabel(graphHoverCard.source)}
                  </span>
                  <span className={`mini-chip detail-confidence-chip confidence-${getConfidenceTone(graphHoverCard.confidence)}`}>
                    {formatConfidenceLabel(graphHoverCard.confidence)}
                  </span>
                  {graphHoverCard.resolver ? (
                    <span className="mini-chip graph-hover-resolver-chip">{graphHoverCard.resolver}</span>
                  ) : null}
                </div>
                {graphHoverCard.evidence?.length ? (
                  <p className="graph-hover-evidence">Evidence: {graphHoverCard.evidence.slice(0, 2).join(' • ')}</p>
                ) : null}
              </div>
            ) : null}
          </div>

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
                <div className="detail-meta-chip-row">
                  <span className={`mini-chip detail-source-chip source-${getSourceTone(selectedNode.source)}`}>
                    Source • {formatSourceLabel(selectedNode.source)}
                  </span>
                  <span className={`mini-chip detail-confidence-chip confidence-${getConfidenceTone(selectedNode.confidence)}`}>
                    Confidence • {formatConfidenceLabel(selectedNode.confidence)}
                  </span>
                </div>
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
                  <strong>{formatSourceLabel(selectedNode.source)}</strong>
                </div>
                <div className="detail-item">
                  <span>Confidence</span>
                  <strong>{formatConfidenceLabel(selectedNode.confidence)}</strong>
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

              {selectedNode.node_type === 'resource' ? (
                <div className="detail-item">
                  <span>Network Path Analysis</span>
                  <strong>
                    {pathAnalysisResult
                      ? `Verdict: ${pathAnalysisResult.overall_verdict} (NSG + route evidence)`
                      : 'Select source and destination'}
                  </strong>
                  <p className="hint detail-inline-hint">
                    Source: {pathSourceNode?.display_name ?? '-'} • Destination: {pathDestinationNode?.display_name ?? '-'}
                  </p>
                  {pathAnalysisFilterSummary.length ? (
                    <p className="hint detail-inline-hint">
                      Active filters: {pathAnalysisFilterSummary.join(' • ')}
                    </p>
                  ) : null}
                  <p className="hint detail-inline-hint">
                    MVP note: path analysis evaluates inbound/outbound NSG checkpoints, peering traversal type, source/destination prefix filters, source/destination ports, service tags, and route evidence conservatively. Source port filtering is rarely needed; specify it only when you want stricter NSG matching.
                  </p>
                  <div className="search-form detail-inline-hint">
                    <input
                      className="search-input"
                      type="text"
                      value={pathProtocolInput}
                      onChange={(event) => setPathProtocolInput(event.target.value)}
                      placeholder="Protocol, e.g. Tcp"
                      aria-label="Path analysis protocol"
                    />
                    <input
                      className="search-input"
                      type="text"
                      value={pathSourceAddressInput}
                      onChange={(event) => setPathSourceAddressInput(event.target.value)}
                      placeholder="Source prefix/IP, optional"
                      aria-label="Path analysis source address prefix"
                    />
                    <input
                      className="search-input"
                      type="text"
                      value={pathDestinationAddressInput}
                      onChange={(event) => setPathDestinationAddressInput(event.target.value)}
                      placeholder="Destination prefix/IP, optional"
                      aria-label="Path analysis destination address prefix"
                    />
                    <input
                      className="search-input"
                      type="number"
                      min="0"
                      max="65535"
                      value={pathSourcePortInput}
                      onChange={(event) => setPathSourcePortInput(event.target.value)}
                      placeholder="Source port, e.g. 50000"
                      aria-label="Path analysis source port"
                    />
                    <input
                      className="search-input"
                      type="number"
                      min="0"
                      max="65535"
                      value={pathDestinationPortInput}
                      onChange={(event) => setPathDestinationPortInput(event.target.value)}
                      placeholder="Destination port, e.g. 443"
                      aria-label="Path analysis destination port"
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
                      Set as source
                    </button>
                    <button
                      type="button"
                      className="toolbar-button"
                      onClick={() => {
                        setPathDestinationNodeRef(selectedNode.node_ref)
                        setPathAnalysisResult(null)
                      }}
                    >
                      Set as destination
                    </button>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => void runPathAnalysis()}
                      disabled={pathAnalysisLoading || !pathSourceNodeRef || !pathDestinationNodeRef}
                    >
                      {pathAnalysisLoading ? 'Analyzing...' : 'Analyze path'}
                    </button>
                  </div>
                  {pathAnalysisResult ? (
                    <div className="detail-inline-hint">
                      <p className="hint">
                        {pathAnalysisResult.path_candidates[0]?.reason ?? pathAnalysisResult.warnings[0] ?? 'No path candidate returned.'}
                      </p>
                      {pathAnalysisResult.path_candidates[0] ? (
                        <p className="hint detail-inline-hint">
                          Peering: {formatPeeringTraversalLabel(
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
                              {hop.is_peering_boundary ? <span className="mini-chip">Peering boundary</span> : null}
                              {hop.nsg_verdict ? (
                                <span className="mini-chip" title={[hop.nsg_name, hop.nsg_rule_name].filter(Boolean).join(' / ') || undefined}>
                                  NSG{hop.nsg_direction ? ` ${hop.nsg_direction}` : ''}: {hop.nsg_verdict}
                                  {hop.nsg_rule_name ? ` (${hop.nsg_rule_name})` : ''}
                                </span>
                              ) : null}
                              {hop.nsg_outbound_verdict ? (
                                <span className="mini-chip" title={[hop.nsg_outbound_name, hop.nsg_outbound_rule_name].filter(Boolean).join(' / ') || undefined}>
                                  NSG outbound: {hop.nsg_outbound_verdict}
                                  {hop.nsg_outbound_rule_name ? ` (${hop.nsg_outbound_rule_name})` : ''}
                                </span>
                              ) : null}
                              {hop.route_verdict ? (
                                <span className="mini-chip" title={[hop.route_table_name, hop.route_name, hop.route_next_hop_type, hop.route_next_hop_ip].filter(Boolean).join(' / ') || undefined}>
                                  Route: {hop.route_verdict}{hop.route_name ? ` (${hop.route_name})` : ''}{hop.route_next_hop_type ? ` — ${formatRouteNextHopLabel(hop.route_next_hop_type, hop.route_next_hop_ip)}` : ''}
                                </span>
                              ) : null}
                            </span>
                          ))}
                          {pathAnalysisResult.path_candidates[0].hops.length > 6 ? (
                            <span className="sample-chip">
                              +{pathAnalysisResult.path_candidates[0].hops.length - 6} more hops
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                      {pathAnalysisResult.warnings.length ? (
                        <p className="hint">Warning: {pathAnalysisResult.warnings.join('; ')}</p>
                      ) : null}
                    </div>
                  ) : null}
                  {pathAnalysisMessage ? <p className="hint detail-inline-hint">{pathAnalysisMessage}</p> : null}
                </div>
              ) : null}

              {hasDetailScopeContext ? (
                <div className="detail-item">
                  <span>Scoped Inventory Window</span>
                  <strong>{detailScopeSummary}</strong>
                  <p className="hint detail-inline-hint">
                    {nodeDetail?.status === 'not-found'
                      ? UI_TEXT.scopedDetailNotFoundHint
                      : UI_TEXT.scopedDetailHint}
                  </p>
                  <div className="button-row detail-button-row">
                    {focusedResourceGroupName ? (
                      <button
                        type="button"
                        className="toolbar-button"
                        onClick={() => setFocusedResourceGroupName('')}
                      >
                        Load all resource groups
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
                        Load all subscriptions
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}

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
