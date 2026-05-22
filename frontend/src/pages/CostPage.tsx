import { useEffect, useMemo, useState } from 'react'

import { CopilotPanel } from '../components/CopilotPanel'
import { useI18n } from '../i18n/context'
import {
  ApiError,
  getCostRecommendations,
  getCostReport,
  getCostResources,
  getCostSummary,
  type CopilotViewContext,
  type CostRecommendation,
  type CostResourceRow,
  type CostSummary,
} from '../lib/api'

const DEFAULT_WORKSPACE_ID = import.meta.env.VITE_DEFAULT_WORKSPACE_ID ?? 'local-demo'

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
  const { t } = useI18n()
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
        setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : t('cost.error.loadInsights'))
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
  const costCopilotViewContext = useMemo<CopilotViewContext>(
    () => ({
      filters: {
        subscriptionId: costQueryOptions.subscriptionId ?? null,
        resourceGroupName: costQueryOptions.resourceGroupName ?? null,
        resourceGroupLimit: costQueryOptions.resourceGroupLimit,
        resourceLimit: costQueryOptions.resourceLimit,
      },
      status: {
        loading,
        mode: mode || null,
        warning: warning || null,
        hasError: Boolean(error),
      },
      summary: summary
        ? {
            currency: summary.currency,
            estimatedMonthlyCost: summary.estimated_monthly_cost,
            costStatus: summary.cost_status,
            costIngestionProvider: summary.cost_ingestion_provider,
            costIngestionConfigured: summary.cost_ingestion_configured,
            matchedCostResourceCount: summary.matched_cost_resource_count,
            analyzedResourceCount: summary.analyzed_resource_count,
            recommendationCount: summary.recommendation_count,
            severityCounts: summary.severity_counts,
            categoryCounts: summary.category_counts,
            topResourceTypes: summary.top_resource_types,
            costDriverCounts: summary.cost_driver_counts,
            governanceGapCount: summary.governance_gap_count,
            notes: summary.notes.slice(0, 5),
          }
        : null,
      topResources: topResources.map((resource) => ({
        name: resource.resource_name,
        type: resource.resource_type,
        resourceGroup: resource.resource_group ?? null,
        location: resource.location ?? null,
        estimatedMonthlyCost: resource.estimated_monthly_cost,
        costStatus: resource.cost_status,
        costDrivers: resource.cost_driver_labels.slice(0, 5),
        recommendationCount: resource.recommendation_count,
      })),
      topRecommendations: sortedRecommendations.slice(0, 8).map((item) => ({
        ruleId: item.rule_id,
        category: item.category,
        severity: item.severity,
        title: item.title,
        resourceName: item.resource_name,
        resourceType: item.resource_type,
        confidence: item.confidence,
        evidenceCount: item.evidence.length,
      })),
    }),
    [costQueryOptions, error, loading, mode, sortedRecommendations, summary, topResources, warning],
  )
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
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : t('cost.error.downloadReport'))
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

      <CopilotPanel
        workspaceId={workspaceId}
        queryOptions={costQueryOptions}
        currentView="cost-insights"
        viewContext={costCopilotViewContext}
        onError={setError}
      />

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
