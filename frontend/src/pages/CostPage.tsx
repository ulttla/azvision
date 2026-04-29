import { useEffect, useMemo, useState } from 'react'

import {
  ApiError,
  getCostRecommendations,
  getCostReport,
  getCostResources,
  getCostSummary,
  postCopilotMessage,
  type CopilotResponse,
  type CostRecommendation,
  type CostResourceRow,
  type CostSummary,
} from '../lib/api'

const DEFAULT_WORKSPACE_ID = import.meta.env.VITE_DEFAULT_WORKSPACE_ID ?? 'local-demo'

function formatCountMap(value: Record<string, number>) {
  const entries = Object.entries(value)
  if (!entries.length) {
    return 'none'
  }
  return entries.map(([key, count]) => `${key}: ${count}`).join(' • ')
}

function formatCostStatus(summary?: CostSummary | null) {
  if (!summary) {
    return 'loading'
  }
  if (summary.estimated_monthly_cost == null) {
    return 'No dollar amount yet — rule-based analysis only'
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
  const [copilotPrompt, setCopilotPrompt] = useState('How can I reduce cost or improve this architecture?')
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

  async function askCopilot() {
    if (!copilotPrompt.trim()) {
      return
    }
    setCopilotLoading(true)
    setError('')
    try {
      setCopilotResponse(await postCopilotMessage(workspaceId, copilotPrompt.trim(), costQueryOptions))
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
        <p className="eyebrow">AzVision • Cost Intelligence</p>
        <h2>Rule-based cost analyst first pass</h2>
        <p className="subtext">
          This view turns the current Azure inventory into cost triage prompts. It does not claim actual spend yet;
          dollar mapping comes after Azure Cost Management ingestion.
        </p>
        <div className="control-row cost-control-row">
          <label className="field-label">
            Workspace
            <input
              className="search-input"
              value={workspaceId}
              onChange={(event) => setWorkspaceId(event.target.value)}
              onBlur={() => setWorkspaceId((current) => current.trim() || DEFAULT_WORKSPACE_ID)}
            />
          </label>
          <label className="field-label">
            Subscription filter
            <input
              className="search-input"
              value={subscriptionId}
              placeholder="optional subscription id"
              onChange={(event) => setSubscriptionId(event.target.value)}
            />
          </label>
          <label className="field-label">
            Resource group filter
            <input
              className="search-input"
              value={resourceGroupName}
              placeholder="optional resource group"
              onChange={(event) => setResourceGroupName(event.target.value)}
            />
          </label>
          <label className="field-label">
            Resource group limit
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
            Resource limit
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
            {loading ? 'Refreshing…' : 'Refresh cost insights'}
          </button>
          <button type="button" className="toolbar-button" onClick={downloadCostReport} disabled={reportLoading}>
            {reportLoading ? 'Preparing report…' : 'Download markdown report'}
          </button>
        </div>
        {mode ? <p className="hint">Inventory mode: {mode}</p> : null}
        {summary ? <p className="hint">Cost ingestion: {summary.cost_ingestion_provider} • configured: {summary.cost_ingestion_configured ? 'yes' : 'no'}</p> : null}
        {warning ? <p className="warning-text">{warning}</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
      </section>

      <section className="summary-grid">
        <article className="metric-card">
          <span className="metric-label">Cost status</span>
          <strong>{formatCostStatus(summary)}</strong>
        </article>
        <article className="metric-card">
          <span className="metric-label">Resources analyzed</span>
          <strong>{summary?.analyzed_resource_count ?? '-'}</strong>
        </article>
        <article className="metric-card">
          <span className="metric-label">Recommendations</span>
          <strong>{summary?.recommendation_count ?? '-'}</strong>
        </article>
        <article className="metric-card">
          <span className="metric-label">Severity mix</span>
          <strong>{summary ? formatCountMap(summary.severity_counts) : '-'}</strong>
        </article>
        <article className="metric-card">
          <span className="metric-label">Cost drivers</span>
          <strong>{summary ? formatCountMap(summary.cost_driver_counts) : '-'}</strong>
        </article>
        <article className="metric-card">
          <span className="metric-label">Tag gaps</span>
          <strong>{summary?.governance_gap_count ?? '-'}</strong>
        </article>
      </section>

      <section className="panel-card cost-copilot-card">
        <h3>Rule-based copilot</h3>
        <p className="hint">LLM provider is not connected yet; this first pass answers from inventory and rule-based recommendations.</p>
        <div className="cost-copilot-input-row">
          <textarea
            className="search-input cost-copilot-input"
            value={copilotPrompt}
            onChange={(event) => setCopilotPrompt(event.target.value)}
            rows={3}
          />
          <button type="button" className="toolbar-button primary" onClick={askCopilot} disabled={copilotLoading}>
            {copilotLoading ? 'Thinking…' : 'Ask'}
          </button>
        </div>
        {copilotResponse ? (
          <div className="cost-copilot-answer">
            <div className="cost-recommendation-heading">
              <strong>{copilotResponse.copilot_mode} answer</strong>
              <span className="mini-chip">Provider: {copilotResponse.provider ?? copilotResponse.copilot_mode} • LLM: {copilotResponse.llm_status}</span>
            </div>
            <p>{copilotResponse.answer}</p>
            <ul>
              {copilotResponse.suggestions.map((suggestion) => (
                <li key={suggestion}>{suggestion}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="panel-grid cost-panel-grid">
        <article className="panel-card">
          <h3>Top recommendations</h3>
          <div className="cost-recommendation-list">
            {sortedRecommendations.slice(0, 12).map((item) => (
              <div key={`${item.rule_id}-${item.resource_id}`} className="cost-recommendation-card">
                <div className="cost-recommendation-heading">
                  <strong>{item.title}</strong>
                  <span className={`mini-chip severity-${item.severity}`}>{item.severity}</span>
                </div>
                <p>{item.recommendation}</p>
                <p className="hint">
                  {item.resource_name} • {item.resource_type} • confidence {Math.round(item.confidence * 100)}%
                </p>
                {item.evidence.length ? <p className="hint">Evidence: {item.evidence.join(' • ')}</p> : null}
              </div>
            ))}
            {!sortedRecommendations.length && !loading ? <p className="hint">No recommendations for this scope.</p> : null}
          </div>
        </article>

        <article className="panel-card">
          <h3>Resources with most prompts</h3>
          <div className="cost-resource-list">
            {topResources.map((resource) => (
              <div key={resource.resource_id} className="cost-resource-row">
                <div>
                  <strong>{resource.resource_name}</strong>
                  <p className="hint">{resource.resource_type}</p>
                  {resource.cost_driver_labels.length ? <p className="hint">Drivers: {resource.cost_driver_labels.join(' • ')}</p> : null}
                </div>
                <span className="mini-chip">{resource.recommendation_count} prompts</span>
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
