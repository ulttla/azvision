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

async function fetchJson(url) {
  const { response, text } = await fetchText(url, { headers: { Accept: 'application/json' } })
  let payload
  try {
    payload = JSON.parse(text)
  } catch {
    throw new Error(`${url} did not return JSON`)
  }
  return { response, payload }
}

function assertRequestId(response, label) {
  const requestId = response.headers.get('x-request-id')
  if (!requestId) {
    throw new Error(`${label} missing X-Request-ID header`)
  }
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
  assertRequestId(health.response, '/healthz')

  const ready = await fetchJson(`${baseUrl}/readyz`)
  if (![200, 503].includes(ready.response.status)) {
    throw new Error(`/readyz returned unexpected status ${ready.response.status}`)
  }
  assertRequestId(ready.response, '/readyz')

  const apiHealth = await fetchJson(`${apiBaseUrl}/healthz`)
  if (!apiHealth.response.ok || apiHealth.payload.status !== 'ok') {
    throw new Error('/api/v1/healthz did not return status=ok')
  }
  assertRequestId(apiHealth.response, '/api/v1/healthz')

  const workspaces = await fetchJson(`${apiBaseUrl}/workspaces`)
  const items = Array.isArray(workspaces.payload.items) ? workspaces.payload.items : []
  if (items.length < 1) {
    throw new Error('expected at least one demo/local workspace')
  }
  assertNoSecretLikeText('workspaces payload', JSON.stringify(workspaces.payload).slice(0, 5000))

  console.log(`PASS: hosted public beta smoke completed workspaces=${items.length}`)
}

main().catch((error) => {
  console.error(`[fail] ${error.message}`)
  process.exit(1)
})
