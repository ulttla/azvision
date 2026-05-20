import type { TopologyArchiveCompareResponse, TopologyNodeDetail } from '../../lib/api'
import type { DictKey } from '../../i18n/dict'

export function formatDateTime(value?: string) {
  if (!value) {
    return '-'
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString()
}

export function formatRelativeTime(value?: string) {
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

export function prettifyKey(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export function formatSourceLabel(t: (key: DictKey) => string, value?: string) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized) {
    return '-'
  }
  if (normalized === 'azure') {
    return t('topology.detail.sourceAzureLive')
  }
  if (normalized === 'azure-explicit') {
    return t('topology.detail.sourceAzureExplicit')
  }
  if (normalized === 'manual') {
    return t('topology.detail.sourceManual')
  }
  if (normalized === 'inferred') {
    return t('topology.detail.sourceInferred')
  }
  return prettifyKey(normalized)
}

export function formatDeltaCounts(delta?: { added: unknown[]; removed: unknown[]; changed: unknown[] }) {
  if (!delta) {
    return '+0 / -0 / changed 0'
  }
  return `+${delta.added.length} / -${delta.removed.length} / changed ${delta.changed.length}`
}

export function formatDeltaItemLabel(item: unknown) {
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

export function formatNodeDetail(node: unknown): string {
  if (!node || typeof node !== 'object') return String(node ?? '-')
  const n = node as Record<string, unknown>
  const name = n.display_name ?? n.name ?? n.node_key ?? '-'
  const type = n.resource_type ?? n.node_type ?? ''
  const location = n.location ?? ''
  const parts = [String(name)]
  if (type) parts.push(`(${type})`)
  if (location) parts.push(`@ ${location}`)
  return parts.join(' ')
}

export function formatEdgeDetail(edge: unknown): string {
  if (!edge || typeof edge !== 'object') return String(edge ?? '-')
  const e = edge as Record<string, unknown>
  const src = e.source_node_key ?? e.source ?? '-'
  const tgt = e.target_node_key ?? e.target ?? '-'
  const rel = e.relation_type ?? e.type ?? ''
  return `${src} → ${tgt}${rel ? ` (${rel})` : ''}`
}

export function buildTopologyDiffMarkdown(t: (key: DictKey) => string, result: TopologyArchiveCompareResponse) {
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

  const nd = result.node_delta
  const ed = result.edge_delta
  const DISPLAY_MAX = 50

  if (nd.added.length) {
    lines.push('', `## Added Nodes (${nd.added.length})`)
    for (const n of nd.added.slice(0, DISPLAY_MAX)) lines.push(`- ${formatNodeDetail(n)}`)
  }
  if (nd.removed.length) {
    lines.push('', `## Removed Nodes (${nd.removed.length})`)
    for (const n of nd.removed.slice(0, DISPLAY_MAX)) lines.push(`- ${formatNodeDetail(n)}`)
  }
  if (nd.changed.length) {
    lines.push('', `## Changed Nodes (${nd.changed.length})`)
    for (const item of nd.changed.slice(0, DISPLAY_MAX)) {
      const c = item as Record<string, unknown>
      const key = c.node_key ?? '-'
      lines.push(`### ${key}`)
      lines.push(`- Before: ${formatNodeDetail(c.base)}`)
      lines.push(`- After: ${formatNodeDetail(c.target)}`)
    }
  }
  if (ed.added.length) {
    lines.push('', `## Added Edges (${ed.added.length})`)
    for (const e of ed.added.slice(0, DISPLAY_MAX)) lines.push(`- ${formatEdgeDetail(e)}`)
  }
  if (ed.removed.length) {
    lines.push('', `## Removed Edges (${ed.removed.length})`)
    for (const e of ed.removed.slice(0, DISPLAY_MAX)) lines.push(`- ${formatEdgeDetail(e)}`)
  }
  if (ed.changed.length) {
    lines.push('', `## Changed Edges (${ed.changed.length})`)
    for (const item of ed.changed.slice(0, DISPLAY_MAX)) {
      const c = item as Record<string, unknown>
      const key = c.edge_key ?? c.relation_key ?? formatDeltaItemLabel(item)
      lines.push(`### ${key}`)
      lines.push(`- Before: ${formatEdgeDetail(c.base)}`)
      lines.push(`- After: ${formatEdgeDetail(c.target)}`)
    }
  }

  if (result.archive_status === 'missing') {
    lines.push('', t('topology.detail.archiveMissing'))
  }

  return `${lines.join('\n')}\n`
}

export function formatPeeringTraversalLabel(peeringHopCount?: number, isForwardedTraffic?: boolean | null) {
  if (!peeringHopCount) {
    return 'intra-VNet'
  }
  if (isForwardedTraffic === true || peeringHopCount > 1) {
    return `forwarded peering (${peeringHopCount} hops)`
  }
  return 'direct peering'
}

export function formatPeeringEvidenceHint(t: (key: DictKey) => string, peeringHopCount?: number, isForwardedTraffic?: boolean | null) {
  if (!peeringHopCount) {
    return t('topology.detail.peeringIntraVNet')
  }
  if (isForwardedTraffic === true || peeringHopCount > 1) {
    return t('topology.detail.peeringForwarded')
  }
  return t('topology.detail.peeringDirect')
}

export function formatRouteNextHopLabel(nextHopType?: string, nextHopIp?: string) {
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

export function formatConfidenceLabel(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '-'
  }
  return `${Math.round(value * 100)}%`
}

export function getConfidenceTone(value?: number) {
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

export function getSourceTone(value?: string) {
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

export type GraphHoverCard = {
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

export function extractDetailScope(detail: TopologyNodeDetail | null) {
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
