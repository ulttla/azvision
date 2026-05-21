import { useEffect, useState } from 'react'

import { useI18n } from '../i18n/context'
import {
  ApiError,
  getCopilotProviders,
  postCopilotMessage,
  type CopilotProviderOption,
  type CopilotProviderStatus,
  type CopilotResponse,
  type CostQueryOptions,
} from '../lib/api'

const COPILOT_PROVIDER_STORAGE_KEY = 'azvision:copilot-provider:v1'
const LEGACY_COST_COPILOT_PROVIDER_STORAGE_KEY = 'azvision:cost-copilot-provider:v1'
const COPILOT_PROVIDER_OPTIONS = ['ollama', 'openrouter', 'rule-based'] as const satisfies readonly CopilotProviderOption[]

type CopilotSection = { heading: string; body: string[]; isSuggestions?: boolean }

type InitialCopilotProvider = {
  provider: CopilotProviderOption
  fromStorage: boolean
}

type CopilotPanelProps = {
  workspaceId: string
  queryOptions?: CostQueryOptions
  currentView: string
  className?: string
  onError?: (message: string) => void
}

/**
 * Parse a copilot answer into structured sections.
 * Detects common heading patterns: `## Heading`, `**Heading:**`, `Heading:`, and Korean/English labels.
 * Falls back to a single-section rendering when no markers are found.
 */
