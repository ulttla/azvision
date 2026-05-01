import { useEffect, useMemo, useState } from 'react'

import {
  createExport,
  getAuthConfigCheck,
  getTopology,
  getWorkspaceInventorySummary,
  getWorkspaceResourceGroups,
  getWorkspaceSubscriptions,
  getWorkspaces,
  type InventoryResourceGroup,
  type InventorySubscription,
  type InventorySummaryResponse,
  type TopologyResponse,
  type Workspace,
} from '../lib/api'
import {
  ARCHITECTURE_STAGE_META,
  ARCHITECTURE_STAGE_ORDER,
  buildArchitectureViewModel,
  renderArchitectureSvg,
  type ArchitectureAnnotation,
  type ArchitectureEdge,
  type ArchitectureNode,
  type ArchitectureNodeOverride,
  type ArchitectureStage,
} from './architecture/model'
import {
  clearArchitectureOverrideState,
  loadArchitectureOverrideState,
  saveArchitectureOverrideState,
} from './architecture/storage'

function formatDateTime(value?: string) {
  if (!value) {
    return '—'
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return value
  }
}

function readInitialSearchParam(key: string): string {
  if (typeof window === 'undefined') {
    return ''
  }

  return new URLSearchParams(window.location.search).get(key) ?? ''
}

function parseInitialWorkspaceId(): string {
  return readInitialSearchParam('workspace')
}

function parseInitialSubscriptionId(): string {
  return readInitialSearchParam('sub')
}

function parseInitialResourceGroupName(): string {
  return readInitialSearchParam('rg')
}

function filterTopologyByVisibleSourceKeys(
  topology: TopologyResponse | null,
  hiddenSourceNodeKeySet: Set<string>,
): TopologyResponse | null {
  if (!topology) {
    return null
  }

  const visibleNodes = topology.nodes.filter((node) => {
    if (node.node_type !== 'resource') {
      return true
    }
    return !hiddenSourceNodeKeySet.has(node.node_key)
  })

  const visibleNodeKeys = new Set(visibleNodes.map((node) => node.node_key))
  const visibleEdges = topology.edges.filter(
    (edge) => visibleNodeKeys.has(edge.source_node_key) && visibleNodeKeys.has(edge.target_node_key),
  )

  return {
    ...topology,
    nodes: visibleNodes,
    edges: visibleEdges,
  }
}

function isArchitectureStage(value: string): value is ArchitectureStage {
  return Object.prototype.hasOwnProperty.call(ARCHITECTURE_STAGE_META, value)
}

function normalizeNodeOverrides(overrides?: Record<string, { displayNameOverride?: string; stageKeyOverride?: string }>) {
  const result: Record<string, ArchitectureNodeOverride> = {}

  for (const [nodeKey, override] of Object.entries(overrides ?? {})) {
    const displayNameOverride = override.displayNameOverride?.trim()
    const stageKeyOverride = override.stageKeyOverride?.trim()
    const next: ArchitectureNodeOverride = {}
    if (displayNameOverride) {
      next.displayNameOverride = displayNameOverride
    }
    if (stageKeyOverride && isArchitectureStage(stageKeyOverride)) {
      next.stageKeyOverride = stageKeyOverride
    }
    if (next.displayNameOverride || next.stageKeyOverride) {
      result[nodeKey] = next
    }
  }

  return result
}

function normalizeAnnotations(annotations?: Array<{ id?: string; text?: string; tone?: string; updatedAt?: string }>): ArchitectureAnnotation[] {
  const result: ArchitectureAnnotation[] = []

  for (const annotation of annotations ?? []) {
    const text = annotation.text?.trim().slice(0, 280) ?? ''
    if (!annotation.id || !text) {
      continue
    }
    const tone: ArchitectureAnnotation['tone'] =
      annotation.tone === 'warning' || annotation.tone === 'info' ? annotation.tone : 'note'
    result.push({ id: annotation.id, text, tone, updatedAt: annotation.updatedAt })
  }

  return result
}

function filterTopologyByHiddenSourceKeys(
  topology: TopologyResponse | null,
  hiddenSourceNodeKeySet: Set<string>,
): TopologyResponse | null {
  if (!topology || !hiddenSourceNodeKeySet.size) {
    return null
  }

  const hiddenNodes = topology.nodes.filter(
    (node) => node.node_type === 'resource' && hiddenSourceNodeKeySet.has(node.node_key),
  )

  const hiddenNodeKeys = new Set(hiddenNodes.map((node) => node.node_key))
  const hiddenEdges = topology.edges.filter(
    (edge) => hiddenNodeKeys.has(edge.source_node_key) && hiddenNodeKeys.has(edge.target_node_key),
  )

  return {
    ...topology,
    nodes: hiddenNodes,
    edges: hiddenEdges,
  }
}

