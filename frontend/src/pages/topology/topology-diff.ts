/**
 * Raw topology diff R1 scaffold.
 *
 * Provides pure-function comparison of two TopologyResponse objects
 * and returns a structured diff suitable for UI rendering in
 * snapshot-compare mode.
 *
 * Run smoke test:
 *   node --experimental-strip-types scripts/topology_diff_semantics_smoke.mts
 */

import type { TopologyEdge, TopologyNode, TopologyResponse } from '../../lib/api'

// ============================================================
// Types
// ============================================================

export type TopologyDiffKind = 'added' | 'removed' | 'modified' | 'unchanged'

export type TopologyDiffNode = {
  node_key: string
  kind: TopologyDiffKind
  // For added/removed: the node data
  node?: TopologyNode
  // For modified: fields that changed
  changedFields?: string[]
}

export type TopologyDiffEdge = {
  edge_key: string
  kind: TopologyDiffKind
  // For added/removed: the edge data
  edge?: TopologyEdge
  // For modified: fields that changed
  changedFields?: string[]
}

export type TopologyDiffResult = {
  nodes: TopologyDiffNode[]
  edges: TopologyDiffEdge[]
  nodeCountDelta: number
  edgeCountDelta: number
}

// ============================================================
// Helpers
// ============================================================

function edgeKey(edge: TopologyEdge): string {
  return `${edge.source_node_key}::${edge.relation_type}::${edge.target_node_key}`
}

function nodeKeysEqual(a: TopologyNode, b: TopologyNode): boolean {
  return a.node_key === b.node_key
}

function edgesEqual(a: TopologyEdge, b: TopologyEdge): boolean {
  return (
    a.source_node_key === b.source_node_key &&
    a.relation_type === b.relation_type &&
    a.target_node_key === b.target_node_key
  )
}

function getNodeChangedFields(a: TopologyNode, b: TopologyNode): string[] {
  const changed: string[] = []
  const aKeys = new Set(Object.keys(a))
  const bKeys = new Set(Object.keys(b))
  const allKeys = new Set([...aKeys, ...bKeys])

  for (const key of allKeys) {
    if (key === 'node_key') continue // node_key is the identity
    if (a[key as keyof TopologyNode] !== b[key as keyof TopologyNode]) {
      changed.push(key)
    }
  }

  return changed
}

// ============================================================
// Core diff algorithm
// ============================================================

