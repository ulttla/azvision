// Local visual smoke for Saved Snapshots sort semantics.
// Requires a running AzVision frontend/backend and local Google Chrome.

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

const APP_URL = process.env.AZVISION_APP_URL || 'http://127.0.0.1:5173'
const API_BASE = process.env.AZVISION_API_BASE || 'http://127.0.0.1:8000/api/v1'
const WORKSPACE_ID = process.env.AZVISION_WORKSPACE_ID || 'local-demo'
const CDP_PORT = Number(process.env.AZVISION_CDP_PORT || '9223')
const CHROME_BIN =
  process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT_DIR =
  process.env.AZVISION_OUT_DIR || path.join(os.tmpdir(), `azvision-sort-visual-smoke-${Date.now()}`)
const RECENT_LIMIT = Number(process.env.AZVISION_RECENT_LIMIT || '8')

function sortFieldValue(snapshot, sortBy) {
  if (sortBy === 'last_restored_at') return snapshot.last_restored_at || ''
  if (sortBy === 'updated_at') return snapshot.updated_at || ''
  return snapshot.captured_at || snapshot.created_at || ''
}

function orderSavedSnapshots(snapshots, sortBy, sortOrder) {
  return [...snapshots].sort((left, right) => {
    if (Boolean(left.is_pinned) !== Boolean(right.is_pinned)) {
      return left.is_pinned ? -1 : 1
    }

    const leftArchived = Boolean(left.archived_at)
    const rightArchived = Boolean(right.archived_at)
    if (leftArchived !== rightArchived) {
      return leftArchived ? 1 : -1
    }

    const leftVal = sortFieldValue(left, sortBy)
    const rightVal = sortFieldValue(right, sortBy)
    const cmp = rightVal.localeCompare(leftVal)
    if (cmp !== 0) return sortOrder === 'asc' ? -cmp : cmp

    const leftCaptured = left.captured_at || left.created_at || ''
    const rightCaptured = right.captured_at || right.created_at || ''
    return rightCaptured.localeCompare(leftCaptured)
  })
}

function getRecentSnapshots(snapshots, limit = RECENT_LIMIT) {
  return [...snapshots]
    .filter((snapshot) => !snapshot.archived_at)
    .sort((left, right) => {
      const leftVal = left.last_restored_at || left.captured_at || left.created_at || ''
      const rightVal = right.last_restored_at || right.captured_at || right.created_at || ''
      return rightVal.localeCompare(leftVal)
    })
    .slice(0, limit)
}

function nameList(items) {
  return items.map((item) => item.name)
}

function assertNameOrder(label, actual, expected) {
  const actualNames = nameList(actual)
  const expectedNames = nameList(expected)
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    throw new Error(`${label} mismatch\nactual=${JSON.stringify(actualNames, null, 2)}\nexpected=${JSON.stringify(expectedNames, null, 2)}`)
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForHttp(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await sleep(200)
  }
  throw new Error(`Timed out waiting for ${url}`)
}

class CdpClient {
  constructor(ws) {
    this.ws = ws
    this.nextId = 1
    this.pending = new Map()
    this.listeners = new Map()

    ws.addEventListener('message', (event) => {
      const payload = JSON.parse(String(event.data))
      if (payload.id) {
        const handler = this.pending.get(payload.id)
        if (!handler) return
        this.pending.delete(payload.id)
        if (payload.error) {
          handler.reject(new Error(payload.error.message || JSON.stringify(payload.error)))
          return
        }
        handler.resolve(payload.result)
        return
      }
      const handlers = this.listeners.get(payload.method) || []
      for (const handler of handlers) {
        handler(payload.params)
      }
    })
  }

