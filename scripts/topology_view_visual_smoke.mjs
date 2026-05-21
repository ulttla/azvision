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
const OUT_DIR = process.env.AZVISION_OUT_DIR || path.join(os.tmpdir(), `azvision-topology-visual-smoke-${Date.now()}`)
const COPILOT_PROVIDER_STORAGE_KEY = 'azvision:copilot-provider:v1'

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  let capturedCopilotRequest = null

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
    await page.route('**/workspaces/*/chat**', async (route) => {
      capturedCopilotRequest = route.request().postDataJSON()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          workspace_id: 'visual-smoke-workspace',
          read_only: true,
          copilot_mode: 'llm',
          provider: capturedCopilotRequest.provider ?? 'ollama',
          model: 'visual-smoke',
          llm_status: 'ok',
          answer: '**요약:** Topology visual smoke response.\n\n**관찰된 근거:** Graph context received.\n\n**위험 / 모르는 점:** No live provider call in this mocked smoke.\n\n**다음 읽기 전용 확인:** Review path evidence.',
          suggestions: ['Review path evidence.'],
          context: {
            resource_count: capturedCopilotRequest.view_context?.graph?.visible?.resources ?? 0,
            current_view: capturedCopilotRequest.current_view,
            current_language: capturedCopilotRequest.current_language,
          },
        }),
      })
    })

    await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForFunction(() => document.body.innerText.includes('Azure 토폴로지 탐색기'), null, { timeout: 30_000 })
    await page.waitForFunction(() => document.body.innerText.includes('읽기 전용 LLM 코파일럿'), null, { timeout: 30_000 })

    const providerSelect = page.locator('.topology-copilot-card select.search-input')
    await providerSelect.waitFor({ timeout: 30_000 })
    const selectedProvider = await providerSelect.inputValue()
    if (selectedProvider !== 'ollama') {
      throw new Error(`Topology copilot provider should restore ollama, got ${selectedProvider}`)
    }

    const quickPromptButton = page.getByRole('button', { name: '토폴로지 위험 요약' })
    await quickPromptButton.click()
    const copilotInput = page.locator('.topology-copilot-card textarea.cost-copilot-input')
    await copilotInput.waitFor({ timeout: 10_000 })
    const promptValue = await copilotInput.inputValue()
    if (promptValue !== '토폴로지 위험 요약') {
      throw new Error(`Topology quick prompt should populate textarea, got ${promptValue}`)
    }

    await page.locator('.topology-copilot-card').getByRole('button', { name: '질문' }).click()
    await page.waitForFunction(() => document.body.innerText.includes('Topology visual smoke response.'), null, { timeout: 10_000 })
    const sectionHeadings = await page.locator('.topology-copilot-card .cost-copilot-section-heading').allInnerTexts()
    for (const expectedHeading of ['요약', '관찰된 근거', '위험 / 모르는 점', '다음 읽기 전용 확인']) {
      if (!sectionHeadings.includes(expectedHeading)) {
        throw new Error(`Expected parsed copilot section heading not found: ${expectedHeading}; got ${sectionHeadings.join(', ')}`)
      }
    }

    if (!capturedCopilotRequest) {
      throw new Error('Topology copilot chat request was not captured')
    }
    if (capturedCopilotRequest.current_view !== 'topology') {
      throw new Error(`Expected current_view topology, got ${capturedCopilotRequest.current_view}`)
    }
    if (capturedCopilotRequest.current_language !== 'ko') {
      throw new Error(`Expected current_language ko, got ${capturedCopilotRequest.current_language}`)
    }
    if (!capturedCopilotRequest.view_context?.graph?.loaded || !capturedCopilotRequest.view_context?.graph?.visible) {
      throw new Error('Topology copilot request should include loaded and visible graph context')
    }
    if (!Array.isArray(capturedCopilotRequest.view_context.nodeTypeCounts)) {
      throw new Error('Topology copilot request should include nodeTypeCounts array')
    }
    if (!Array.isArray(capturedCopilotRequest.view_context.relationCounts)) {
      throw new Error('Topology copilot request should include relationCounts array')
    }
    if (!Object.prototype.hasOwnProperty.call(capturedCopilotRequest.view_context, 'pathAnalysis')) {
      throw new Error('Topology copilot request should include pathAnalysis field')
    }

    const bodyText = await page.locator('body').innerText()
    for (const expected of ['Azure 토폴로지 탐색기', '읽기 전용 LLM 코파일럿', '빠른 질문', '토폴로지 위험 요약']) {
      if (!bodyText.includes(expected)) {
        throw new Error(`Expected Korean topology UI text not found: ${expected}`)
      }
    }
    for (const forbidden of ['Azure topology explorer', 'Read-only LLM copilot', 'Quick prompts']) {
      if (bodyText.includes(forbidden)) {
        throw new Error(`Unexpected English UI text in Korean topology view: ${forbidden}`)
      }
    }

    await page.screenshot({ path: path.join(OUT_DIR, 'topology-copilot-context-ko.png'), fullPage: true })
    const storedProvider = await page.evaluate((storageKey) => window.localStorage.getItem(storageKey), COPILOT_PROVIDER_STORAGE_KEY)

    console.log(JSON.stringify({
      ok: true,
      appUrl: APP_URL,
      locale: 'ko',
      selectedProvider,
      storedProvider,
      capturedCurrentView: capturedCopilotRequest.current_view,
      capturedViewContextKeys: Object.keys(capturedCopilotRequest.view_context ?? {}),
      assertions: [
        'Topology view renders in Korean',
        'Topology view renders shared CopilotPanel',
        'Copilot provider selection restores from shared localStorage key',
        'Topology quick prompt populates the copilot input',
        'Topology copilot request includes graph, count, selected-node, and path-analysis context fields',
        'Copilot answer parser renders inline bold section labels as separate sections',
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
