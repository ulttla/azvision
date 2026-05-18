import { useEffect, useMemo, useState, type CSSProperties } from 'react'

import {
  createExport,
  getAuthConfigCheck,
  getBackendHealth,
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
import { useI18n } from '../i18n/context'

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

const ARCHITECTURE_BOARD_SCALE_OPTIONS = [1, 0.9, 0.8, 0.67, 0.55] as const

function formatScaleLabel(scale: number): string {
  return `${Math.round(scale * 100)}%`
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

function normalizeNodeOverrides(overrides?: Record<string, { displayNameOverride?: string; stageKeyOverride?: string; position?: { order?: number } }>) {
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
    if (override.position && Number.isFinite(override.position.order)) {
      next.position = { order: Number(override.position.order) }
    }
    if (next.displayNameOverride || next.stageKeyOverride || next.position) {
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
    const next: ArchitectureAnnotation = { id: annotation.id, text, tone }
    if (annotation.updatedAt) {
      next.updatedAt = annotation.updatedAt
    }
    result.push(next)
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

async function rasterizeSvg(svg: string, width: number, height: number, labels: { loadSvgImage: string; canvasUnavailable: string }): Promise<string> {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error(labels.loadSvgImage))
      img.src = url
    })

    const scale = 2
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)

    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error(labels.canvasUnavailable)
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
  const { t } = useI18n()
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
  const [backendHealthStatus, setBackendHealthStatus] = useState<'checking' | 'ok' | 'error'>('checking')
  const [error, setError] = useState('')
  const [includeNetworkInference, setIncludeNetworkInference] = useState(true)
  const [showInfraOverlay, setShowInfraOverlay] = useState(true)
  const [groupThreshold, setGroupThreshold] = useState(2)
  const [hiddenSourceNodeKeys, setHiddenSourceNodeKeys] = useState<string[]>([])
  const [nodeOverrides, setNodeOverrides] = useState<Record<string, ArchitectureNodeOverride>>({})
  const [annotations, setAnnotations] = useState<ArchitectureAnnotation[]>([])
  const [annotationDraft, setAnnotationDraft] = useState('')
  const [annotationTone, setAnnotationTone] = useState<ArchitectureAnnotation['tone']>('note')
  const [draggedNodeId, setDraggedNodeId] = useState('')
  const [overridesReady, setOverridesReady] = useState(false)
  const [selectedNodeId, setSelectedNodeId] = useState('')
  const [exportLoading, setExportLoading] = useState(false)
  const [exportMessage, setExportMessage] = useState('')
  const [zoneBoardScale, setZoneBoardScale] = useState<(typeof ARCHITECTURE_BOARD_SCALE_OPTIONS)[number]>(0.8)

  useEffect(() => {
    let active = true

    async function loadInitialData() {
      try {
        setLoading(true)
        const [workspaceItems, authStatus, healthStatus] = await Promise.all([
          getWorkspaces(),
          getAuthConfigCheck(),
          getBackendHealth(),
        ])
        if (!active) {
          return
        }

        setWorkspaces(workspaceItems)
        setAuthReady(authStatus.auth_ready)
        setBackendHealthStatus(healthStatus.status === 'ok' ? 'ok' : 'error')
        setSelectedWorkspaceId((current) => current || workspaceItems[0]?.id || '')
      } catch (err) {
        if (!active) {
          return
        }
        setBackendHealthStatus('error')
        setError(err instanceof Error ? err.message : t('arch.error.loadWorkspace'))
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
        setInventoryWarning(err instanceof Error ? err.message : t('arch.error.loadInventoryScope'))
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
        setError(err instanceof Error ? err.message : t('arch.error.loadTopology'))
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

  function nodePresentationOrder(node: ArchitectureNode): number | null {
    const values = node.sourceNodeKeys
      .map((nodeKey) => nodeOverrides[nodeKey]?.position?.order)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    return values.length ? Math.min(...values) : null
  }

  function sortArchitectureNodes(nodes: ArchitectureNode[]): ArchitectureNode[] {
    return nodes.slice().sort((left, right) => {
      const leftOrder = nodePresentationOrder(left)
      const rightOrder = nodePresentationOrder(right)
      if (leftOrder !== null || rightOrder !== null) {
        return (leftOrder ?? Number.MAX_SAFE_INTEGER) - (rightOrder ?? Number.MAX_SAFE_INTEGER)
      }
      return 0
    })
  }

  const visibleStageBuckets = useMemo(
    () =>
      architectureModel.stageBuckets.map((bucket) => {
        const nodes = bucket.stage === 'infra' && !showInfraOverlay ? [] : sortArchitectureNodes(bucket.nodes)
        return { ...bucket, nodes }
      }),
    [architectureModel.stageBuckets, nodeOverrides, showInfraOverlay],
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
    () => renderArchitectureSvg(visibleStageBuckets, visibleEdges, { annotations }),
    [annotations, visibleEdges, visibleStageBuckets],
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

  function setStageNodeOrder(nodes: ArchitectureNode[]) {
    setNodeOverrides((current) => {
      const next = { ...current }
      nodes.forEach((node, index) => {
        const order = (index + 1) * 10
        for (const nodeKey of node.sourceNodeKeys) {
          next[nodeKey] = { ...(next[nodeKey] ?? {}), position: { order } }
        }
      })
      return next
    })
  }

  function moveArchitectureNode(node: ArchitectureNode, direction: -1 | 1) {
    const bucket = visibleStageBuckets.find((stageBucket) => stageBucket.stage === node.stage)
    if (!bucket) {
      return
    }
    const nodes = bucket.nodes.slice()
    const index = nodes.findIndex((item) => item.id === node.id)
    const targetIndex = index + direction
    if (index < 0 || targetIndex < 0 || targetIndex >= nodes.length) {
      return
    }
    const [moved] = nodes.splice(index, 1)
    nodes.splice(targetIndex, 0, moved)
    setStageNodeOrder(nodes)
  }

  function handleArchitectureNodeDrop(targetNode: ArchitectureNode) {
    if (!draggedNodeId || draggedNodeId === targetNode.id) {
      setDraggedNodeId('')
      return
    }
    const bucket = visibleStageBuckets.find((stageBucket) => stageBucket.stage === targetNode.stage)
    const draggedNode = bucket?.nodes.find((node) => node.id === draggedNodeId)
    if (!bucket || !draggedNode) {
      setDraggedNodeId('')
      return
    }
    const nodes = bucket.nodes.filter((node) => node.id !== draggedNodeId)
    const targetIndex = nodes.findIndex((node) => node.id === targetNode.id)
    nodes.splice(Math.max(targetIndex, 0), 0, draggedNode)
    setStageNodeOrder(nodes)
    setSelectedNodeId(draggedNode.id)
    setDraggedNodeId('')
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

  async function handleCopyPngToClipboard() {
    if (!visibleNodes.length) {
      setExportMessage(t('arch.error.copyNoVisibleNodes'))
      return
    }

    try {
      setExportLoading(true)
      setExportMessage('')

      if (typeof navigator === 'undefined' || !navigator.clipboard) {
        setExportMessage(t('arch.error.clipboardUnavailable'))
        return
      }

      const pngDataUrl = await rasterizeSvg(svgDiagram.svg, svgDiagram.width, svgDiagram.height, {
        loadSvgImage: t('arch.error.loadSvgImage'),
        canvasUnavailable: t('arch.error.canvasUnavailable'),
      })
      const response = await fetch(pngDataUrl)
      const blob = await response.blob()
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setExportMessage(t('arch.message.copiedPng'))
    } catch (err) {
      setExportMessage(err instanceof Error ? err.message : t('arch.error.clipboardCopyFailed'))
    } finally {
      setExportLoading(false)
    }
  }

  async function handleExport(format: 'png' | 'pdf') {
    if (!selectedWorkspaceId || !visibleNodes.length) {
      setExportMessage(t('arch.error.exportNoVisibleNodes'))
      return
    }

    try {
      setExportLoading(true)
      setExportMessage('')
      const pngDataUrl = await rasterizeSvg(svgDiagram.svg, svgDiagram.width, svgDiagram.height, {
        loadSvgImage: t('arch.error.loadSvgImage'),
        canvasUnavailable: t('arch.error.canvasUnavailable'),
      })

      if (format === 'png') {
        const exportRecord = await createExport(selectedWorkspaceId, 'png', pngDataUrl)
        setExportMessage(t('arch.message.exportSaved').replace('{path}', exportRecord.output_path))
        return
      }

      const { jsPDF } = await import('jspdf')
      const image = new Image()
      image.src = pngDataUrl
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () => reject(new Error(t('arch.error.preparePdfImage')))
      })

      const orientation = image.width > image.height ? 'landscape' : 'portrait'
      const pdf = new jsPDF({ orientation, unit: 'px', format: [image.width, image.height] })
      pdf.addImage(pngDataUrl, 'PNG', 0, 0, image.width, image.height)
      const exportRecord = await createExport(selectedWorkspaceId, 'pdf', pdf.output('datauristring'))
      setExportMessage(t('arch.message.exportSaved').replace('{path}', exportRecord.output_path))
    } catch (err) {
      setExportMessage(err instanceof Error ? err.message : t('arch.error.exportFailed'))
    } finally {
      setExportLoading(false)
    }
  }

  return (
    <main className="page-shell">
      <section className="hero-card">
        <div>
          <p className="eyebrow">{t('arch.hero.eyebrow')}</p>
          <h1>{t('arch.hero.title')}</h1>
          <p className="subtext architecture-subtext">
            {t('arch.hero.subtext')}
          </p>
        </div>
        <div className="architecture-health-badges" data-testid="arch-health-badges">
          <span className={`status-pill ${backendHealthStatus === 'ok' ? 'ready' : 'pending'}`} data-testid="arch-health-backend">
            {backendHealthStatus === 'ok' ? t('arch.health.backendHealthy') : backendHealthStatus === 'checking' ? t('arch.health.backendChecking') : t('arch.health.backendUnavailable')}
          </span>
          <span className={`status-pill ${authReady ? 'ready' : 'pending'}`} data-testid="arch-health-auth">
            {authReady ? t('arch.health.liveInventory') : t('arch.health.diagnosticMode')}
          </span>
          <span className="status-pill pending" data-testid="arch-health-topology-age">
            {topology?.generated_at ? `${t('arch.health.topologyLabel')} ${formatDateTime(topology.generated_at)}` : t('arch.health.topologyNotLoaded')}
          </span>
        </div>
      </section>

      {error ? <div className="error-banner">{t('arch.error.api')}: {error}</div> : null}
      {topology?.status === 'error' ? (
        <div className="error-banner">{t('arch.error.topology')}: {topology.message ?? t('arch.error.unknown')}</div>
      ) : null}
      {exportMessage ? <div className="info-banner">{exportMessage}</div> : null}

      <section className="panel-grid architecture-overview-grid">
        <article className="panel-card">
          <div className="section-heading">
            <h2>{t('arch.workspace.heading')}</h2>
            <span className="mini-status">
              {topologyLoading ? t('arch.workspace.refreshing') : t('arch.workspace.compactDefault')}
            </span>
          </div>
          {loading ? (
            <p>{t('arch.workspace.loading')}</p>
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
                <option value="">{t('arch.workspace.allSubs')}</option>
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
                <option value="">{t('arch.workspace.allRGs')}</option>
                {availableResourceGroups.map((resourceGroup) => (
                  <option key={resourceGroup.id ?? resourceGroup.name ?? 'resource-group'} value={resourceGroup.name ?? ''}>
                    {resourceGroup.name ?? 'Unnamed RG'}
                    {resourceGroup.location ? ` • ${resourceGroup.location}` : ''}
                  </option>
                ))}
              </select>
              <p className="hint">
                {t('arch.workspace.generatedAt')} {formatDateTime(topology?.generated_at)}
                {topology?.mode ? ` • ${topology.mode}` : ''}
                {inventoryMode ? ` • ${t('arch.workspace.inventory')} ${inventoryMode}` : ''}
              </p>
              <p className="hint">
                {t('arch.workspace.scope')} {selectedSubscriptionId ? t('arch.workspace.scopeSingleSubscription') : t('arch.workspace.scopeAllSubscriptions')}
                {' • '}
                {focusedResourceGroupName ? `RG ${focusedResourceGroupName}` : t('arch.workspace.scopeAllResourceGroups')}
              </p>
              {inventoryWarning ? <p className="hint">{t('arch.workspace.inventoryNote')} {inventoryWarning}</p> : null}
              {inventorySummary ? (
                <div className="summary-grid summary-grid-wide section-spacer">
                  <div className="metric-box">
                    <span className="metric-label">{t('arch.workspace.collectorSubs')}</span>
                    <strong>{inventorySummary.summary.subscription_count}</strong>
                    <small>{t('arch.workspace.inScope')}</small>
                  </div>
                  <div className="metric-box">
                    <span className="metric-label">{t('arch.workspace.collectorRGs')}</span>
                    <strong>{inventorySummary.summary.resource_group_count}</strong>
                    <small>{t('arch.workspace.inScope')}</small>
                  </div>
                  <div className="metric-box">
                    <span className="metric-label">{t('arch.workspace.collectorResources')}</span>
                    <strong>{inventorySummary.summary.resource_count}</strong>
                    <small>{t('arch.workspace.rawInventory')}</small>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </article>

        <article className="panel-card">
          <div className="section-heading">
            <h2>{t('arch.summary.heading')}</h2>
            <span className="mini-status">{t('arch.summary.viewModelOnly')}</span>
          </div>
          {isInitialTopologyLoad ? (
            <p className="hint">{t('arch.summary.loadingTopology')}</p>
          ) : (
            <div className="summary-grid architecture-summary-grid">
              <div className="metric-box">
                <span className="metric-label">{t('arch.summary.visibleCards')}</span>
                <strong>{visibleNodes.length}</strong>
                <small>{groupedCards} {t('arch.summary.groupedCards')}</small>
              </div>
              <div className="metric-box">
                <span className="metric-label">{t('arch.summary.visibleResources')}</span>
                <strong>{architectureModel.groupedResourceCount}</strong>
                <small>{architectureModel.sourceNodeCount} {t('arch.summary.visibleSourceNodes')}</small>
              </div>
              <div className="metric-box">
                <span className="metric-label">{t('arch.summary.hiddenResources')}</span>
                <strong>{hiddenSourceNodeKeys.length}</strong>
                <small>{hiddenNodes.length} {t('arch.summary.hiddenCardsDelta')}</small>
              </div>
              <div className="metric-box">
                <span className="metric-label">{t('arch.summary.activeZones')}</span>
                <strong>{stageCoverage}</strong>
                <small>{ARCHITECTURE_STAGE_ORDER.length} {t('arch.summary.totalZones')}</small>
              </div>
            </div>
          )}
        </article>
      </section>

      <section className="panel-grid controls-layout architecture-controls-grid">
        <article className="panel-card">
          <div className="section-heading">
            <h2>{t('arch.controls.heading')}</h2>
            <div className="button-row">
              <button
                type="button"
                className="toolbar-button"
                onClick={resetHiddenNodes}
                disabled={!hiddenSourceNodeKeys.length && !Object.keys(nodeOverrides).length && !annotations.length}
              >
                {t('arch.controls.resetAllOverrides')}{hiddenNodes.length > 0 || annotations.length > 0 ? ` (${t('arch.controls.resetCount').replace('{hidden}', String(hiddenNodes.length)).replace('{notes}', String(annotations.length))})` : ''}
              </button>
              <button type="button" className="toolbar-button" onClick={() => void handleExport('png')} disabled={exportLoading || !visibleNodes.length}>
                {exportLoading ? t('arch.controls.exporting') : t('arch.controls.exportPng')}
              </button>
              <button type="button" className="toolbar-button" onClick={() => void handleExport('pdf')} disabled={exportLoading || !visibleNodes.length}>
                {exportLoading ? t('arch.controls.exporting') : t('arch.controls.exportPdf')}
              </button>
              <button type="button" className="toolbar-button" onClick={() => void handleCopyPngToClipboard()} disabled={exportLoading || !visibleNodes.length} data-testid="arch-copy-btn">
                {exportLoading ? t('arch.controls.copying') : t('arch.controls.copyPng')}
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
              <span>{t('arch.controls.includeNetworkInference')}</span>
            </label>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={showInfraOverlay}
                onChange={(event) => setShowInfraOverlay(event.target.checked)}
              />
              <span>{t('arch.controls.showInfraOverlay')}</span>
            </label>
            <label className="architecture-threshold-field">
              <span>{t('arch.controls.groupThreshold')}</span>
              <select value={groupThreshold} onChange={(event) => setGroupThreshold(Number(event.target.value))}>
                <option value={2}>2 resources</option>
                <option value={3}>3 resources</option>
                <option value={4}>4 resources</option>
              </select>
            </label>
          </div>
          <p className="hint architecture-hint-copy">
            {t('arch.controls.overrideHint')}
          </p>
        </article>

        <article className="panel-card architecture-detail-card">
          <div className="section-heading">
            <h2>{t('arch.detail.heading')}</h2>
            <span className="mini-status">{selectedNode ? selectedNode.shortLabel : t('arch.detail.manualReview')}</span>
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
                  <span className="metric-label">{t('arch.detail.family')}</span>
                  <strong>{selectedNode.familyLabel}</strong>
                </div>
                <div>
                  <span className="metric-label">{t('arch.detail.resourceGroups')}</span>
                  <strong>{selectedNode.resourceGroups.length}</strong>
                </div>
                <div>
                  <span className="metric-label">{t('arch.detail.locations')}</span>
                  <strong>{selectedNode.locations.join(', ') || '—'}</strong>
                </div>
                <div>
                  <span className="metric-label">{t('arch.detail.sourceResources')}</span>
                  <strong>{selectedNode.nodeCount}</strong>
                </div>
              </div>
              <div className="architecture-detail-grid">
                <label>
                  <span className="metric-label">{t('arch.detail.presentationLabel')}</span>
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
                  <span className="metric-label">{t('arch.detail.presentationStage')}</span>
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
                  {t('arch.detail.hideFromArch')}
                </button>
                <button
                  type="button"
                  className="toolbar-button"
                  onClick={clearSelectedNodePresentationOverrides}
                  disabled={!selectedNode.sourceNodeKeys.some((nodeKey) => nodeOverrides[nodeKey])}
                  data-testid="arch-detail-clear-presentation-btn"
                >
                  {t('arch.detail.clearOverrides')}
                </button>
              </div>
              <div className="architecture-source-list">
                <span className="metric-label">{t('arch.detail.underlyingResources')}</span>
                <ul className="overview-list architecture-inline-list">
                  {selectedNode.sourceNodes.slice(0, 8).map((node) => (
                    <li key={node.node_key}>
                      {node.display_name} • {node.resource_type ?? 'unknown type'}
                    </li>
                  ))}
                </ul>
                {selectedNode.sourceNodes.length > 8 ? (
                  <p className="hint">{t('arch.detail.moreResources').replace('{count}', String(selectedNode.sourceNodes.length - 8))}</p>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="hint">{isInitialTopologyLoad ? t('arch.detail.loading') : t('arch.detail.noSelection')}</p>
          )}
        </article>
      </section>

      <section className="panel-card architecture-diagram-panel">
        <div className="section-heading">
          <h2>{t('arch.diagram.heading')}</h2>
          <span className="mini-status">{t('arch.diagram.svgExportSafe')}</span>
        </div>
        <div className="architecture-svg-shell" dangerouslySetInnerHTML={{ __html: svgDiagram.svg }} />
      </section>

      <section className="panel-card architecture-annotation-board">
        <div className="section-heading">
          <h2>{t('arch.notes.heading')}</h2>
          <span className="mini-status">{t('arch.notes.count').replace('{count}', String(annotations.length)).replace('{plural}', annotations.length === 1 ? '' : 's')}</span>
        </div>
        <div className="architecture-annotation-compose" data-testid="arch-annotation-compose">
          <textarea
            value={annotationDraft}
            onChange={(event) => setAnnotationDraft(event.target.value.slice(0, 280))}
            placeholder={t('arch.notes.placeholder')}
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
              <option value="note">{t('arch.notes.toneNote')}</option>
              <option value="info">{t('arch.notes.toneInfo')}</option>
              <option value="warning">{t('arch.notes.toneWarning')}</option>
            </select>
            <button
              type="button"
              className="toolbar-button primary"
              onClick={createAnnotation}
              disabled={!annotationDraft.trim()}
              data-testid="arch-annotation-add-btn"
            >
              {t('arch.notes.addNote')}
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
                    <option value="note">{t('arch.notes.toneNote')}</option>
                    <option value="info">{t('arch.notes.toneInfo')}</option>
                    <option value="warning">{t('arch.notes.toneWarning')}</option>
                  </select>
                  <button
                    type="button"
                    className="toolbar-button search-inline-button"
                    onClick={() => deleteAnnotation(annotation.id)}
                    data-testid="arch-annotation-delete-btn"
                  >
                    {t('arch.notes.delete')}
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
          <p className="hint">{t('arch.notes.noNotes')}</p>
        )}
      </section>

      <section className="panel-card architecture-zone-board">
        <div className="section-heading architecture-zone-heading">
          <div>
            <h2>{t('arch.zones.heading')}</h2>
            <span className="mini-status">{t('arch.zones.scaleHint')}</span>
          </div>
          <div className="button-row architecture-scale-controls" aria-label="Architecture board zoom controls">
            {ARCHITECTURE_BOARD_SCALE_OPTIONS.map((scale) => (
              <button
                key={scale}
                type="button"
                className={`toolbar-button search-inline-button ${zoneBoardScale === scale ? 'primary' : ''}`}
                onClick={() => setZoneBoardScale(scale)}
                aria-pressed={zoneBoardScale === scale}
                data-testid="arch-board-scale-btn"
              >
                {formatScaleLabel(scale)}
              </button>
            ))}
          </div>
        </div>
        <div className="architecture-stage-scroll" data-testid="arch-stage-scroll">
          <div
            className="architecture-stage-scale-frame"
            style={{ '--architecture-board-scale': zoneBoardScale } as CSSProperties}
            data-testid="arch-stage-scale-frame"
          >
            <div className="architecture-stage-board">
              {visibleStageBuckets.map((bucket) => {
            const meta = ARCHITECTURE_STAGE_META[bucket.stage]
            return (
              <section key={bucket.stage} className="architecture-stage-column">
                <div className="architecture-stage-header" style={{ borderColor: meta.accent }}>
                  <strong>{meta.label}</strong>
                  <span>{bucket.nodes.length} {bucket.nodes.length === 1 ? t('arch.diagram.card') : t('arch.diagram.cards')}</span>
                </div>
                <p className="hint architecture-stage-copy">{bucket.description}</p>
                <div className="architecture-stage-card-list">
                  {isInitialTopologyLoad && !bucket.nodes.length ? (
                    <div className="architecture-stage-empty">{t('arch.detail.loading')}</div>
                  ) : bucket.nodes.length ? (
                    bucket.nodes.map((node, index) => (
                      <article
                        key={node.id}
                        className={`architecture-node-card ${selectedNode?.id === node.id ? 'selected' : ''} ${draggedNodeId === node.id ? 'dragging' : ''}`}
                        data-testid="arch-node-card"
                        data-node-id={node.id}
                        draggable
                        onDragStart={() => setDraggedNodeId(node.id)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => handleArchitectureNodeDrop(node)}
                        onDragEnd={() => setDraggedNodeId('')}
                      >
                        <button
                          type="button"
                          className="node-button architecture-node-button"
                          onClick={() => setSelectedNodeId(node.id)}
                          aria-label={`${selectedNode?.id === node.id ? t('arch.common.currentlyViewing') : t('arch.common.select')} ${node.shortLabel} — ${node.familyLabel}, ${node.nodeCount} ${node.nodeCount === 1 ? t('arch.common.item') : t('arch.common.items')}`}
                        >
                          <div>
                            <strong>{node.shortLabel}</strong>
                            <p>{node.familyLabel} • {node.nodeCount} {node.nodeCount === 1 ? t('arch.common.item') : t('arch.common.items')}</p>
                          </div>
                          <span className="mini-chip">{node.resourceGroups[0] ?? t('arch.common.shared')}</span>
                        </button>
                        <div className="button-row architecture-node-actions">
                          <button
                            type="button"
                            className="toolbar-button search-inline-button"
                            onClick={() => setSelectedNodeId(node.id)}
                            aria-label={`${selectedNode?.id === node.id ? t('arch.common.currentlySelected') : t('arch.common.select')} ${node.shortLabel} ${t('arch.common.forDetailPanel')}`}
                            data-testid="arch-node-select-btn"
                          >
                            {selectedNode?.id === node.id ? t('arch.zones.selected') : t('arch.zones.select')}
                          </button>
                          <button
                            type="button"
                            className="toolbar-button search-inline-button"
                            onClick={() => moveArchitectureNode(node, -1)}
                            disabled={index === 0}
                            aria-label={`Move ${node.shortLabel} earlier in ${meta.label}`}
                            data-testid="arch-node-move-earlier-btn"
                          >
                            {t('arch.zones.earlier')}
                          </button>
                          <button
                            type="button"
                            className="toolbar-button search-inline-button"
                            onClick={() => moveArchitectureNode(node, 1)}
                            disabled={index === bucket.nodes.length - 1}
                            aria-label={`Move ${node.shortLabel} later in ${meta.label}`}
                            data-testid="arch-node-move-later-btn"
                          >
                            {t('arch.zones.later')}
                          </button>
                          <button
                            type="button"
                            className="toolbar-button search-inline-button"
                            onClick={() => hideArchitectureNode(node)}
                            aria-label={`Hide ${node.shortLabel} from architecture view`}
                            data-testid="arch-node-hide-btn"
                          >
                            {t('arch.zones.hide')}
                          </button>
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="architecture-stage-empty">{t('arch.zones.noMappedCards')}</div>
                  )}
                </div>
              </section>
            )
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="panel-grid architecture-bottom-grid">
        <article className="panel-card">
          <div className="section-heading">
            <h2>{t('arch.flow.heading')}</h2>
            <span className="mini-status">{t('arch.flow.aggregatedEdges')}</span>
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
              <p className="hint">{isInitialTopologyLoad ? t('arch.detail.loading') : t('arch.flow.noEdges')}</p>
            )}
          </div>
        </article>

        <article className="panel-card">
          <div className="section-heading">
            <h2>{t('arch.hidden.heading')}</h2>
            <span className="mini-status">{t('arch.hidden.persistentDelta')}</span>
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
                        {t('arch.hidden.restore')}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="hint">{t('arch.hidden.noHiddenCards')}</p>
          )}
        </article>
      </section>
    </main>
  )
}