  send(method, params = {}) {
    const id = this.nextId++
    const message = JSON.stringify({ id, method, params })
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(message)
    })
  }

  on(method, handler) {
    const handlers = this.listeners.get(method) || []
    handlers.push(handler)
    this.listeners.set(method, handlers)
    return () => {
      const next = (this.listeners.get(method) || []).filter((item) => item !== handler)
      if (next.length) this.listeners.set(method, next)
      else this.listeners.delete(method)
    }
  }

  waitFor(method, predicate = () => true, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        off()
        reject(new Error(`Timed out waiting for CDP event ${method}`))
      }, timeoutMs)
      const off = this.on(method, (params) => {
        if (!predicate(params)) return
        clearTimeout(timeout)
        off()
        resolve(params)
      })
    })
  }
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  })
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Runtime.evaluate failed')
  }
  return result.result?.value
}

async function waitForExpression(client, expression, timeoutMs = 30000, intervalMs = 200) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const ok = await evaluate(client, expression)
    if (ok) return
    await sleep(intervalMs)
  }
  throw new Error(`Timed out waiting for expression: ${expression}`)
}

async function clickExpression(client, expression) {
  const ok = await evaluate(client, expression)
  if (!ok) {
    throw new Error(`Click expression did not find a target: ${expression}`)
  }
}

async function setSelectValue(client, selector, value) {
  const expression = `(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (!el) return false
    el.value = ${JSON.stringify(value)}
    el.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  })()`
  const ok = await evaluate(client, expression)
  if (!ok) {
    throw new Error(`Select not found: ${selector}`)
  }
}

async function readUiCards(client) {
  return await evaluate(
    client,
    `(() => Array.from(document.querySelectorAll('.snapshot-card')).map((card) => ({
      name: card.querySelector('.preset-card-title-row strong')?.textContent?.trim() || '',
      meta: Array.from(card.querySelectorAll('.preset-card-meta')).map((node) => node.textContent?.trim() || ''),
      badges: Array.from(card.querySelectorAll('.mini-chip')).map((node) => node.textContent?.trim() || ''),
    })))()`,
  )
}

