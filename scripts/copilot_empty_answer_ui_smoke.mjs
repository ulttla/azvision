#!/usr/bin/env node
import { createRequire } from 'node:module'

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
const COPILOT_PROVIDER_STORAGE_KEY = 'azvision:copilot-provider:v1'

async function main() {
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({
      locale: 'ko-KR',
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 1,
    })
    await context.addInitScript((storageKey) => {
      window.localStorage.setItem('azvision-lang', 'ko')
      window.localStorage.setItem(storageKey, 'ollama')
    }, COPILOT_PROVIDER_STORAGE_KEY)

    const page = await context.newPage()
    let capturedCopilotRequest = null
    await page.route('**/workspaces/*/chat**', async (route) => {
      capturedCopilotRequest = route.request().postDataJSON()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          workspace_id: 'empty-answer-smoke',
          read_only: true,
          copilot_mode: 'llm',
          provider: capturedCopilotRequest?.provider ?? 'ollama',
          model: 'empty-answer-smoke',
          llm_status: 'ok',
          answer: '   ',
          suggestions: [],
          context: {},
        }),
      })
    })

    await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 20_000 })
    await page.getByRole('tab', { name: /비용 인사이트|Cost Insights/i }).click()
    await page.waitForFunction(() => document.body.innerText.includes('읽기 전용 LLM 코파일럿'), null, { timeout: 20_000 })

    const copilotCard = page.locator('.cost-copilot-card').first()
    await copilotCard.waitFor({ timeout: 15_000 })
    await page.waitForFunction(() => {
      const buttons = Array.from(document.querySelectorAll('.cost-copilot-card button'))
      return buttons.some((button) => button.textContent?.includes('질문') && !button.disabled)
    }, null, { timeout: 15_000 })

    await copilotCard.locator('textarea.cost-copilot-input').fill('빈 응답 처리 확인')
    await copilotCard.getByRole('button', { name: '질문' }).click()
    await page.waitForFunction(() => document.body.innerText.includes('응답 본문이 반환되지 않았습니다'), null, { timeout: 15_000 })

    if (!capturedCopilotRequest) {
      throw new Error('Copilot request was not captured')
    }
    if (capturedCopilotRequest.current_view !== 'cost-insights') {
      throw new Error(`Expected current_view cost-insights, got ${capturedCopilotRequest.current_view}`)
    }
    if (capturedCopilotRequest.current_language !== 'ko') {
      throw new Error(`Expected current_language ko, got ${capturedCopilotRequest.current_language}`)
    }
    if (capturedCopilotRequest.view_context?.filters?.subscriptionId) {
      throw new Error('Cost copilot view_context should not include raw subscriptionId')
    }
    if (capturedCopilotRequest.view_context?.filters?.resourceGroupName) {
      throw new Error('Cost copilot view_context should not include raw resourceGroupName')
    }

    console.log(JSON.stringify({
      ok: true,
      appUrl: APP_URL,
      currentView: capturedCopilotRequest.current_view,
      currentLanguage: capturedCopilotRequest.current_language,
      provider: capturedCopilotRequest.provider,
      assertions: [
        'Cost Copilot request keeps current_view/current_language contract',
        'Empty LLM answer renders localized fallback copy',
        'Cost Copilot view_context omits raw subscription/resource-group filter values',
      ],
    }, null, 2))
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error.stack || String(error))
  process.exit(1)
})
