/**
 * ArchitecturePage utility / pure functions extracted from the monolith page component.
 *
 * These are referenced by ArchitecturePage but also safe to reuse from
 * review/diff/test contexts without pulling in the full component tree.
 */

import {
  ARCHITECTURE_STAGE_META,
  type ArchitectureAnnotation,
  type ArchitectureNodeOverride,
  type ArchitectureStage,
} from './model'
import { type ArchitectureDetailDensityState } from './storage'
import type { TopologyNode, TopologyEdge, TopologyResponse } from '../../lib/api'

// ── constants ────────────────────────────────────────────────────────

export const ARCHITECTURE_BOARD_SCALE_OPTIONS = [1, 0.9, 0.8, 0.67, 0.55] as const

export const ARCHITECTURE_DETAIL_DENSITY_OPTIONS = ['compact', 'balanced', 'expanded'] as const

// ── types ─────────────────────────────────────────────────────────────

export type ArchitectureDetailDensity = ArchitectureDetailDensityState

export type ArchitectureDetailDensityLimits = {
  sourceResourceLimit: number
  flowEdgeLimit: number
}

// ── formatters ────────────────────────────────────────────────────────

export function formatDateTime(value?: string) {
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

export function formatScaleLabel(scale: number): string {
  return `${Math.round(scale * 100)}%`
}

// ── search-param helpers ─────────────────────────────────────────────

function readInitialSearchParam(key: string): string {
  if (typeof window === 'undefined') {
    return ''
  }

  return new URLSearchParams(window.location.search).get(key) ?? ''
}

export function parseInitialWorkspaceId(): string {
  return readInitialSearchParam('workspace')
}

export function parseInitialSubscriptionId(): string {
  return readInitialSearchParam('sub')
}

export function parseInitialResourceGroupName(): string {
  return readInitialSearchParam('rg')
}

// ── detail density ───────────────────────────────────────────────────

export function getDetailDensityLimits(density: ArchitectureDetailDensity): ArchitectureDetailDensityLimits {
  if (density === 'expanded') {
    return { sourceResourceLimit: 16, flowEdgeLimit: 32 }
  }
  if (density === 'balanced') {
    return { sourceResourceLimit: 8, flowEdgeLimit: 16 }
  }
  return { sourceResourceLimit: 4, flowEdgeLimit: 8 }
}

export function normalizeDetailDensity(value?: string): ArchitectureDetailDensity {
  return value === 'balanced' || value === 'expanded' ? value : 'compact'
}

export function getDetailDensityLabelKey(density: ArchitectureDetailDensity) {
  if (density === 'expanded') {
    return 'arch.controls.detailDensity.expanded' as const
  }
  if (density === 'balanced') {
    return 'arch.controls.detailDensity.balanced' as const
  }
  return 'arch.controls.detailDensity.compact' as const
}

// ── topology filters ─────────────────────────────────────────────────

export function filterTopologyByVisibleSourceKeys(
  topology: TopologyResponse | null,
  hiddenSourceNodeKeySet: Set<string>,
): TopologyResponse | null {
  if (!topology) {
    return null
  }

  const visibleNodes = topology.nodes.filter((node: TopologyNode) => {
    if (node.node_type !== 'resource') {
      return true
    }
    return !hiddenSourceNodeKeySet.has(node.node_key)
  })

  const visibleNodeKeys = new Set(visibleNodes.map((node: TopologyNode) => node.node_key))
  const visibleEdges = topology.edges.filter(
    (edge: TopologyEdge) => visibleNodeKeys.has(edge.source_node_key) && visibleNodeKeys.has(edge.target_node_key),
  )

  return {
    ...topology,
    nodes: visibleNodes,
    edges: visibleEdges,
  }
}

export function isArchitectureStage(value: string): value is ArchitectureStage {
  return Object.prototype.hasOwnProperty.call(ARCHITECTURE_STAGE_META, value)
}

export function normalizeNodeOverrides(overrides?: Record<string, { displayNameOverride?: string; stageKeyOverride?: string; position?: { order?: number } }>) {
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

export function normalizeAnnotations(annotations?: Array<{ id?: string; text?: string; tone?: string; updatedAt?: string }>): ArchitectureAnnotation[] {
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

export function filterTopologyByHiddenSourceKeys(
  topology: TopologyResponse | null,
  hiddenSourceNodeKeySet: Set<string>,
): TopologyResponse | null {
  if (!topology || !hiddenSourceNodeKeySet.size) {
    return null
  }

  const hiddenNodes = topology.nodes.filter(
    (node: TopologyNode) => node.node_type === 'resource' && hiddenSourceNodeKeySet.has(node.node_key),
  )

  const hiddenNodeKeys = new Set(hiddenNodes.map((node: TopologyNode) => node.node_key))
  const hiddenEdges = topology.edges.filter(
    (edge: TopologyEdge) => hiddenNodeKeys.has(edge.source_node_key) && hiddenNodeKeys.has(edge.target_node_key),
  )

  return {
    ...topology,
    nodes: hiddenNodes,
    edges: hiddenEdges,
  }
}

// ── export / clipboard helpers ───────────────────────────────────────

export async function rasterizeSvg(svg: string, width: number, height: number, labels: { loadSvgImage: string; canvasUnavailable: string }): Promise<string> {
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