async function captureScreenshot(client, outPath) {
  const data = await client.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    fromSurface: true,
  })
  await fs.writeFile(outPath, Buffer.from(data.data, 'base64'))
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true })

  const apiResponse = await fetch(`${API_BASE}/workspaces/${WORKSPACE_ID}/snapshots`)
  if (!apiResponse.ok) {
    throw new Error(`Snapshot API failed: ${apiResponse.status}`)
  }
  const apiData = await apiResponse.json()
  const snapshots = apiData.items || []
  if (!snapshots.length) {
    throw new Error(
      'Snapshot sort visual smoke requires at least one existing snapshot. Seed snapshots first, for example with snapshot_sort_api_smoke.sh against the same backend.',
    )
  }
  const expectedDefaultAll = orderSavedSnapshots(snapshots, 'last_restored_at', 'desc').filter(
    (snapshot) => !snapshot.archived_at,
  )
  const expectedCapturedAsc = orderSavedSnapshots(snapshots, 'captured_at', 'asc').filter(
    (snapshot) => !snapshot.archived_at,
  )
  const expectedUpdatedAsc = orderSavedSnapshots(snapshots, 'updated_at', 'asc').filter(
    (snapshot) => !snapshot.archived_at,
  )
  const expectedRecent = getRecentSnapshots(expectedUpdatedAsc)

  const userDataDir = path.join(os.tmpdir(), `azvision-sort-visual-smoke-profile-${Date.now()}`)
  const chrome = spawn(
    CHROME_BIN,
    [
      '--headless=new',
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${userDataDir}`,
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-crash-restore-bubble',
      '--window-size=1600,1800',
      'about:blank',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  )

  let stdout = ''
  let stderr = ''
  chrome.stdout.on('data', (chunk) => {
    stdout += String(chunk)
  })
  chrome.stderr.on('data', (chunk) => {
    stderr += String(chunk)
  })

  try {
    await waitForHttp(`http://127.0.0.1:${CDP_PORT}/json/version`, 15000)
    const newTabResponse = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, {
      method: 'PUT',
    })
    const tabInfo = await newTabResponse.json()
    const ws = new WebSocket(tabInfo.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timed out opening CDP websocket')), 10000)
      ws.addEventListener('open', () => {
        clearTimeout(timeout)
        resolve()
      })
      ws.addEventListener('error', (error) => {
        clearTimeout(timeout)
        reject(error)
      })
    })

    const client = new CdpClient(ws)
    await client.send('Page.enable')
    await client.send('Runtime.enable')
    await client.send('Page.navigate', { url: APP_URL })
    await client.waitFor('Page.loadEventFired', () => true, 30000)
    await waitForExpression(client, `(() => document.querySelectorAll('.snapshot-card').length > 0)()`, 30000)
    await sleep(800)

    const defaultCards = await readUiCards(client)
    assertNameOrder('default all', defaultCards, expectedDefaultAll)
    await captureScreenshot(client, path.join(OUT_DIR, 'saved-default.png'))

    await setSelectValue(client, '.snapshot-sort-select', 'captured_at')
    await clickExpression(
      client,
      `(() => {
        const button = document.querySelector('.snapshot-sort-order-button')
        if (!button) return false
        button.click()
        return true
      })()`,
    )
    await sleep(400)
    const capturedAscCards = await readUiCards(client)
    assertNameOrder('captured asc', capturedAscCards, expectedCapturedAsc)
    await captureScreenshot(client, path.join(OUT_DIR, 'saved-captured-asc.png'))

    await setSelectValue(client, '.snapshot-sort-select', 'updated_at')
    await sleep(400)
    const updatedAscCards = await readUiCards(client)
    assertNameOrder('updated asc', updatedAscCards, expectedUpdatedAsc)
    await captureScreenshot(client, path.join(OUT_DIR, 'saved-updated-asc.png'))

    await clickExpression(
      client,
      `(() => {
        const tab = Array.from(document.querySelectorAll('[role="tab"]')).find((node) =>
          String(node.textContent || '').trim().startsWith('Recent'),
        )
        if (!tab) return false
        tab.click()
        return true
      })()`,
    )
    await sleep(400)
    const sortVisible = await evaluate(
      client,
      `(() => {
        const row = document.querySelector('.snapshot-sort-row')
        if (!row) return false
        const style = window.getComputedStyle(row)
        return style.display !== 'none' && style.visibility !== 'hidden'
      })()`,
    )
    if (sortVisible) {
      throw new Error('Recent tab should hide sort controls, but sort row is visible')
    }
    const recentCards = await readUiCards(client)
    assertNameOrder('recent tab', recentCards, expectedRecent)
    await captureScreenshot(client, path.join(OUT_DIR, 'recent.png'))

    const result = {
      ok: true,
      appUrl: APP_URL,
      apiBase: API_BASE,
      workspaceId: WORKSPACE_ID,
      outDir: OUT_DIR,
      counts: {
        totalSnapshots: snapshots.length,
        visibleAll: defaultCards.length,
        recent: recentCards.length,
      },
      defaultAll: nameList(defaultCards),
      capturedAsc: nameList(capturedAscCards),
      updatedAsc: nameList(updatedAscCards),
      recent: nameList(recentCards),
      screenshots: {
        savedDefault: path.join(OUT_DIR, 'saved-default.png'),
        savedCapturedAsc: path.join(OUT_DIR, 'saved-captured-asc.png'),
        savedUpdatedAsc: path.join(OUT_DIR, 'saved-updated-asc.png'),
        recent: path.join(OUT_DIR, 'recent.png'),
      },
    }

    await fs.writeFile(path.join(OUT_DIR, 'result.json'), JSON.stringify(result, null, 2) + '\n')
    console.log(JSON.stringify(result, null, 2))
    ws.close()
  } finally {
    chrome.kill('SIGTERM')
    await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {})
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exitCode = 1
})
