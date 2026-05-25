#!/usr/bin/env node
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const APP_URL = process.env.AZVISION_APP_URL || process.env.AZVISION_UI_URL || 'http://127.0.0.1:5173'
const OUT_DIR = process.env.AZVISION_OUT_DIR || path.join(os.tmpdir(), `azvision-copilot-live-ui-smoke-${Date.now()}`)
const PROVIDER = process.env.AZVISION_COPILOT_PROVIDER || 'ollama'
const PROMPT = process.env.AZVISION_COPILOT_PROMPT || '현재 토폴로지 기준으로 다음 읽기 전용 확인 2가지만 요약해줘.'
const ENABLED = process.env.AZVISION_LIVE_COPILOT_SMOKE === '1'
const COPILOT_PROVIDER_STORAGE_KEY = 'azvision:copilot-provider:v1'

if (!ENABLED) {
  console.log(JSON.stringify({
    ok: true,
    skipped: true,
    reason: 'Set AZVISION_LIVE_COPILOT_SMOKE=1 to run the opt-in live Copilot UI smoke.',
    appUrl: APP_URL,
    provider: PROVIDER,
  }, null, 2))
  process.exit(0)
}

const require = createRequire(import.meta.url)

function loadPlaywright() {
  const candidates = [
    'playwright',
    '/opt/homebrew/lib/node_modules/playwright',
    '/usr/local/lib/node_modules/playwright',
  ]
  for (const candidate of candidates) {
    try {
      return require(candidate)
    } catch {
      // Try next candidate.
    }
  }
  throw new Error('Playwright is required. Install it locally or make a global playwright package available.')
}

const { chromium } = loadPlaywright()

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({
      locale: 'ko-KR',
      viewport: { width: 1440, height: 1200 },
      deviceScaleFactor: 1,
    })
    await context.addInitScript(([storageKey, provider]) => {
      window.localStorage.setItem('azvision-lang', 'ko')
      window.localStorage.setItem(storageKey, provider)
    }, [COPILOT_PROVIDER_STORAGE_KEY, PROVIDER])

    const page = await context.newPage()
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForFunction(() => document.body.innerText.includes('읽기 전용 LLM 코파일럿'), null, { timeout: 30_000 })

    const copilotCard = page.locator('.topology-copilot-card')
    await copilotCard.waitFor({ timeout: 30_000 })
    const providerSelect = copilotCard.locator('select.search-input')
    const restoredProvider = await providerSelect.inputValue()
    if (restoredProvider !== PROVIDER) {
      throw new Error(`Expected shared provider storage to restore ${PROVIDER}, got ${restoredProvider}`)
    }
    await providerSelect.selectOption(PROVIDER)
    await copilotCard.locator('textarea.cost-copilot-input').fill(PROMPT)
    await copilotCard.getByRole('button', { name: '질문' }).click()

    await page.waitForFunction(() => {
      const answer = document.querySelector('.topology-copilot-card .cost-copilot-answer')
      return Boolean(answer && answer.textContent && answer.textContent.trim().length > 30)
    }, null, { timeout: Number(process.env.AZVISION_LIVE_COPILOT_TIMEOUT_MS || 90_000) })

    const answerText = await page.locator('.topology-copilot-card .cost-copilot-answer').innerText()
    const providerText = await copilotCard.locator('.cost-copilot-answer .mini-chip').first().innerText()
    for (const forbidden of ['API_KEY', 'OPENROUTER_API_KEY', 'AZVISION_OPENROUTER_API_KEY', 'OLLAMA_BASE_URL=', 'Bearer ']) {
      if (answerText.includes(forbidden)) {
        throw new Error(`Live Copilot answer appears to expose a sensitive token/config marker: ${forbidden}`)
      }
    }

    await page.screenshot({ path: path.join(OUT_DIR, 'copilot-live-ui-ko.png'), fullPage: true })
    console.log(JSON.stringify({
      ok: true,
      skipped: false,
      appUrl: APP_URL,
      provider: PROVIDER,
      promptLength: PROMPT.length,
      answerLength: answerText.length,
      providerText,
      assertions: [
        'Korean Topology Copilot UI rendered',
        'Configured provider selected from shared Copilot provider storage',
        'Live Copilot answer rendered through the UI without mocked chat route',
        'Answer text did not include obvious secret/config markers',
      ],
      outputDir: OUT_DIR,
    }, null, 2))
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error.stack || String(error))
  process.exit(1)
})