function parseCopilotAnswerSections(answer: string, fallbackHeading = 'Answer'): CopilotSection[] {
  const lines = answer.split('\n').map((line) => line.trimEnd())
  const sections: CopilotSection[] = []
  let current: CopilotSection | null = null

  const headingPatterns: Array<{ regex: RegExp; extract: (match: RegExpMatchArray) => string }> = [
    { regex: /^##\s+(.+?)(?:#+)?$/, extract: (match) => match[1].trim() },
    { regex: /^\*\*(.+?)\*\*\s*:?\s*$/, extract: (match) => match[1].trim() },
    { regex: /^([A-Za-z가-힣][A-Za-z가-힣\s/·-]{1,40}):\s*$/u, extract: (match) => match[1].trim() },
  ]

  function finalizeSection() {
    if (current && current.body.length > 0) {
      sections.push(current)
    }
    current = null
  }

  for (const line of lines) {
    let matched = false
    for (const { regex, extract } of headingPatterns) {
      const match = line.match(regex)
      if (match) {
        finalizeSection()
        current = { heading: extract(match), body: [] }
        matched = true
        break
      }
    }
    if (matched) continue

    if (line.length === 0) {
      if (current && current.body.length > 0) {
        current.body.push('')
      }
      continue
    }

    if (!current) {
      current = { heading: fallbackHeading, body: [] }
    }
    current.body.push(line)
  }
  finalizeSection()

  if (sections.length === 0) {
    return [{ heading: fallbackHeading, body: lines.filter((line) => line.length > 0) }]
  }

  return sections
}

function normalizeCopilotProvider(value: unknown): CopilotProviderOption {
  return COPILOT_PROVIDER_OPTIONS.includes(value as CopilotProviderOption)
    ? (value as CopilotProviderOption)
    : 'rule-based'
}

function readInitialCopilotProvider(): InitialCopilotProvider {
  try {
    const stored = localStorage.getItem(COPILOT_PROVIDER_STORAGE_KEY) ?? localStorage.getItem(LEGACY_COST_COPILOT_PROVIDER_STORAGE_KEY)
    if (stored) {
      return { provider: normalizeCopilotProvider(stored), fromStorage: true }
    }
  } catch {
    // ignore storage failures and fall back to provider status response
  }

  return { provider: 'rule-based', fromStorage: false }
}

function persistCopilotProvider(provider: CopilotProviderOption) {
  try {
    localStorage.setItem(COPILOT_PROVIDER_STORAGE_KEY, provider)
  } catch {
    // ignore storage failures; provider still updates for this session
  }
}

export function CopilotPanel({ workspaceId, queryOptions, currentView, className = '', onError }: CopilotPanelProps) {
  const { locale, t } = useI18n()
  const [copilotPrompt, setCopilotPrompt] = useState(() => t('copilot.defaultPrompt'))
  const [initialCopilotProvider] = useState<InitialCopilotProvider>(() => readInitialCopilotProvider())
  const [copilotProvider, setCopilotProviderState] = useState<CopilotProviderOption>(initialCopilotProvider.provider)
  const [copilotProviders, setCopilotProviders] = useState<CopilotProviderStatus[]>([])
  const [copilotResponse, setCopilotResponse] = useState<CopilotResponse | null>(null)
  const [copilotLoading, setCopilotLoading] = useState(false)

  const selectedProviderStatus = copilotProviders.find((provider) => provider.id === copilotProvider)

  function setCopilotProvider(provider: CopilotProviderOption) {
    setCopilotProviderState(provider)
    persistCopilotProvider(provider)
  }

  useEffect(() => {
    let cancelled = false

    async function loadCopilotProviders() {
      try {
        const result = await getCopilotProviders()
        if (!cancelled) {
          setCopilotProviders(result.providers)
          setCopilotProviderState((current) => {
            const providerIds = new Set(result.providers.map((provider) => provider.id))
            if (providerIds.has(current) && (initialCopilotProvider.fromStorage || current !== 'rule-based')) {
              return current
            }
            const defaultProvider = normalizeCopilotProvider(result.default_provider)
            return providerIds.has(defaultProvider) ? defaultProvider : 'rule-based'
          })
        }
      } catch {
        if (!cancelled) {
          setCopilotProviders([])
        }
      }
    }

    void loadCopilotProviders()
    return () => {
      cancelled = true
    }
  }, [initialCopilotProvider.fromStorage])

  async function askCopilot() {
    if (!copilotPrompt.trim() || !workspaceId.trim()) {
      return
    }
    setCopilotLoading(true)
    onError?.('')
    try {
      setCopilotResponse(await postCopilotMessage(workspaceId, copilotPrompt.trim(), queryOptions, copilotProvider, currentView, locale))
    } catch (err) {
      onError?.(err instanceof ApiError ? err.message : err instanceof Error ? err.message : t('cost.error.askCopilot'))
    } finally {
      setCopilotLoading(false)
    }
  }

  const providerOptions = copilotProviders.length
    ? copilotProviders
    : [
        { id: 'rule-based' as const, label: t('copilot.provider.ruleBased'), configured: true, status: 'available', model: null },
        { id: 'ollama' as const, label: t('copilot.provider.ollama'), configured: false, status: 'missing_config', model: null },
        { id: 'openrouter' as const, label: t('copilot.provider.openrouter'), configured: false, status: 'missing_config', model: null },
      ]

  return (
    <section className={`panel-card cost-copilot-card ${className}`.trim()}>
      <div className="cost-recommendation-heading">
        <h3>{t('copilot.heading')}</h3>
        <span className="mini-chip">{t('copilot.readOnly')}</span>
      </div>
      <p className="hint">{t('copilot.description')}</p>
      <div className="control-row">
        <label className="field-label">
          {t('copilot.provider')}
          <select
            className="search-input"
            value={copilotProvider}
            onChange={(event) => setCopilotProvider(normalizeCopilotProvider(event.target.value))}
          >
            {providerOptions.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.label}{provider.configured ? '' : ` — ${t('copilot.notConfigured')}`}
              </option>
            ))}
          </select>
        </label>
        <span className="mini-chip">{t('copilot.attachContext')}</span>
        {selectedProviderStatus && !selectedProviderStatus.configured ? (
          <span className="mini-chip severity-medium">{selectedProviderStatus.label} {t('copilot.fallbackNote')}</span>
        ) : null}
      </div>
      <div className="cost-copilot-input-row">
        <textarea
          className="search-input cost-copilot-input"
          value={copilotPrompt}
          onChange={(event) => setCopilotPrompt(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault()
              void askCopilot()
            }
          }}
          rows={3}
        />
        <button type="button" className="toolbar-button primary" onClick={askCopilot} disabled={copilotLoading || !workspaceId.trim()}>
          {copilotLoading ? t('copilot.thinking') : t('copilot.ask')}
        </button>
      </div>
      {copilotResponse ? (
        <div className="cost-copilot-answer">
          <div className="cost-recommendation-heading">
            <strong>{copilotResponse.copilot_mode} {t('copilot.answer')}</strong>
            <span className="mini-chip">
              {t('copilot.providerLabel')}: {copilotResponse.provider ?? copilotResponse.copilot_mode} • {t('copilot.llmStatus')}: {copilotResponse.llm_status}
              {copilotResponse.model ? ` • ${t('copilot.model')}: ${copilotResponse.model}` : ''} • {t('copilot.readOnly')}: {copilotResponse.read_only === false ? t('common.no') : t('common.yes')}
            </span>
          </div>
          {(() => {
            const sections = parseCopilotAnswerSections(copilotResponse.answer, t('copilot.answer'))
            const hasSuggestions = copilotResponse.suggestions.length > 0
            return (
              <>
                {sections.map((section, index) => (
                  <div key={`${index}-${section.heading}`} className="cost-copilot-section">
                    <strong className="cost-copilot-section-heading">{section.heading}</strong>
                    {section.body.map((line, lineIndex) => (
                      <p key={lineIndex}>{line || '\u00A0'}</p>
                    ))}
                  </div>
                ))}
                {hasSuggestions ? (
                  <div className="cost-copilot-section">
                    <strong className="cost-copilot-section-heading">{t('copilot.suggestedChecks')}</strong>
                    <ul>
                      {copilotResponse.suggestions.map((suggestion) => (
                        <li key={suggestion}>{suggestion}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            )
          })()}
        </div>
      ) : null}
    </section>
  )
}
