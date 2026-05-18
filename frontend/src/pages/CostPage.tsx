import { useEffect, useMemo, useState } from 'react'

import { useI18n } from '../i18n/context'
import {
  ApiError,
  getCostRecommendations,
  getCostReport,
  getCostResources,
  getCostSummary,
  getCopilotProviders,
  postCopilotMessage,
  type CopilotProviderOption,
  type CopilotProviderStatus,
  type CopilotResponse,
  type CostRecommendation,
  type CostResourceRow,
  type CostSummary,
} from '../lib/api'

const DEFAULT_WORKSPACE_ID = import.meta.env.VITE_DEFAULT_WORKSPACE_ID ?? 'local-demo'

type CopilotSection = { heading: string; body: string[]; isSuggestions?: boolean }

/**
 * Parse a copilot answer into structured sections.
 * Detects common heading patterns: `## Heading`, `**Heading:**`, `Heading:`, `1.` numbered items.
 * Falls back to a single-section rendering when no markers found.
 */
function parseCopilotAnswerSections(answer: string, fallbackHeading = 'Answer'): CopilotSection[] {
  const lines = answer.split('\n').map((l) => l.trimEnd())
  const sections: CopilotSection[] = []
  let current: CopilotSection | null = null

  const headingPatterns: Array<{ regex: RegExp; extract: (m: RegExpMatchArray) => string }> = [
    { regex: /^##\s+(.+?)(?:#+)?$/, extract: (m) => m[1].trim() },
    { regex: /^\*\*(.+?)\*\*\s*:?\s*$/, extract: (m) => m[1].trim() },
    { regex: /^([A-Z][A-Za-z\s]{2,40}):\s*$/, extract: (m) => m[1].trim() },
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
      // blank line — flush a section only if we already have content
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
    // No sections parsed — return the whole answer as one section
    return [{ heading: fallbackHeading, body: lines.filter((l) => l.length > 0) }]
  }

  return sections
}

function formatCountMap(value: Record<string, number>, emptyLabel: string) {
  const entries = Object.entries(value)
  if (!entries.length) {
    return emptyLabel
  }
  return entries.map(([key, count]) => `${key}: ${count}`).join(' • ')
}

function formatCostStatus(summary: CostSummary | null, loadingLabel: string, noAmountLabel: string) {
  if (!summary) {
    return loadingLabel
  }
  if (summary.estimated_monthly_cost == null) {
    return noAmountLabel
  }
  return `${summary.currency ?? ''} ${summary.estimated_monthly_cost}`.trim()
}

function severityRank(value: string) {
  if (value === 'high') return 0
  if (value === 'medium') return 1
  if (value === 'low') return 2
  return 3
}

export function CostPage() {
  const { locale, t } = useI18n()
  const [workspaceId, setWorkspaceId] = useState<string>(DEFAULT_WORKSPACE_ID)
  const [summary, setSummary] = useState<CostSummary | null>(null)
  const [resources, setResources] = useState<CostResourceRow[]>([])
  const [recommendations, setRecommendations] = useState<CostRecommendation[]>([])
  const [mode, setMode] = useState('')
  const [warning, setWarning] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [subscriptionId, setSubscriptionId] = useState('')
  const [resourceGroupName, setResourceGroupName] = useState('')
  const [resourceGroupLimit, setResourceGroupLimit] = useState(200)
  const [resourceLimit, setResourceLimit] = useState(500)
  const [copilotPrompt, setCopilotPrompt] = useState(() => t('copilot.defaultPrompt'))
  const [copilotProvider, setCopilotProvider] = useState<CopilotProviderOption>('rule-based')
  const [copilotProviders, setCopilotProviders] = useState<CopilotProviderStatus[]>([])
  const [copilotResponse, setCopilotResponse] = useState<CopilotResponse | null>(null)
  const [copilotLoading, setCopilotLoading] = useState(false)
  const [reportLoading, setReportLoading] = useState(false)

  const costQueryOptions = useMemo(
    () => ({
      subscriptionId: subscriptionId.trim() || undefined,
      resourceGroupName: resourceGroupName.trim() || undefined,
      resourceGroupLimit,
      resourceLimit,
    }),
    [resourceGroupLimit, resourceGroupName, resourceLimit, subscriptionId],
  )

  useEffect(() => {
    let cancelled = false

    async function loadCostInsights() {
      setLoading(true)
      setError('')
      try {
        const [summaryResult, resourceResult, recommendationResult] = await Promise.all([
          getCostSummary(workspaceId, costQueryOptions),
          getCostResources(workspaceId, costQueryOptions),
          getCostRecommendations(workspaceId, costQueryOptions),
        ])
        if (cancelled) return

        setSummary(summaryResult.summary)
        setResources(resourceResult.items)
        setRecommendations(recommendationResult.items)
        setMode(summaryResult.mode ?? recommendationResult.mode ?? resourceResult.mode ?? '')
        setWarning(summaryResult.warning ?? recommendationResult.warning ?? resourceResult.warning ?? '')
      } catch (err) {
        if (cancelled) return
        setSummary(null)
        setResources([])
        setRecommendations([])
        setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Failed to load cost insights')
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadCostInsights()
    return () => {
      cancelled = true
    }
  }, [costQueryOptions, refreshKey, workspaceId])

  const sortedRecommendations = useMemo(
    () => [...recommendations].sort((left, right) => severityRank(left.severity) - severityRank(right.severity)),
    [recommendations],
  )
  const topResources = useMemo(
    () => [...resources].sort((left, right) => right.recommendation_count - left.recommendation_count).slice(0, 8),
    [resources],
  )
  const selectedProviderStatus = copilotProviders.find((provider) => provider.id === copilotProvider)

  useEffect(() => {
    let cancelled = false

    async function loadCopilotProviders() {
      try {
        const result = await getCopilotProviders()
        if (!cancelled) {
          setCopilotProviders(result.providers)
        }
      } catch {
        if (!cancelled) {
          setCopilotProviders([])
        }
      }
    }

    loadCopilotProviders()
    return () => {
      cancelled = true
    }
  }, [])

  async function askCopilot() {
    if (!copilotPrompt.trim()) {
      return
    }
    setCopilotLoading(true)
    setError('')
    try {
      setCopilotResponse(await postCopilotMessage(workspaceId, copilotPrompt.trim(), costQueryOptions, copilotProvider, 'cost-insights', locale))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Failed to ask copilot')
    } finally {
      setCopilotLoading(false)
    }
  }

  async function downloadCostReport() {
    setReportLoading(true)
    setError('')
    try {
      const report = await getCostReport(workspaceId, costQueryOptions)
      const blob = new Blob([report.content], { type: 'text/markdown;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${workspaceId || DEFAULT_WORKSPACE_ID}-cost-summary.md`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Failed to download cost report')
    } finally {
      setReportLoading(false)
    }
  }

  return (
    <main className="page-shell cost-page-shell">
      <section className="panel-card hero-card">
        <p className="eyebrow">{t('cost.eyebrow')}</p>
        <h2>{t('cost.title')}</h2>
        <p className="subtext">
          {t('cost.subtext')}
        </p>
        <div className="control-row cost-control-row">
          <label className="field-label">
            {t('cost.workspace')}
            <input
              className="search-input"
              value={workspaceId}
              onChange={(event) => setWorkspaceId(event.target.value)}
              onBlur={() => setWorkspaceId((current) => current.trim() || DEFAULT_WORKSPACE_ID)}
            />
          </label>
          <label className="field-label">
            {t('cost.subscriptionFilter')}
            <input
              className="search-input"
              value={subscriptionId}
              placeholder={t('cost.subscriptionPlaceholder')}
              onChange={(event) => setSubscriptionId(event.target.value)}
            />
          </label>
          <label className="field-label">
            {t('cost.resourceGroupFilter')}
            <input
              className="search-input"
              value={resourceGroupName}
              placeholder={t('cost.resourceGroupPlaceholder')}
              onChange={(event) => setResourceGroupName(event.target.value)}
            />
          </label>
          <label className="field-label">
            {t('cost.resourceGroupLimit')}
            <input
              className="search-input"
              type="number"
              min={1}
              max={1000}
              value={resourceGroupLimit}
              onChange={(event) => setResourceGroupLimit(Math.min(1000, Math.max(1, Number(event.target.value) || 1)))}
            />
          </label>
          <label className="field-label">
            {t('cost.resourceLimit')}
            <input
              className="search-input"
              type="number"
              min={1}
              max={5000}
              value={resourceLimit}
              onChange={(event) => setResourceLimit(Math.min(5000, Math.max(1, Number(event.target.value) || 1)))}
            />
          </label>
          <button type="button" className="toolbar-button primary" onClick={() => setRefreshKey((value) => value + 1)}>
            {loading ? t('cost.refreshingInsights') : t('cost.refreshInsights')}
          </button>
          <button type="button" className="toolbar-button" onClick={downloadCostReport} disabled={reportLoading}>
            {reportLoading ? t('cost.preparingReport') : t('cost.downloadReport')}
          </button>
        </div>
        {mode ? <p className="hint">{t('cost.inventoryMode')}: {mode}</p> : null}
        {summary ? <p className="hint">{t('cost.costIngestion')}: {summary.cost_ingestion_provider} • {t('cost.configured')}: {summary.cost_ingestion_configured ? t('common.yes') : t('common.no')}</p> : null}
        {warning ? <p className="warning-text">{warning}</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
      </section>

      <section className="summary-grid">
        <article className="metric-card">
          <span className="metric-label">{t('cost.label.costStatus')}</span>
          <strong>{formatCostStatus(summary, t('cost.loading'), t('cost.noAmountYet'))}</strong>
        </article>
        <article className="metric-card">
          <span className="metric-label">{t('cost.label.resourcesAnalyzed')}</span>
          <strong>{summary?.analyzed_resource_count ?? '-'}</strong>
        </article>
        <article className="metric-card">
          <span className="metric-label">{t('cost.label.recommendations')}</span>
          <strong>{summary?.recommendation_count ?? '-'}</strong>
        </article>
        <article className="metric-card">
          <span className="metric-label">{t('cost.label.severityMix')}</span>
          <strong>{summary ? formatCountMap(summary.severity_counts, t('cost.none')) : '-'}</strong>
        </article>
        <article className="metric-card">
          <span className="metric-label">{t('cost.label.costDrivers')}</span>
          <strong>{summary ? formatCountMap(summary.cost_driver_counts, t('cost.none')) : '-'}</strong>
        </article>
        <article className="metric-card">
          <span className="metric-label">{t('cost.label.tagGaps')}</span>
          <strong>{summary?.governance_gap_count ?? '-'}</strong>
        </article>
      </section>

      <section className="panel-card cost-copilot-card">
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
              onChange={(event) => setCopilotProvider(event.target.value as CopilotProviderOption)}
            >
              {(copilotProviders.length
                ? copilotProviders
                : [
                    { id: 'rule-based' as const, label: t('copilot.provider.ruleBased'), configured: true, status: 'available', model: null },
                    { id: 'ollama' as const, label: t('copilot.provider.ollama'), configured: false, status: 'missing_config', model: null },
                    { id: 'openrouter' as const, label: t('copilot.provider.openrouter'), configured: false, status: 'missing_config', model: null },
                  ]
              ).map((provider) => (
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
          <button type="button" className="toolbar-button primary" onClick={askCopilot} disabled={copilotLoading}>
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

      <section className="panel-grid cost-panel-grid">
        <article className="panel-card">
          <h3>{t('cost.topRecommendations')}</h3>
          <div className="cost-recommendation-list">
            {sortedRecommendations.slice(0, 12).map((item) => (
              <div key={`${item.rule_id}-${item.resource_id}`} className="cost-recommendation-card">
                <div className="cost-recommendation-heading">
                  <strong>{item.title}</strong>
                  <span className={`mini-chip severity-${item.severity}`}>{item.severity}</span>
                </div>
                <p>{item.recommendation}</p>
                <p className="hint">
                  {item.resource_name} • {item.resource_type} • {t('cost.confidence')} {Math.round(item.confidence * 100)}%
                </p>
                {item.evidence.length ? <p className="hint">{t('cost.evidence')}: {item.evidence.join(' • ')}</p> : null}
              </div>
            ))}
            {!sortedRecommendations.length && !loading ? <p className="hint">{t('cost.noRecommendations')}</p> : null}
          </div>
        </article>

        <article className="panel-card">
          <h3>{t('cost.resourcesMostPrompts')}</h3>
          <div className="cost-resource-list">
            {topResources.map((resource) => (
              <div key={resource.resource_id} className="cost-resource-row">
                <div>
                  <strong>{resource.resource_name}</strong>
                  <p className="hint">{resource.resource_type}</p>
                  {resource.cost_driver_labels.length ? <p className="hint">{t('cost.drivers')}: {resource.cost_driver_labels.join(' • ')}</p> : null}
                </div>
                <span className="mini-chip">{resource.recommendation_count} {t('cost.prompts')}</span>
              </div>
            ))}
          </div>
          {summary?.notes?.length ? (
            <div className="cost-note-box">
              {summary.notes.map((note) => (
                <p key={note}>{note}</p>
              ))}
            </div>
          ) : null}
        </article>
      </section>
    </main>
  )
}
