#!/usr/bin/env node
import process from 'node:process'

const REQUIRED_ENV = ['AZVISION_HOSTED_BASE_URL', 'AZVISION_HOSTED_API_BASE_URL']
const SECRET_PATTERNS = [
  /openrouter[_-]?api[_-]?key/i,
  /azure[_-]?client[_-]?secret/i,
  /azure[_-]?cert/i,
  /password/i,
  /bearer\s+[a-z0-9._-]+/i,
  /sk-or-[a-z0-9_-]{20,}/i,
]

function usage() {
  console.log(`AzVision hosted public beta smoke\n\nUsage:\n  AZVISION_HOSTED_BASE_URL=https://private-preview.example \\\n  AZVISION_HOSTED_API_BASE_URL=https://private-preview.example/api/v1 \\\n  node scripts/hosted_public_beta_smoke.mjs\n\nOptions:\n  --contract-check   Validate script contract without network access\n`)
}

function normalizeUrl(value, name) {
  if (!value) {
    throw new Error(`${name} is required`)
  }
  let parsed
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`${name} must be a valid URL`)
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${name} must use http or https`)
  }
  parsed.pathname = parsed.pathname.replace(/\/$/, '')
  return parsed.toString().replace(/\/$/, '')
}

function assertNoSecretLikeText(label, text) {
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(text)) {
      throw new Error(`${label} contains secret-like text matching ${pattern}`)
    }
  }
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'X-Request-ID': `req-hosted-smoke-${Date.now()}`,
      ...(options.headers || {}),
    },
  })
  const text = await response.text()
  assertNoSecretLikeText(url, text.slice(0, 5000))
  return { response, text }
}

async function fetchJson(url, options = {}) {
  const { response, text } = await fetchText(url, {
    ...options,
    headers: { Accept: 'application/json', ...(options.headers || {}) },
  })
  let payload
  try {
    payload = JSON.parse(text)
  } catch {
    throw new Error(`${url} did not return JSON`)
  }
  assertNoSecretLikeText(url, JSON.stringify(payload).slice(0, 5000))
  return { response, payload }
}

async function postJson(url, payload) {
  return fetchJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

async function deleteJson(url) {
  return fetchJson(url, { method: 'DELETE' })
}

function assertRequestId(response, label) {
  const requestId = response.headers.get('x-request-id')
  if (!requestId) {
    throw new Error(`${label} missing X-Request-ID header`)
  }
}

function assertSecurityHeaders(response, label) {
  assertRequestId(response, label)
  for (const name of ['x-content-type-options', 'x-frame-options', 'referrer-policy', 'content-security-policy']) {
    if (!response.headers.get(name)) {
      throw new Error(`${label} missing ${name} header`)
    }
  }
}

function assertOkJson(result, label) {
  if (!result.response.ok || result.payload.ok === false) {
    throw new Error(`${label} returned ${result.response.status}`)
  }
  assertSecurityHeaders(result.response, label)
}

async function main() {
  if (process.argv.includes('--help')) {
    usage()
    return
  }

  if (process.argv.includes('--contract-check')) {
    for (const name of REQUIRED_ENV) {
      if (!REQUIRED_ENV.includes(name)) throw new Error(`internal contract mismatch for ${name}`)
    }
    console.log('PASS: hosted public beta smoke contract check completed')
    return
  }

  const baseUrl = normalizeUrl(process.env.AZVISION_HOSTED_BASE_URL, 'AZVISION_HOSTED_BASE_URL')
  const apiBaseUrl = normalizeUrl(process.env.AZVISION_HOSTED_API_BASE_URL, 'AZVISION_HOSTED_API_BASE_URL')

  const page = await fetchText(baseUrl)
  if (!page.response.ok) {
    throw new Error(`frontend returned ${page.response.status}`)
  }
  assertNoSecretLikeText('frontend page', page.text)

  const health = await fetchJson(`${baseUrl}/healthz`)
  if (!health.response.ok || health.payload.status !== 'ok') {
    throw new Error('/healthz did not return status=ok')
  }
  assertSecurityHeaders(health.response, '/healthz')

  const ready = await fetchJson(`${baseUrl}/readyz`)
  if (![200, 503].includes(ready.response.status)) {
    throw new Error(`/readyz returned unexpected status ${ready.response.status}`)
  }
  assertSecurityHeaders(ready.response, '/readyz')

  const apiHealth = await fetchJson(`${apiBaseUrl}/healthz`)
  if (!apiHealth.response.ok || apiHealth.payload.status !== 'ok') {
    throw new Error('/api/v1/healthz did not return status=ok')
  }
  assertSecurityHeaders(apiHealth.response, '/api/v1/healthz')

  const workspaces = await fetchJson(`${apiBaseUrl}/workspaces`)
  assertOkJson(workspaces, '/workspaces')
  const items = Array.isArray(workspaces.payload.items) ? workspaces.payload.items : []
  if (items.length < 1) {
    throw new Error('expected at least one demo/local workspace')
  }
  const workspaceId = items[0].id
  if (!workspaceId) {
    throw new Error('workspace item missing id')
  }

  const topology = await fetchJson(`${apiBaseUrl}/workspaces/${encodeURIComponent(workspaceId)}/topology`)
  assertOkJson(topology, '/topology')
  const nodes = Array.isArray(topology.payload.nodes) ? topology.payload.nodes : []
  const edges = Array.isArray(topology.payload.edges) ? topology.payload.edges : []
  if (nodes.length < 1 || edges.length < 1) {
    throw new Error('demo topology must include nodes and edges')
  }

  const snapshotName = `hosted-smoke-${Date.now()}`
  const snapshot = await postJson(`${apiBaseUrl}/workspaces/${encodeURIComponent(workspaceId)}/snapshots`, {
    name: snapshotName,
    note: 'Created by hosted public beta smoke; safe to delete.',
    visible_node_count: nodes.length,
    loaded_node_count: nodes.length,
    edge_count: edges.length,
  })
  assertOkJson(snapshot, 'snapshot create')
  const snapshotId = snapshot.payload.id
  if (!snapshotId) {
    throw new Error('created snapshot missing id')
  }

  try {
    const snapshotList = await fetchJson(`${apiBaseUrl}/workspaces/${encodeURIComponent(workspaceId)}/snapshots`)
    assertOkJson(snapshotList, 'snapshot list')
    const listed = Array.isArray(snapshotList.payload.items) && snapshotList.payload.items.some((item) => item.id === snapshotId)
    if (!listed) {
      throw new Error('created snapshot not found in list')
    }

    const snapshotDetail = await fetchJson(`${apiBaseUrl}/workspaces/${encodeURIComponent(workspaceId)}/snapshots/${encodeURIComponent(snapshotId)}`)
    assertOkJson(snapshotDetail, 'snapshot detail')
    if (snapshotDetail.payload.name !== snapshotName) {
      throw new Error('snapshot detail name mismatch')
    }

    const restored = await postJson(`${apiBaseUrl}/workspaces/${encodeURIComponent(workspaceId)}/snapshots/${encodeURIComponent(snapshotId)}/restore-events`, {})
    assertOkJson(restored, 'snapshot restore event')
    if (restored.payload.restore_count < 1) {
      throw new Error('snapshot restore event did not increment restore_count')
    }
  } finally {
    const deleted = await deleteJson(`${apiBaseUrl}/workspaces/${encodeURIComponent(workspaceId)}/snapshots/${encodeURIComponent(snapshotId)}`)
    if (!deleted.response.ok) {
      throw new Error(`snapshot cleanup failed with ${deleted.response.status}`)
    }
    assertSecurityHeaders(deleted.response, 'snapshot cleanup')
  }

  const cost = await fetchJson(`${apiBaseUrl}/workspaces/${encodeURIComponent(workspaceId)}/cost/summary`)
  assertOkJson(cost, 'cost summary')
  const costText = JSON.stringify(cost.payload).toLowerCase()
  if (!costText.includes('unknown') && !costText.includes('estimated') && !costText.includes('mock')) {
    throw new Error('cost summary did not expose unknown/estimated/mock cost labeling')
  }

  const copilot = await postJson(`${apiBaseUrl}/workspaces/${encodeURIComponent(workspaceId)}/chat`, {
    message: 'Give a short public beta smoke summary without secrets.',
    current_view: 'hosted-smoke',
  })
  assertOkJson(copilot, 'copilot fallback')
  if (!copilot.payload.answer && !copilot.payload.message) {
    throw new Error('copilot fallback did not return answer text')
  }

  console.log(`PASS: hosted public beta smoke completed workspace=${workspaceId} nodes=${nodes.length} edges=${edges.length}`)
}

main().catch((error) => {
  console.error(`[fail] ${error.message}`)
  process.exit(1)
})
