#!/usr/bin/env node
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

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

const APP_URL = process.env.AZVISION_APP_URL || process.env.AZVISION_UI_URL || 'http://127.0.0.1:5173'
const OUT_DIR = process.env.AZVISION_OUT_DIR || path.join(os.tmpdir(), `azvision-simulation-visual-smoke-${Date.now()}`)
const COPILOT_PROVIDER_STORAGE_KEY = 'azvision:copilot-provider:v1'

async function selectSimulationView(page) {
  const simulationTab = page.getByRole('tab', { name: /시뮬레이션|Simulation/i })
  await simulationTab.click()
  await page.waitForFunction(() => document.body.innerText.includes('규칙 기반 리소스 계획 1차 패스'), null, { timeout: 30_000 })
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({
      locale: 'ko-KR',
      viewport: { width: 1440, height: 1200 },
      deviceScaleFactor: 1,
    })
    await context.addInitScript(() => {
      window.localStorage.setItem('azvision-lang', 'ko')
      window.localStorage.setItem('azvision:copilot-provider:v1', 'ollama')
    })

    const page = await context.newPage()
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await selectSimulationView(page)

    await page.waitForFunction(() => document.body.innerText.includes('읽기 전용 LLM 코파일럿'), null, { timeout: 30_000 })
    await page.waitForFunction(() => document.body.innerText.includes('추천 리소스'), null, { timeout: 30_000 })

    const providerSelect = page.locator('.simulation-copilot-card select.search-input')
    await providerSelect.waitFor({ timeout: 30_000 })
    const selectedProvider = await providerSelect.inputValue()
    if (selectedProvider !== 'ollama') {
      throw new Error(`Simulation copilot provider should restore ollama, got ${selectedProvider}`)
    }

    const bodyText = await page.locator('body').innerText()
    for (const expected of ['시뮬레이션', '프로젝트 설명', '읽기 전용 LLM 코파일럿', '생성된 계획', '추천 리소스']) {
      if (!bodyText.includes(expected)) {
        throw new Error(`Expected Korean simulation UI text not found: ${expected}`)
      }
    }
    for (const forbidden of ['Rule-based resource planning first pass', 'Project description', 'Read-only LLM copilot']) {
      if (bodyText.includes(forbidden)) {
        throw new Error(`Unexpected English UI text in Korean simulation view: ${forbidden}`)
      }
    }

    await page.screenshot({ path: path.join(OUT_DIR, 'simulation-copilot-ko.png'), fullPage: true })
    const storedProvider = await page.evaluate((storageKey) => window.localStorage.getItem(storageKey), COPILOT_PROVIDER_STORAGE_KEY)

    console.log(JSON.stringify({
      ok: true,
      appUrl: APP_URL,
      locale: 'ko',
      selectedProvider,
      storedProvider,
      assertions: [
        'Simulation tab renders in Korean',
        'Simulation view renders shared CopilotPanel',
        'Copilot provider selection restores from shared localStorage key',
        'Korean UI has no fallback English hero/copilot labels',
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