export function diffTopologyResponses(
  oldTopology: TopologyResponse | null,
  newTopology: TopologyResponse | null,
): TopologyDiffResult {
  const diff: TopologyDiffResult = {
    nodes: [],
    edges: [],
    nodeCountDelta: 0,
    edgeCountDelta: 0,
  }

  if (!oldTopology && !newTopology) {
    return diff
  }

  // Build lookup maps
  const oldNodeMap = new Map<string, TopologyNode>()
  const newNodeMap = new Map<string, TopologyNode>()

  const oldEdgeMap = new Map<string, TopologyEdge>()
  const newEdgeMap = new Map<string, TopologyEdge>()

  if (oldTopology?.nodes) {
    for (const node of oldTopology.nodes) {
      oldNodeMap.set(node.node_key, node)
    }
  }

  if (newTopology?.nodes) {
    for (const node of newTopology.nodes) {
      newNodeMap.set(node.node_key, node)
    }
  }

  if (oldTopology?.edges) {
    for (const edge of oldTopology.edges) {
      oldEdgeMap.set(edgeKey(edge), edge)
    }
  }

  if (newTopology?.edges) {
    for (const edge of newTopology.edges) {
      newEdgeMap.set(edgeKey(edge), edge)
    }
  }

  // --- Node diff ---
  const allNodeKeys = new Set([...oldNodeMap.keys(), ...newNodeMap.keys()])

  for (const key of allNodeKeys) {
    const oldNode = oldNodeMap.get(key)
    const newNode = newNodeMap.get(key)

    if (!oldNode && newNode) {
      // Added
      diff.nodes.push({ node_key: key, kind: 'added', node: newNode })
    } else if (oldNode && !newNode) {
      // Removed
      diff.nodes.push({ node_key: key, kind: 'removed', node: oldNode })
    } else if (oldNode && newNode) {
      // Both exist — check for modifications
      const changedFields = getNodeChangedFields(oldNode, newNode)
      diff.nodes.push({
        node_key: key,
        kind: changedFields.length > 0 ? 'modified' : 'unchanged',
        node: newNode,
        changedFields: changedFields.length > 0 ? changedFields : undefined,
      })
    }
  }

  // --- Edge diff ---
  const allEdgeKeys = new Set([...oldEdgeMap.keys(), ...newEdgeMap.keys()])

  for (const key of allEdgeKeys) {
    const oldEdge = oldEdgeMap.get(key)
    const newEdge = newEdgeMap.get(key)

    if (!oldEdge && newEdge) {
      diff.edges.push({ edge_key: key, kind: 'added', edge: newEdge })
    } else if (oldEdge && !newEdge) {
      diff.edges.push({ edge_key: key, kind: 'removed', edge: oldEdge })
    } else if (oldEdge && newEdge) {
      if (!edgesEqual(oldEdge, newEdge)) {
        const changedFields: string[] = []
        const aKeys = new Set(Object.keys(oldEdge))
        const bKeys = new Set(Object.keys(newEdge))
        const allKeys = new Set([...aKeys, ...bKeys])

        for (const field of allKeys) {
          if (oldEdge[field as keyof TopologyEdge] !== newEdge[field as keyof TopologyEdge]) {
            changedFields.push(field)
          }
        }

        diff.edges.push({
          edge_key: key,
          kind: 'modified',
          edge: newEdge,
          changedFields,
        })
      }
    }
  }

  // --- Calculate deltas ---
  const addedNodes = diff.nodes.filter((n) => n.kind === 'added').length
  const removedNodes = diff.nodes.filter((n) => n.kind === 'removed').length
  diff.nodeCountDelta = addedNodes - removedNodes

  const addedEdges = diff.edges.filter((e) => e.kind === 'added').length
  const removedEdges = diff.edges.filter((e) => e.kind === 'removed').length
  diff.edgeCountDelta = addedEdges - removedEdges

  // Sort for deterministic output
  diff.nodes.sort((a, b) => {
    if (a.kind !== b.kind) {
      const order = { added: 0, modified: 1, removed: 2, unchanged: 3 }
      return order[a.kind] - order[b.kind]
    }
    return a.node_key.localeCompare(b.node_key)
  })

  diff.edges.sort((a, b) => {
    if (a.kind !== b.kind) {
      const order: Record<TopologyDiffKind, number> = { added: 0, modified: 1, removed: 2, unchanged: 3 }
      return order[a.kind] - order[b.kind]
    }
    return a.edge_key.localeCompare(b.edge_key)
  })

  return diff
}

// ============================================================
// Utility: filter diff to show only nodes/edges matching a filter
// ============================================================

export function filterTopologyDiff(
  diff: TopologyDiffResult,
  filterKind?: TopologyDiffKind[],
  filterNodeKeySet?: Set<string>,
): TopologyDiffResult {
  const result: TopologyDiffResult = {
    nodes: [],
    edges: [],
    nodeCountDelta: diff.nodeCountDelta,
    edgeCountDelta: diff.edgeCountDelta,
  }

  if (filterKind) {
    result.nodes = diff.nodes.filter((n) => filterKind.includes(n.kind))
  } else {
    result.nodes = diff.nodes
  }

  if (filterNodeKeySet) {
    result.nodes = result.nodes.filter((n) => filterNodeKeySet.has(n.node_key))
  }

  if (filterKind) {
    result.edges = diff.edges.filter((e) => filterKind.includes(e.kind))
  } else {
    result.edges = diff.edges
  }

  return result
}