async function rasterizeSvg(svg: string, width: number, height: number): Promise<string> {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Failed to load architecture SVG image'))
      img.src = url
    })

    const scale = 2
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)

    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Canvas rendering is unavailable in this browser')
    }

    context.fillStyle = '#0b1220'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.scale(scale, scale)
    context.drawImage(image, 0, 0, width, height)

    return canvas.toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function ArchitecturePage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>(() => parseInitialWorkspaceId())
  const [selectedSubscriptionId, setSelectedSubscriptionId] = useState(() => parseInitialSubscriptionId())
  const [focusedResourceGroupName, setFocusedResourceGroupName] = useState(() => parseInitialResourceGroupName())
  const [availableSubscriptions, setAvailableSubscriptions] = useState<InventorySubscription[]>([])
  const [availableResourceGroups, setAvailableResourceGroups] = useState<InventoryResourceGroup[]>([])
  const [inventoryLoading, setInventoryLoading] = useState(false)
  const [inventoryMode, setInventoryMode] = useState('')
  const [inventoryWarning, setInventoryWarning] = useState('')
  const [inventorySummary, setInventorySummary] = useState<InventorySummaryResponse | null>(null)
  const [topology, setTopology] = useState<TopologyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [topologyLoading, setTopologyLoading] = useState(false)
  const [authReady, setAuthReady] = useState(false)
  const [error, setError] = useState('')
  const [includeNetworkInference, setIncludeNetworkInference] = useState(true)
  const [showInfraOverlay, setShowInfraOverlay] = useState(true)
  const [groupThreshold, setGroupThreshold] = useState(2)
  const [hiddenSourceNodeKeys, setHiddenSourceNodeKeys] = useState<string[]>([])
  const [nodeOverrides, setNodeOverrides] = useState<Record<string, ArchitectureNodeOverride>>({})
  const [annotations, setAnnotations] = useState<ArchitectureAnnotation[]>([])
  const [annotationDraft, setAnnotationDraft] = useState('')
  const [annotationTone, setAnnotationTone] = useState<ArchitectureAnnotation['tone']>('note')
  const [overridesReady, setOverridesReady] = useState(false)
  const [selectedNodeId, setSelectedNodeId] = useState('')
  const [exportLoading, setExportLoading] = useState(false)
  const [exportMessage, setExportMessage] = useState('')

  useEffect(() => {
    let active = true

    async function loadInitialData() {
      try {
        setLoading(true)
        const [workspaceItems, authStatus] = await Promise.all([getWorkspaces(), getAuthConfigCheck()])
        if (!active) {
          return
        }

        setWorkspaces(workspaceItems)
        setAuthReady(authStatus.auth_ready)
        setSelectedWorkspaceId((current) => current || workspaceItems[0]?.id || '')
      } catch (err) {
        if (!active) {
          return
        }
        setError(err instanceof Error ? err.message : 'Failed to load architecture workspace data')
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadInitialData()

    return () => {
      active = false
    }
  }, [])

  const overrideScopeKey = useMemo(
    () => [selectedWorkspaceId, selectedSubscriptionId || '*', focusedResourceGroupName || '*'].join('|'),
    [focusedResourceGroupName, selectedSubscriptionId, selectedWorkspaceId],
  )

  useEffect(() => {
    if (!selectedWorkspaceId) {
      setAvailableSubscriptions([])
      setAvailableResourceGroups([])
      setSelectedSubscriptionId('')
      setFocusedResourceGroupName('')
      setInventoryMode('')
      setInventoryWarning('')
      setInventorySummary(null)
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

        const summaryResult = await getWorkspaceInventorySummary(selectedWorkspaceId, {
          subscriptionId: selectedSubscriptionId || undefined,
          resourceGroupName: focusedResourceGroupName || undefined,
          resourceGroupLimit: 200,
        })
        if (!active) {
          return
        }

        setInventorySummary(summaryResult)
        if (summaryResult.warning && !resourceGroupResult.warning && !subscriptionResult.warning) {
          setInventoryWarning(summaryResult.warning)
        }
        if (summaryResult.mode && !resourceGroupResult.mode) {
          setInventoryMode(summaryResult.mode)
        }
      } catch (err) {
        if (!active) {
          return
        }
        setAvailableSubscriptions([])
        setAvailableResourceGroups([])
        setInventorySummary(null)
        setInventoryWarning(err instanceof Error ? err.message : 'Failed to load architecture inventory scope')
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
    if (!overrideScopeKey || !selectedWorkspaceId) {
      setHiddenSourceNodeKeys([])
      setNodeOverrides({})
      setAnnotations([])
      setAnnotationDraft('')
      setOverridesReady(false)
      return
    }

    setOverridesReady(false)
    const state = loadArchitectureOverrideState(overrideScopeKey)
    setHiddenSourceNodeKeys(state.hiddenSourceNodeKeys)
    setNodeOverrides(normalizeNodeOverrides(state.nodeOverrides))
    setAnnotations(normalizeAnnotations(state.annotations))
    setOverridesReady(true)
  }, [overrideScopeKey, selectedWorkspaceId])

  useEffect(() => {
    if (!overrideScopeKey || !selectedWorkspaceId || !overridesReady) {
      return
    }

    saveArchitectureOverrideState(overrideScopeKey, {
      hiddenSourceNodeKeys,
      nodeOverrides,
      annotations,
      updatedAt: new Date().toISOString(),
    })
  }, [annotations, hiddenSourceNodeKeys, nodeOverrides, overrideScopeKey, overridesReady, selectedWorkspaceId])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const search = new URLSearchParams(window.location.search)
    if (selectedWorkspaceId) {
      search.set('workspace', selectedWorkspaceId)
    } else {
      search.delete('workspace')
    }
    if (selectedSubscriptionId) {
      search.set('sub', selectedSubscriptionId)
    } else {
      search.delete('sub')
    }
    if (focusedResourceGroupName) {
      search.set('rg', focusedResourceGroupName)
    } else {
      search.delete('rg')
    }

    const nextUrl = `${window.location.pathname}${search.toString() ? `?${search.toString()}` : ''}`
    window.history.replaceState({}, '', nextUrl)
  }, [focusedResourceGroupName, selectedSubscriptionId, selectedWorkspaceId])

  useEffect(() => {
    if (!selectedWorkspaceId) {
      setTopology(null)
      return
    }

    let active = true

    async function loadTopology() {
      try {
        setTopologyLoading(true)
        setError('')
        const result = await getTopology(selectedWorkspaceId, {
          subscriptionId: selectedSubscriptionId || undefined,
          resourceGroupName: focusedResourceGroupName || undefined,
          includeNetworkInference,
          collapseManagedInstanceChildren: true,
        })

        if (!active) {
          return
        }

        setTopology(result)
      } catch (err) {
        if (!active) {
          return
        }
        setError(err instanceof Error ? err.message : 'Failed to load architecture topology')
      } finally {
        if (active) {
          setTopologyLoading(false)
        }
      }
    }

    void loadTopology()

    return () => {
      active = false
    }
  }, [focusedResourceGroupName, includeNetworkInference, selectedSubscriptionId, selectedWorkspaceId])

  const hiddenSourceNodeKeySet = useMemo(
    () => new Set(hiddenSourceNodeKeys),
    [hiddenSourceNodeKeys],
  )

  const visibleTopology = useMemo(
    () => filterTopologyByVisibleSourceKeys(topology, hiddenSourceNodeKeySet),
    [hiddenSourceNodeKeySet, topology],
  )

  const hiddenTopology = useMemo(
    () => filterTopologyByHiddenSourceKeys(topology, hiddenSourceNodeKeySet),
    [hiddenSourceNodeKeySet, topology],
  )

  const architectureModel = useMemo(
    () => buildArchitectureViewModel(visibleTopology, { groupThreshold, nodeOverrides }),
    [groupThreshold, nodeOverrides, visibleTopology],
  )

  const hiddenArchitectureModel = useMemo(
    () => buildArchitectureViewModel(hiddenTopology, { groupThreshold, nodeOverrides }),
    [groupThreshold, hiddenTopology, nodeOverrides],
  )

  const visibleStageBuckets = useMemo(
    () =>
      architectureModel.stageBuckets.map((bucket) =>
        bucket.stage === 'infra' && !showInfraOverlay ? { ...bucket, nodes: [] } : bucket,
      ),
    [architectureModel.stageBuckets, showInfraOverlay],
  )
  const visibleNodes = useMemo(
    () => visibleStageBuckets.flatMap((bucket) => bucket.nodes),
    [visibleStageBuckets],
  )

  const visibleNodeIdSet = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes])

  const visibleEdges = useMemo(
    () =>
      architectureModel.edges.filter(
        (edge) => visibleNodeIdSet.has(edge.sourceId) && visibleNodeIdSet.has(edge.targetId),
      ),
    [architectureModel.edges, visibleNodeIdSet],
  )

  const hiddenNodes = hiddenArchitectureModel.nodes

  const selectedNode = useMemo(
    () => visibleNodes.find((node) => node.id === selectedNodeId) ?? visibleNodes[0] ?? null,
    [selectedNodeId, visibleNodes],
  )

  useEffect(() => {
    if (!selectedNode) {
      if (selectedNodeId) {
        setSelectedNodeId('')
      }
      return
    }

    if (selectedNode.id !== selectedNodeId) {
      setSelectedNodeId(selectedNode.id)
    }
  }, [selectedNode, selectedNodeId])

  const svgDiagram = useMemo(
    () => renderArchitectureSvg(visibleStageBuckets, visibleEdges),
    [visibleEdges, visibleStageBuckets],
  )

  const isInitialTopologyLoad = topologyLoading && topology === null

  const stageCoverage = useMemo(
    () => visibleStageBuckets.filter((bucket) => bucket.nodes.length > 0).length,
    [visibleStageBuckets],
  )

  const groupedCards = useMemo(
    () => visibleNodes.filter((node) => node.nodeCount > 1).length,
    [visibleNodes],
  )

  function hideArchitectureNode(node: ArchitectureNode) {
    setHiddenSourceNodeKeys((current) =>
      Array.from(new Set([...current, ...node.sourceNodeKeys])).sort((left, right) =>
        left.localeCompare(right),
      ),
    )
  }

  function restoreArchitectureNode(node: ArchitectureNode) {
    const restoreSet = new Set(node.sourceNodeKeys)
    setHiddenSourceNodeKeys((current) => current.filter((nodeKey) => !restoreSet.has(nodeKey)))
  }

  function updateSelectedNodeOverride(update: ArchitectureNodeOverride) {
    if (!selectedNode) {
      return
    }

    setNodeOverrides((current) => {
      const next = { ...current }
      for (const nodeKey of selectedNode.sourceNodeKeys) {
        const merged = { ...(next[nodeKey] ?? {}), ...update }
        if (!merged.displayNameOverride?.trim()) {
          delete merged.displayNameOverride
        }
        if (!merged.stageKeyOverride) {
          delete merged.stageKeyOverride
        }
        if (merged.displayNameOverride || merged.stageKeyOverride) {
          next[nodeKey] = merged
        } else {
          delete next[nodeKey]
        }
      }
      return next
    })
  }

  function selectedNodeDisplayNameOverride(node: ArchitectureNode): string {
    const values = node.sourceNodeKeys
      .map((nodeKey) => nodeOverrides[nodeKey]?.displayNameOverride)
      .filter((value): value is string => Boolean(value))
    return values.length === node.sourceNodeKeys.length && new Set(values).size === 1 ? values[0] : ''
  }

  function selectedNodeStageOverride(node: ArchitectureNode): ArchitectureStage {
    const values = node.sourceNodeKeys
      .map((nodeKey) => nodeOverrides[nodeKey]?.stageKeyOverride)
      .filter((value): value is ArchitectureStage => Boolean(value))
    return values.length === node.sourceNodeKeys.length && new Set(values).size === 1 ? values[0] : node.stage
  }

  function clearSelectedNodePresentationOverrides() {
    if (!selectedNode) {
      return
    }

    setNodeOverrides((current) => {
      const next = { ...current }
      for (const nodeKey of selectedNode.sourceNodeKeys) {
        delete next[nodeKey]
      }
      return next
    })
  }

  function resetHiddenNodes() {
    setHiddenSourceNodeKeys([])
    setNodeOverrides({})
    setAnnotations([])
    setAnnotationDraft('')
    if (overrideScopeKey) {
      clearArchitectureOverrideState(overrideScopeKey)
    }
  }

  function createAnnotation() {
    const text = annotationDraft.trim().slice(0, 280)
    if (!text) {
      return
    }

    const now = new Date().toISOString()
    setAnnotations((current) => [
      ...current,
      { id: `annotation:${Date.now().toString(36)}`, text, tone: annotationTone, updatedAt: now },
    ])
    setAnnotationDraft('')
  }

  function updateAnnotation(annotationId: string, text: string) {
    const nextText = text.slice(0, 280)
    setAnnotations((current) =>
      current.map((annotation) =>
        annotation.id === annotationId
          ? { ...annotation, text: nextText, updatedAt: new Date().toISOString() }
          : annotation,
      ),
    )
  }

  function updateAnnotationTone(annotationId: string, tone: ArchitectureAnnotation['tone']) {
    setAnnotations((current) =>
      current.map((annotation) =>
        annotation.id === annotationId ? { ...annotation, tone, updatedAt: new Date().toISOString() } : annotation,
      ),
    )
  }

  function deleteAnnotation(annotationId: string) {
    setAnnotations((current) => current.filter((annotation) => annotation.id !== annotationId))
  }

  async function handleCopySvg() {
    if (!visibleNodes.length) {
      setExportMessage('Architecture diagram copy is unavailable without visible nodes.')
      return
    }

    try {
      setExportLoading(true)
      setExportMessage('')

      if (typeof navigator === 'undefined' || !navigator.clipboard) {
        setExportMessage('Clipboard API is not available in this browser.')
        return
      }

      const pngDataUrl = await rasterizeSvg(svgDiagram.svg, svgDiagram.width, svgDiagram.height)
      const response = await fetch(pngDataUrl)
      const blob = await response.blob()
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setExportMessage('Copied architecture diagram to clipboard as PNG.')
    } catch (err) {
      setExportMessage(err instanceof Error ? err.message : 'Clipboard copy failed')
    } finally {
      setExportLoading(false)
    }
  }

  async function handleExport(format: 'png' | 'pdf') {
    if (!selectedWorkspaceId || !visibleNodes.length) {
      setExportMessage('Architecture diagram export is unavailable without visible nodes.')
      return
    }

    try {
      setExportLoading(true)
      setExportMessage('')
      const pngDataUrl = await rasterizeSvg(svgDiagram.svg, svgDiagram.width, svgDiagram.height)

      if (format === 'png') {
        const exportRecord = await createExport(selectedWorkspaceId, 'png', pngDataUrl)
        setExportMessage(`Export saved: ${exportRecord.output_path}`)
        return
      }

      const { jsPDF } = await import('jspdf')
      const image = new Image()
      image.src = pngDataUrl
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () => reject(new Error('Failed to prepare architecture image for PDF export'))
      })

      const orientation = image.width > image.height ? 'landscape' : 'portrait'
      const pdf = new jsPDF({ orientation, unit: 'px', format: [image.width, image.height] })
      pdf.addImage(pngDataUrl, 'PNG', 0, 0, image.width, image.height)
      const exportRecord = await createExport(selectedWorkspaceId, 'pdf', pdf.output('datauristring'))
      setExportMessage(`Export saved: ${exportRecord.output_path}`)
    } catch (err) {
      setExportMessage(err instanceof Error ? err.message : 'Architecture export failed')
    } finally {
      setExportLoading(false)
    }
  }

  return (
    <main className="page-shell">
      <section className="hero-card">
        <div>
          <p className="eyebrow">AzVision • Architecture View</p>
          <h1>Compact architecture pipeline mode</h1>
          <p className="subtext architecture-subtext">
            Auto-map live topology resources into Source → Ingest → Process → Store → Serve zones,
            keep infra separated, and persist lightweight hide, label, and stage overrides for presentation-ready views.
          </p>
        </div>
        <span className={`status-pill ${authReady ? 'ready' : 'pending'}`}>
          {authReady ? 'Live inventory ready' : 'Diagnostic mode'}
        </span>
      </section>

      {error ? <div className="error-banner">API error: {error}</div> : null}
      {topology?.status === 'error' ? (
        <div className="error-banner">Topology error: {topology.message ?? 'Unknown error'}</div>
      ) : null}
      {exportMessage ? <div className="info-banner">{exportMessage}</div> : null}

      <section className="panel-grid architecture-overview-grid">
        <article className="panel-card">
          <div className="section-heading">
            <h2>Workspace</h2>
            <span className="mini-status">
              {topologyLoading ? 'Refreshing architecture view…' : 'Compact grouping default'}
            </span>
          </div>
          {loading ? (
            <p>Loading workspaces…</p>
          ) : (
            <>
              <select
                value={selectedWorkspaceId}
                onChange={(event) => {
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
                onChange={(event) => setFocusedResourceGroupName(event.target.value)}
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
              </p>
              {inventoryWarning ? <p className="hint">Inventory note: {inventoryWarning}</p> : null}
              {inventorySummary ? (
                <div className="summary-grid summary-grid-wide section-spacer">
                  <div className="metric-box">
                    <span className="metric-label">Collector Subs</span>
                    <strong>{inventorySummary.summary.subscription_count}</strong>
                    <small>in scope</small>
                  </div>
                  <div className="metric-box">
                    <span className="metric-label">Collector RGs</span>
                    <strong>{inventorySummary.summary.resource_group_count}</strong>
                    <small>in scope</small>
                  </div>
                  <div className="metric-box">
                    <span className="metric-label">Collector Resources</span>
                    <strong>{inventorySummary.summary.resource_count}</strong>
                    <small>raw inventory</small>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </article>

        <article className="panel-card">
          <div className="section-heading">
            <h2>Architecture Summary</h2>
            <span className="mini-status">View-model only • original topology untouched</span>
          </div>
          {isInitialTopologyLoad ? (
            <p className="hint">Loading topology…</p>
          ) : (
            <div className="summary-grid architecture-summary-grid">
              <div className="metric-box">
                <span className="metric-label">Visible cards</span>
                <strong>{visibleNodes.length}</strong>
                <small>{groupedCards} grouped cards</small>
              </div>
              <div className="metric-box">
                <span className="metric-label">Visible resources</span>
                <strong>{architectureModel.groupedResourceCount}</strong>
                <small>{architectureModel.sourceNodeCount} visible source nodes</small>
              </div>
              <div className="metric-box">
                <span className="metric-label">Hidden resources</span>
                <strong>{hiddenSourceNodeKeys.length}</strong>
                <small>{hiddenNodes.length} hidden cards in delta</small>
              </div>
              <div className="metric-box">
                <span className="metric-label">Active zones</span>
                <strong>{stageCoverage}</strong>
                <small>{ARCHITECTURE_STAGE_ORDER.length} total zones</small>
              </div>
            </div>
          )}
        </article>
      </section>

      <section className="panel-grid controls-layout architecture-controls-grid">
        <article className="panel-card">
          <div className="section-heading">
            <h2>View Controls</h2>
            <div className="button-row">
              <button
                type="button"
                className="toolbar-button"
                onClick={resetHiddenNodes}
                disabled={!hiddenSourceNodeKeys.length && !Object.keys(nodeOverrides).length && !annotations.length}
              >
                Reset all overrides{hiddenNodes.length > 0 || annotations.length > 0 ? ` (${hiddenNodes.length} hidden, ${annotations.length} notes)` : ''}
              </button>
              <button type="button" className="toolbar-button" onClick={() => void handleExport('png')} disabled={exportLoading || !visibleNodes.length}>
                {exportLoading ? 'Exporting…' : 'Export PNG'}
              </button>
              <button type="button" className="toolbar-button" onClick={() => void handleExport('pdf')} disabled={exportLoading || !visibleNodes.length}>
                {exportLoading ? 'Exporting…' : 'Export PDF'}
              </button>
              <button type="button" className="toolbar-button" onClick={() => void handleCopySvg()} disabled={exportLoading || !visibleNodes.length} data-testid="arch-copy-btn">
                {exportLoading ? 'Copying…' : 'Copy SVG'}
              </button>
            </div>
          </div>
          <div className="control-grid architecture-control-grid">
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={includeNetworkInference}
                onChange={(event) => setIncludeNetworkInference(event.target.checked)}
              />
              <span>Include network inference edges</span>
            </label>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={showInfraOverlay}
                onChange={(event) => setShowInfraOverlay(event.target.checked)}
              />
              <span>Show infra overlay lane</span>
            </label>
            <label className="architecture-threshold-field">
              <span>Group threshold</span>
              <select value={groupThreshold} onChange={(event) => setGroupThreshold(Number(event.target.value))}>
                <option value={2}>2 resources</option>
                <option value={3}>3 resources</option>
                <option value={4}>4 resources</option>
              </select>
            </label>
          </div>
          <p className="hint architecture-hint-copy">
            Override delta is stored separately by workspace + subscription + RG scope and tracks hidden
            source topology node keys plus label/stage overrides and presentation annotations, so the topology source remains intact even when grouping threshold changes.
            The infra overlay can be hidden for presentation exports without removing network resources from the source topology.
            Copy SVG rasterizes the current diagram to PNG and writes it to the system clipboard.
          </p>
        </article>

        <article className="panel-card architecture-detail-card">
          <div className="section-heading">
            <h2>Selected Card</h2>
            <span className="mini-status">{selectedNode ? selectedNode.shortLabel : 'Manual review surface'}</span>
          </div>
          {selectedNode ? (
            <div className="architecture-detail-copy" data-testid="arch-detail-panel">
              <div className="architecture-card-title-row">
                <strong>{selectedNode.label}</strong>
                <span className={`mini-chip architecture-stage-chip architecture-stage-chip-${selectedNode.stage}`}>
                  {ARCHITECTURE_STAGE_META[selectedNode.stage].label}
                </span>
              </div>
              <p className="hint architecture-detail-description">{selectedNode.description}</p>
              <div className="architecture-detail-grid">
                <div>
                  <span className="metric-label">Family</span>
                  <strong>{selectedNode.familyLabel}</strong>
                </div>
                <div>
                  <span className="metric-label">Resource groups</span>
                  <strong>{selectedNode.resourceGroups.length}</strong>
                </div>
                <div>
                  <span className="metric-label">Locations</span>
                  <strong>{selectedNode.locations.join(', ') || '—'}</strong>
                </div>
                <div>
                  <span className="metric-label">Source resources</span>
                  <strong>{selectedNode.nodeCount}</strong>
                </div>
              </div>
              <div className="architecture-detail-grid">
                <label>
                  <span className="metric-label">Presentation label</span>
                  <input
                    type="text"
                    value={selectedNodeDisplayNameOverride(selectedNode)}
                    onChange={(event) => updateSelectedNodeOverride({ displayNameOverride: event.target.value })}
                    placeholder={selectedNode.label}
                    aria-label="Architecture presentation label override"
                    data-testid="arch-detail-label-override"
                  />
                </label>
                <label>
                  <span className="metric-label">Presentation stage</span>
                  <select
                    value={selectedNodeStageOverride(selectedNode)}
                    onChange={(event) => updateSelectedNodeOverride({ stageKeyOverride: event.target.value as ArchitectureStage })}
                    aria-label="Architecture presentation stage override"
                    data-testid="arch-detail-stage-override"
                  >
                    {ARCHITECTURE_STAGE_ORDER.map((stage) => (
                      <option key={stage} value={stage}>
                        {ARCHITECTURE_STAGE_META[stage].label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="button-row architecture-card-actions">
                <button
                  type="button"
                  className="toolbar-button"
                  onClick={() => hideArchitectureNode(selectedNode)}
                  aria-label={`Hide ${selectedNode.label} from architecture view`}
                  data-testid="arch-detail-hide-btn"
                >
                  Hide from architecture view
                </button>
                <button
                  type="button"
                  className="toolbar-button"
                  onClick={clearSelectedNodePresentationOverrides}
                  disabled={!selectedNode.sourceNodeKeys.some((nodeKey) => nodeOverrides[nodeKey])}
                  data-testid="arch-detail-clear-presentation-btn"
                >
                  Clear label/stage override
                </button>
              </div>
              <div className="architecture-source-list">
                <span className="metric-label">Underlying topology resources</span>
                <ul className="overview-list architecture-inline-list">
                  {selectedNode.sourceNodes.slice(0, 8).map((node) => (
                    <li key={node.node_key}>
                      {node.display_name} • {node.resource_type ?? 'unknown type'}
                    </li>
                  ))}
                </ul>
                {selectedNode.sourceNodes.length > 8 ? (
                  <p className="hint">+ {selectedNode.sourceNodes.length - 8} more source resources</p>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="hint">{isInitialTopologyLoad ? 'Loading…' : 'No visible architecture card is selected.'}</p>
          )}
        </article>
      </section>

      <section className="panel-card architecture-diagram-panel">
        <div className="section-heading">
          <h2>Compact Diagram</h2>
          <span className="mini-status">SVG-based export-safe rendering</span>
        </div>
        <div className="architecture-svg-shell" dangerouslySetInnerHTML={{ __html: svgDiagram.svg }} />
      </section>

      <section className="panel-card architecture-annotation-board">
        <div className="section-heading">
          <h2>Presentation Notes</h2>
          <span className="mini-status">Local annotation delta • {annotations.length} note{annotations.length === 1 ? '' : 's'}</span>
        </div>
        <div className="architecture-annotation-compose" data-testid="arch-annotation-compose">
          <textarea
            value={annotationDraft}
            onChange={(event) => setAnnotationDraft(event.target.value.slice(0, 280))}
            placeholder="Add a short presentation note for this architecture view…"
            aria-label="Architecture annotation text"
            data-testid="arch-annotation-draft"
          />
          <div className="button-row architecture-annotation-actions">
            <select
              value={annotationTone}
              onChange={(event) => setAnnotationTone(event.target.value as ArchitectureAnnotation['tone'])}
              aria-label="Architecture annotation tone"
              data-testid="arch-annotation-tone"
            >
              <option value="note">Note</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
            </select>
            <button
              type="button"
              className="toolbar-button primary"
              onClick={createAnnotation}
              disabled={!annotationDraft.trim()}
              data-testid="arch-annotation-add-btn"
            >
              Add note
            </button>
          </div>
        </div>
        {annotations.length ? (
          <div className="architecture-annotation-list" data-testid="arch-annotation-list">
            {annotations.map((annotation) => (
              <article key={annotation.id} className={`architecture-annotation-card architecture-annotation-${annotation.tone}`}>
                <div className="button-row architecture-annotation-toolbar">
                  <select
                    value={annotation.tone}
                    onChange={(event) => updateAnnotationTone(annotation.id, event.target.value as ArchitectureAnnotation['tone'])}
                    aria-label="Update annotation tone"
                    data-testid="arch-annotation-item-tone"
                  >
                    <option value="note">Note</option>
                    <option value="info">Info</option>
                    <option value="warning">Warning</option>
                  </select>
                  <button
                    type="button"
                    className="toolbar-button search-inline-button"
                    onClick={() => deleteAnnotation(annotation.id)}
                    data-testid="arch-annotation-delete-btn"
                  >
                    Delete
                  </button>
                </div>
                <textarea
                  value={annotation.text}
                  onChange={(event) => updateAnnotation(annotation.id, event.target.value)}
                  aria-label="Edit architecture annotation"
                  data-testid="arch-annotation-item-text"
                />
              </article>
            ))}
          </div>
        ) : (
          <p className="hint">No presentation notes yet. Notes are saved with the same workspace/subscription/RG override scope.</p>
        )}
      </section>

      <section className="panel-card architecture-zone-board">
        <div className="section-heading">
          <h2>Zone Board</h2>
          <span className="mini-status">Select cards for detail • hide noisy support items</span>
        </div>
        <div className="architecture-stage-board">
          {visibleStageBuckets.map((bucket) => {
            const meta = ARCHITECTURE_STAGE_META[bucket.stage]
            return (
              <section key={bucket.stage} className="architecture-stage-column">
                <div className="architecture-stage-header" style={{ borderColor: meta.accent }}>
                  <strong>{meta.label}</strong>
                  <span>{bucket.nodes.length} card{bucket.nodes.length === 1 ? '' : 's'}</span>
                </div>
                <p className="hint architecture-stage-copy">{bucket.description}</p>
                <div className="architecture-stage-card-list">
                  {isInitialTopologyLoad && !bucket.nodes.length ? (
                    <div className="architecture-stage-empty">Loading…</div>
                  ) : bucket.nodes.length ? (
                    bucket.nodes.map((node) => (
                      <article
                        key={node.id}
                        className={`architecture-node-card ${selectedNode?.id === node.id ? 'selected' : ''}`}
                        data-testid="arch-node-card"
                        data-node-id={node.id}
                      >
                        <button
                          type="button"
                          className="node-button architecture-node-button"
                          onClick={() => setSelectedNodeId(node.id)}
                          aria-label={`${selectedNode?.id === node.id ? 'Currently viewing' : 'Select'} ${node.shortLabel} — ${node.familyLabel}, ${node.nodeCount} item${node.nodeCount === 1 ? '' : 's'}`}
                        >
                          <div>
                            <strong>{node.shortLabel}</strong>
                            <p>{node.familyLabel} • {node.nodeCount} item{node.nodeCount === 1 ? '' : 's'}</p>
                          </div>
                          <span className="mini-chip">{node.resourceGroups[0] ?? 'shared'}</span>
                        </button>
                        <div className="button-row architecture-node-actions">
                          <button
                            type="button"
                            className="toolbar-button search-inline-button"
                            onClick={() => setSelectedNodeId(node.id)}
                            aria-label={`${selectedNode?.id === node.id ? 'Currently selected' : 'Select'} ${node.shortLabel} for detail panel`}
                            data-testid="arch-node-select-btn"
                          >
                            {selectedNode?.id === node.id ? 'Selected' : 'Select'}
                          </button>
                          <button
                            type="button"
                            className="toolbar-button search-inline-button"
                            onClick={() => hideArchitectureNode(node)}
                            aria-label={`Hide ${node.shortLabel} from architecture view`}
                            data-testid="arch-node-hide-btn"
                          >
                            Hide
                          </button>
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="architecture-stage-empty">No mapped cards</div>
                  )}
                </div>
              </section>
            )
          })}
        </div>
      </section>

      <section className="panel-grid architecture-bottom-grid">
        <article className="panel-card">
          <div className="section-heading">
            <h2>Flow Summary</h2>
            <span className="mini-status">Aggregated simplified edges</span>
          </div>
          <div className="interactive-list compact-list">
            {visibleEdges.length ? (
              <ul className="search-result-list">
                {visibleEdges.slice(0, 16).map((edge: ArchitectureEdge) => {
                  const source = visibleNodes.find((node) => node.id === edge.sourceId)
                  const target = visibleNodes.find((node) => node.id === edge.targetId)
                  if (!source || !target) {
                    return null
                  }
                  return (
                    <li key={edge.id}>
                      <div className="search-result-card architecture-flow-card">
                        <div>
                          <strong>{source.shortLabel} → {target.shortLabel}</strong>
                          <p>
                            {ARCHITECTURE_STAGE_META[edge.sourceStage].label} → {ARCHITECTURE_STAGE_META[edge.targetStage].label}
                            {' • '}
                            {edge.kinds.includes('synthetic') ? 'synthetic stage flow' : 'topology-backed'}
                          </p>
                        </div>
                        <div className="button-row architecture-flow-meta">
                          <span className="mini-chip">{edge.count} links</span>
                          {edge.relationTypes[0] ? <span className="mini-chip">{edge.relationTypes[0]}</span> : null}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="hint">{isInitialTopologyLoad ? 'Loading…' : 'No visible simplified edges after current presentation overrides.'}</p>
            )}
          </div>
        </article>

        <article className="panel-card">
          <div className="section-heading">
            <h2>Hidden Cards</h2>
            <span className="mini-status">Persistent override delta</span>
          </div>
          {hiddenNodes.length ? (
            <div className="interactive-list compact-list">
              <ul className="search-result-list">
                {hiddenNodes.map((node) => (
                  <li key={node.id}>
                    <div className="search-result-card architecture-flow-card">
                      <div>
                        <strong>{node.shortLabel}</strong>
                        <p className="hint">
                          {node.label} • {ARCHITECTURE_STAGE_META[node.stage].label} • {node.familyLabel} • {node.nodeCount} item
                          {node.nodeCount === 1 ? '' : 's'}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="toolbar-button search-inline-button"
                        onClick={() => restoreArchitectureNode(node)}
                      >
                        Restore
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="hint">No hidden cards yet.</p>
          )}
        </article>
      </section>
    </main>
  )
}
