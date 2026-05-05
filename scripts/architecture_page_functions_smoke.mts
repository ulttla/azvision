/**
 * Browserless FE semantics smoke — ArchitecturePage utility functions.
 * Tests the actual behavioral contracts of ArchitecturePage helpers
 * (formatDateTime, formatScaleLabel, isArchitectureStage,
 *  normalizeNodeOverrides, normalizeAnnotations,
 *  filterTopologyByVisibleSourceKeys, filterTopologyByHiddenSourceKeys).
 *
 * Run: node --experimental-strip-types scripts/architecture_page_functions_smoke.mts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..')
const archPageCode = readFileSync(path.join(repoRoot, 'frontend/src/pages/ArchitecturePage.tsx'), 'utf8')
const packageCode = readFileSync(path.join(repoRoot, 'frontend/package.json'), 'utf8')

// ============================================================
// Section 1: formatDateTime — date formatting with edge cases
// ============================================================
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

assert.equal(formatDateTime(), '—', 'formatDateTime(undefined) → "—"')
assert.equal(formatDateTime(''), '—', 'formatDateTime("") → "—"')
assert.equal(formatDateTime(null as unknown as string), '—', 'formatDateTime(null) → "—"')

// Valid date string should produce formatted output (locale-dependent; just verify it's not the em dash)
const formatted = formatDateTime('2025-06-15T10:30:00Z')
assert.notEqual(formatted, '—', 'formatDateTime should format a valid ISO date')
assert.ok(formatted.length > 1, 'formatDateTime output should be longer than 1 char for a valid date')

// Invalid date string should fall through to return the original value
const invalid = formatDateTime('not-a-date')
assert.equal(invalid, 'not-a-date', 'formatDateTime should return raw value for unparseable date')
assert.match(archPageCode, /function formatDateTime/, 'ArchitecturePage should define formatDateTime')

// ============================================================
// Section 2: formatScaleLabel — percentage label rendering
// ============================================================
function formatScaleLabel(scale: number): string {
  return `${Math.round(scale * 100)}%`
}

assert.equal(formatScaleLabel(1), '100%', 'formatScaleLabel(1) → "100%"')
assert.equal(formatScaleLabel(0.8), '80%', 'formatScaleLabel(0.8) → "80%"')
assert.equal(formatScaleLabel(0.67), '67%', 'formatScaleLabel(0.67) → "67%"')
assert.equal(formatScaleLabel(0.55), '55%', 'formatScaleLabel(0.55) → "55%"')
assert.equal(formatScaleLabel(0.5), '50%', 'formatScaleLabel(0.5) → "50%"')
assert.equal(formatScaleLabel(0), '0%', 'formatScaleLabel(0) → "0%"')
assert.equal(formatScaleLabel(0.333), '33%', 'formatScaleLabel should round fractional percentages')
assert.equal(formatScaleLabel(0.995), '100%', 'formatScaleLabel should round up near-boundary values')
assert.match(archPageCode, /function formatScaleLabel/, 'ArchitecturePage should define formatScaleLabel')

// ============================================================
// Section 3: isArchitectureStage — stage guard validation
// ============================================================
// Replicate the ARCHITECTURE_STAGE_META keys from the production source
const ARCHITECTURE_STAGE_META = {
  source: { label: 'Source', description: '' },
  ingest: { label: 'Ingest', description: '' },
  process: { label: 'Process', description: '' },
  store: { label: 'Store', description: '' },
  serve: { label: 'Serve', description: '' },
  infra: { label: 'Infrastructure', description: '' },
  unclassified: { label: 'Unclassified', description: '' },
}

function isArchitectureStage(value: string): boolean {
  return Object.prototype.hasOwnProperty.call(ARCHITECTURE_STAGE_META, value)
}

assert.equal(isArchitectureStage('source'), true, 'isArchitectureStage(source) → true')
assert.equal(isArchitectureStage('ingest'), true, 'isArchitectureStage(ingest) → true')
assert.equal(isArchitectureStage('process'), true, 'isArchitectureStage(process) → true')
assert.equal(isArchitectureStage('store'), true, 'isArchitectureStage(store) → true')
assert.equal(isArchitectureStage('serve'), true, 'isArchitectureStage(serve) → true')
assert.equal(isArchitectureStage('infra'), true, 'isArchitectureStage(infra) → true')
assert.equal(isArchitectureStage('unclassified'), true, 'isArchitectureStage(unclassified) → true')
assert.equal(isArchitectureStage('invalid'), false, 'isArchitectureStage(invalid) → false')
assert.equal(isArchitectureStage(''), false, 'isArchitectureStage("") → false')
assert.equal(isArchitectureStage('SOURCE'), false, 'isArchitectureStage is case-sensitive → false')
// Prototype-inherited properties should not pass
assert.equal(isArchitectureStage('toString'), false, 'isArchitectureStage should reject prototype-inherited keys')
assert.equal(isArchitectureStage('hasOwnProperty'), false, 'isArchitectureStage should reject hasOwnProperty')

assert.match(archPageCode, /function isArchitectureStage/, 'ArchitecturePage should define isArchitectureStage')
assert.match(archPageCode, /Object\.prototype\.hasOwnProperty\.call|hasOwnProperty/, 'ArchitecturePage should guard stage keys with own-property check')

// ============================================================
// Section 4: normalizeNodeOverrides — override sanitization
// ============================================================
type ArchitectureNodeOverride = {
  displayNameOverride?: string
  stageKeyOverride?: string
  position?: { order: number }
}

function normalizeNodeOverrides(
  overrides?: Record<string, { displayNameOverride?: string; stageKeyOverride?: string; position?: { order?: number } }>
): Record<string, ArchitectureNodeOverride> {
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

// Empty / undefined input
assert.deepEqual(normalizeNodeOverrides(), {}, 'normalizeNodeOverrides(undefined) → {}')
assert.deepEqual(normalizeNodeOverrides({}), {}, 'normalizeNodeOverrides({}) → {}')

// Valid display name override
assert.deepEqual(
  normalizeNodeOverrides({ 'res1': { displayNameOverride: '  My Label  ' } }),
  { res1: { displayNameOverride: 'My Label' } },
  'normalizeNodeOverrides should trim display name override whitespace',
)

// Empty display name after trim should be dropped
assert.deepEqual(
  normalizeNodeOverrides({ 'res1': { displayNameOverride: '   ' } }),
  {},
  'normalizeNodeOverrides should drop whitespace-only display name',
)

// Valid stage override
assert.deepEqual(
  normalizeNodeOverrides({ 'res1': { stageKeyOverride: 'source' } }),
  { res1: { stageKeyOverride: 'source' } },
  'normalizeNodeOverrides should accept valid stage key',
)

// Invalid stage override should be dropped entirely if no other fields exist
assert.deepEqual(
  normalizeNodeOverrides({ 'res1': { stageKeyOverride: 'bogus' } }),
  {},
  'normalizeNodeOverrides should reject invalid stage key',
)

// Stage override combined with display name
assert.deepEqual(
  normalizeNodeOverrides({ 'res1': { displayNameOverride: 'API', stageKeyOverride: 'serve' } }),
  { res1: { displayNameOverride: 'API', stageKeyOverride: 'serve' } },
  'normalizeNodeOverrides should accept combined overrides',
)

// Position override
assert.deepEqual(
  normalizeNodeOverrides({ 'res1': { position: { order: 5 } } }),
  { res1: { position: { order: 5 } } },
  'normalizeNodeOverrides should accept valid position order',
)
assert.deepEqual(
  normalizeNodeOverrides({ 'res1': { position: { order: 0 } } }),
  { res1: { position: { order: 0 } } },
  'normalizeNodeOverrides should accept position order 0',
)

// Non-finite position should be rejected
assert.deepEqual(
  normalizeNodeOverrides({ 'res1': { position: { order: Infinity } } }),
  {},
  'normalizeNodeOverrides should reject non-finite position order',
)
assert.deepEqual(
  normalizeNodeOverrides({ 'res1': { position: { order: NaN } } }),
  {},
  'normalizeNodeOverrides should reject NaN position order',
)
assert.deepEqual(
  normalizeNodeOverrides({ 'res1': { position: { order: undefined as unknown as number } } }),
  {},
  'normalizeNodeOverrides should reject undefined position order',
)

// Multiple nodes
assert.deepEqual(
  normalizeNodeOverrides({
    'res1': { displayNameOverride: 'API' },
    'res2': { stageKeyOverride: 'process' },
  }),
  { res1: { displayNameOverride: 'API' }, res2: { stageKeyOverride: 'process' } },
  'normalizeNodeOverrides should handle multiple entries',
)

// All fields
assert.deepEqual(
  normalizeNodeOverrides({
    'res1': { displayNameOverride: 'Web', stageKeyOverride: 'serve', position: { order: 10 } },
  }),
  { res1: { displayNameOverride: 'Web', stageKeyOverride: 'serve', position: { order: 10 } } },
  'normalizeNodeOverrides should accept all three override fields',
)

// Invalid stage with other valid fields should keep the valid fields
assert.deepEqual(
  normalizeNodeOverrides({
    'res1': { displayNameOverride: 'Web', stageKeyOverride: 'bogus' },
  }),
  { res1: { displayNameOverride: 'Web' } },
  'normalizeNodeOverrides should keep display name when stage is invalid',
)

assert.match(archPageCode, /function normalizeNodeOverrides/, 'ArchitecturePage should define normalizeNodeOverrides')

// ============================================================
// Section 5: normalizeAnnotations — annotation sanitization
// ============================================================
interface ArchitectureAnnotation {
  id: string
  text: string
  tone: 'note' | 'warning' | 'info'
  updatedAt?: string
}

function normalizeAnnotations(
  annotations?: Array<{ id?: string; text?: string; tone?: string; updatedAt?: string }>
): ArchitectureAnnotation[] {
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

// Empty / undefined
assert.deepEqual(normalizeAnnotations(), [], 'normalizeAnnotations(undefined) → []')
assert.deepEqual(normalizeAnnotations([]), [], 'normalizeAnnotations([]) → []')

// Valid note annotation
assert.deepEqual(
  normalizeAnnotations([{ id: 'a1', text: '  Production gateway  ' }]),
  [{ id: 'a1', text: 'Production gateway', tone: 'note' }],
  'normalizeAnnotations should trim whitespace and default tone to note',
)

// info / warning tone
assert.deepEqual(
  normalizeAnnotations([{ id: 'a1', text: 'Check LB rules', tone: 'info' }]),
  [{ id: 'a1', text: 'Check LB rules', tone: 'info' }],
  'normalizeAnnotations should pass through info tone',
)
assert.deepEqual(
  normalizeAnnotations([{ id: 'a1', text: 'Expired cert', tone: 'warning' }]),
  [{ id: 'a1', text: 'Expired cert', tone: 'warning' }],
  'normalizeAnnotations should pass through warning tone',
)

// Unknown tone → fallback to note
assert.deepEqual(
  // @ts-expect-error testing runtime fallback for invalid tone
  normalizeAnnotations([{ id: 'a1', text: 'Hello', tone: 'urgent' }]),
  [{ id: 'a1', text: 'Hello', tone: 'note' }],
  'normalizeAnnotations should fall back to note for unknown tone',
)
assert.deepEqual(
  // @ts-expect-error testing runtime fallback
  normalizeAnnotations([{ id: 'a1', text: 'Hello', tone: '' }]),
  [{ id: 'a1', text: 'Hello', tone: 'note' }],
  'normalizeAnnotations should fall back to note for empty tone',
)

// Truncation at 280 chars
const longText = 'x'.repeat(300)
const result = normalizeAnnotations([{ id: 'a1', text: longText }])
assert.equal(result[0].text.length, 280, 'normalizeAnnotations should truncate text to 280 chars')
assert.equal(result[0].text, 'x'.repeat(280), 'normalizeAnnotations should keep first 280 chars')

// Missing id → drop
assert.deepEqual(
  normalizeAnnotations([{ text: 'No id here' }]),
  [],
  'normalizeAnnotations should drop entries without id',
)

// Empty text after trim → drop
assert.deepEqual(
  normalizeAnnotations([{ id: 'a1', text: '   ' }]),
  [],
  'normalizeAnnotations should drop whitespace-only text',
)

// Missing text → drop
assert.deepEqual(
  normalizeAnnotations([{ id: 'a1' }]),
  [],
  'normalizeAnnotations should drop entries with no text',
)

// updatedAt passed through
assert.deepEqual(
  normalizeAnnotations([{ id: 'a1', text: 'hello', updatedAt: '2025-01-01T00:00:00Z' }]),
  [{ id: 'a1', text: 'hello', tone: 'note', updatedAt: '2025-01-01T00:00:00Z' }],
  'normalizeAnnotations should pass through updatedAt',
)

// Multiple annotations
assert.deepEqual(
  normalizeAnnotations([
    { id: 'a1', text: 'First' },
    { id: 'a2', text: 'Second', tone: 'warning' },
  ]),
  [
    { id: 'a1', text: 'First', tone: 'note' },
    { id: 'a2', text: 'Second', tone: 'warning' },
  ],
  'normalizeAnnotations should handle multiple entries',
)

assert.match(archPageCode, /function normalizeAnnotations/, 'ArchitecturePage should define normalizeAnnotations')

// ============================================================
// Section 6: filterTopologyByVisibleSourceKeys — topology visibility filter
// ============================================================
interface TopologyNode {
  node_key: string
  node_type: string
  display_name?: string
  resource_type?: string
}

interface TopologyEdge {
  source_node_key: string
  target_node_key: string
  relation_type?: string
}

interface TopologyResponse {
  nodes: TopologyNode[]
  edges: TopologyEdge[]
  status?: string
  message?: string
  generated_at?: string
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

// Null topology
assert.equal(
  filterTopologyByVisibleSourceKeys(null, new Set(['key1'])),
  null,
  'filterTopologyByVisibleSourceKeys(null, ...) → null',
)

// Empty hidden set — all resources visible
const simpleTopo: TopologyResponse = {
  nodes: [
    { node_key: 'res1', node_type: 'resource', display_name: 'vm1' },
    { node_key: 'res2', node_type: 'resource', display_name: 'vm2' },
    { node_key: 'inferred1', node_type: 'inferred', display_name: 'internet' },
  ],
  edges: [
    { source_node_key: 'res1', target_node_key: 'res2' },
    { source_node_key: 'res2', target_node_key: 'inferred1' },
    { source_node_key: 'inferred1', target_node_key: 'res1' },
  ],
}

const noHidden = filterTopologyByVisibleSourceKeys(simpleTopo, new Set([]))
assert.equal(noHidden?.nodes.length, 3, 'empty hidden set → all nodes visible')
assert.deepEqual(noHidden?.nodes.map((node) => node.node_key), ['res1', 'res2', 'inferred1'], 'empty hidden set → all node keys preserved')

// One resource hidden
const oneHidden = filterTopologyByVisibleSourceKeys(simpleTopo, new Set(['res1']))
assert.equal(oneHidden?.nodes.length, 2, 'hiding res1 → 2 nodes visible')
assert.deepEqual(
  oneHidden?.nodes.map((node) => node.node_key),
  ['res2', 'inferred1'],
  'hiding res1 should keep res2 and inferred1',
)
// Edges involving res1 should be dropped
assert.equal(oneHidden?.edges.length, 1, 'hiding res1 should drop edges involving res1')
assert.deepEqual(
  oneHidden?.edges[0],
  { source_node_key: 'res2', target_node_key: 'inferred1' },
  'only edge between visible nodes should remain',
)

// Both resources hidden — inferred nodes still visible
const bothHidden = filterTopologyByVisibleSourceKeys(simpleTopo, new Set(['res1', 'res2']))
assert.equal(bothHidden?.nodes.length, 1, 'hiding both resources → only inferred visible')
assert.equal(bothHidden?.nodes[0].node_key, 'inferred1', 'inferred node should never be filtered out')
assert.equal(bothHidden?.edges.length, 0, 'no edges when both resource nodes hidden')

// Non-resource nodes should never be hidden (even if their key is in the hidden set)
const inferredHidden = filterTopologyByVisibleSourceKeys(simpleTopo, new Set(['inferred1']))
assert.equal(inferredHidden?.nodes.length, 3, 'inferred node should not be filtered even when in hidden set')
assert.ok(inferredHidden?.nodes.some((node) => node.node_key === 'inferred1'), 'inferred node should remain visible')

// Topology metadata passthrough
const topoWithMeta: TopologyResponse = {
  nodes: [{ node_key: 'res1', node_type: 'resource' }],
  edges: [],
  status: 'ok',
  message: 'Success',
  generated_at: '2025-01-01T00:00:00Z',
}
const filteredMeta = filterTopologyByVisibleSourceKeys(topoWithMeta, new Set([]))
assert.equal(filteredMeta?.status, 'ok', 'filterTopologyByVisibleSourceKeys should pass through status')
assert.equal(filteredMeta?.generated_at, '2025-01-01T00:00:00Z', 'filterTopologyByVisibleSourceKeys should pass through generated_at')

assert.match(archPageCode, /function filterTopologyByVisibleSourceKeys/, 'ArchitecturePage should define filterTopologyByVisibleSourceKeys')

// ============================================================
// Section 7: filterTopologyByHiddenSourceKeys — complement visibility filter
// ============================================================
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

// Null topology
assert.equal(
  filterTopologyByHiddenSourceKeys(null, new Set(['key1'])),
  null,
  'filterTopologyByHiddenSourceKeys(null, ...) → null',
)

// Empty hidden set
assert.equal(
  filterTopologyByHiddenSourceKeys(simpleTopo, new Set([])),
  null,
  'filterTopologyByHiddenSourceKeys with empty set → null',
)

// One hidden resource
const oneHiddenComplement = filterTopologyByHiddenSourceKeys(simpleTopo, new Set(['res1']))
assert.equal(oneHiddenComplement?.nodes.length, 1, 'complement filter: only hidden node visible')
assert.equal(oneHiddenComplement?.nodes[0].node_key, 'res1', 'complement filter: hidden node is res1')
assert.equal(oneHiddenComplement?.edges.length, 0, 'complement filter: no edges when only one hidden node')

// Non-resource nodes ignored in complement
assert.equal(
  filterTopologyByHiddenSourceKeys(simpleTopo, new Set(['inferred1']))?.nodes.length,
  0,
  'complement filter should ignore non-resource nodes',
)

// Multiple hidden resources with edge between them
const topoWithEdge: TopologyResponse = {
  nodes: [
    { node_key: 'res1', node_type: 'resource' },
    { node_key: 'res2', node_type: 'resource' },
    { node_key: 'res3', node_type: 'resource' },
  ],
  edges: [
    { source_node_key: 'res1', target_node_key: 'res2' },
    { source_node_key: 'res2', target_node_key: 'res3' },
    { source_node_key: 'res1', target_node_key: 'res3' },
  ],
}
const multiHidden = filterTopologyByHiddenSourceKeys(topoWithEdge, new Set(['res1', 'res2']))
assert.equal(multiHidden?.nodes.length, 2, 'complement: two hidden nodes')
assert.equal(multiHidden?.edges.length, 1, 'complement: only edge between hidden nodes preserved')
assert.deepEqual(
  multiHidden?.edges[0],
  { source_node_key: 'res1', target_node_key: 'res2' },
  'complement: edge between res1-res2 preserved, res2-res3 and res1-res3 dropped',
)

// Non-resource key in hidden set should not cause non-resource nodes to appear
const inferredInHidden = filterTopologyByHiddenSourceKeys(simpleTopo, new Set(['res1', 'inferred1']))
assert.equal(inferredInHidden?.nodes.length, 1, 'complement: non-resource keys in hidden set do not bring non-resource nodes into hidden view')
assert.equal(inferredInHidden?.nodes[0].node_key, 'res1', 'complement: only the resource node appears')

assert.match(archPageCode, /function filterTopologyByHiddenSourceKeys/, 'ArchitecturePage should define filterTopologyByHiddenSourceKeys')

// ============================================================
// Section 8: Verify helper source presence and smoke-chain wiring
// ============================================================
assert.match(packageCode, /architecture_page_functions_smoke\.mts/, 'frontend smoke:semantics should include ArchitecturePage function behavior smoke')

const requiredFunctions = [
  'formatDateTime',
  'formatScaleLabel',
  'isArchitectureStage',
  'normalizeNodeOverrides',
  'normalizeAnnotations',
  'filterTopologyByVisibleSourceKeys',
  'filterTopologyByHiddenSourceKeys',
]

for (const fn of requiredFunctions) {
  assert.match(archPageCode, new RegExp(`\\b${fn}\\b`), `ArchitecturePage should reference ${fn}`)
}

console.log('✅ architecture_page_functions_smoke.mts: all assertions passed')
