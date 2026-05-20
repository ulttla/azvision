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
const OUT_DIR = process.env.AZVISION_OUT_DIR || path.join(os.tmpdir(), `azvision-architecture-visual-smoke-${Date.now()}`)
const STORAGE_KEY = 'azvision:architecture-overrides:v1'

async function selectArchitectureView(page) {
  const architectureTab = page.getByRole('tab', { name: /아키텍처 뷰|Architecture View/i })
  await architectureTab.click()
  await page.waitForSelector('[data-testid="arch-detail-density-select"]', { timeout: 30_000 })
}

async function readPresentationDensity(page) {
  return page.evaluate((storageKey) => {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return null
    const states = JSON.parse(raw)
    const values = Object.values(states || {})
    return values.map((state) => state?.presentation?.detailDensity).filter(Boolean)
  }, STORAGE_KEY)
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
    })

    const page = await context.newPage()
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await selectArchitectureView(page)
    await page.waitForFunction(() => document.body.innerText.includes('컴팩트 아키텍처 파이프라인 모드'), null, { timeout: 30_000 })

    const densitySelect = page.locator('[data-testid="arch-detail-density-select"]')
    await densitySelect.selectOption('expanded')
    await page.waitForFunction(
      (storageKey) => {
        const raw = window.localStorage.getItem(storageKey)
        if (!raw) return false
        const states = JSON.parse(raw)
        return Object.values(states || {}).some((state) => state?.presentation?.detailDensity === 'expanded')
      },
      STORAGE_KEY,
      { timeout: 10_000 },
    )

    await page.screenshot({ path: path.join(OUT_DIR, 'architecture-expanded-ko.png'), fullPage: true })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await selectArchitectureView(page)
    await page.waitForFunction(() => document.body.innerText.includes('세부 밀도'), null, { timeout: 30_000 })
    await page.waitForFunction(
      () => document.querySelector('[data-testid="arch-detail-density-select"]')?.value === 'expanded',
      null,
      { timeout: 10_000 },
    )
    const restoredDensity = await densitySelect.inputValue()

    const bodyText = await page.locator('body').innerText()
    for (const forbidden of ['2 resources', '3 resources', '4 resources', 'unknown type']) {
      if (bodyText.includes(forbidden)) {
        throw new Error(`Unexpected hardcoded English UI text in Korean architecture view: ${forbidden}`)
      }
    }

    const presentationDensities = await readPresentationDensity(page)
    await page.screenshot({ path: path.join(OUT_DIR, 'architecture-expanded-ko-reloaded.png'), fullPage: true })

    console.log(JSON.stringify({
      ok: true,
      appUrl: APP_URL,
      locale: 'ko',
      restoredDensity,
      presentationDensities,
      assertions: [
        'Architecture tab renders in Korean',
        'detail density selector persists expanded state through localStorage after reload',
        'Korean UI has no hardcoded 2/3/4 resources or unknown type fallbacks',
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
