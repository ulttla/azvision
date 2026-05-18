import { useEffect, useState } from 'react'

import {
  ApiError,
  createSimulation,
  getSimulationFit,
  getSimulationReport,
  getSimulationTemplate,
  getSimulations,
  type SimulationFitResponse,
  type SimulationRecord,
  type SimulationReportResponse,
  type SimulationTemplateResponse,
} from '../lib/api'
import { useI18n } from '../i18n/context'

const DEFAULT_WORKSPACE_ID = import.meta.env.VITE_DEFAULT_WORKSPACE_ID ?? 'local-demo'

function priorityTone(priority: string) {
  if (priority === 'required') return 'severity-high'
  if (priority === 'recommended') return 'severity-medium'
  return 'severity-low'
}

function safeFileName(value: string) {
  return value.trim().replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'simulation'
}

function downloadTextFile(filename: string, content: string, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function SimulationPage() {
  const { t } = useI18n()
  const [workspaceId, setWorkspaceId] = useState<string>(DEFAULT_WORKSPACE_ID)
  const [workloadName, setWorkloadName] = useState('new-app')
  const [environment, setEnvironment] = useState('dev')
  const [description, setDescription] = useState('private web app with SQL database, backup, and monitoring')
  const [simulations, setSimulations] = useState<SimulationRecord[]>([])
  const [selectedSimulationId, setSelectedSimulationId] = useState('')
  const [template, setTemplate] = useState<SimulationTemplateResponse | null>(null)
  const [fit, setFit] = useState<SimulationFitResponse | null>(null)
  const [report, setReport] = useState<SimulationReportResponse | null>(null)
  const [fitLimit, setFitLimit] = useState(200)
  const [templateLoading, setTemplateLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const result = await getSimulations(workspaceId)
        if (!cancelled) {
          setSimulations(result.items)
          if (!selectedSimulationId && result.items[0]) {
            setSelectedSimulationId(result.items[0].simulation_id)
          }
        }
      } catch {
        // Empty in-process store or backend not ready should not block the form.
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [selectedSimulationId, workspaceId])

  const selectedSimulation = simulations.find((item) => item.simulation_id === selectedSimulationId) ?? simulations[0]

  useEffect(() => {
    if (!selectedSimulation) {
      setTemplate(null)
      setFit(null)
      setReport(null)
      return
    }
    let cancelled = false
    async function loadTemplate() {
      setTemplateLoading(true)
      try {
        const [templateResult, fitResult, reportResult] = await Promise.all([
          getSimulationTemplate(workspaceId, selectedSimulation.simulation_id),
          getSimulationFit(workspaceId, selectedSimulation.simulation_id, { limit: fitLimit }),
          getSimulationReport(workspaceId, selectedSimulation.simulation_id),
        ])
        if (!cancelled) {
          setTemplate(templateResult)
          setFit(fitResult)
          setReport(reportResult)
        }
      } catch {
        if (!cancelled) {
          setTemplate(null)
          setFit(null)
          setReport(null)
        }
      } finally {
        if (!cancelled) {
          setTemplateLoading(false)
        }
      }
    }
    loadTemplate()
    return () => {
      cancelled = true
    }
  }, [fitLimit, selectedSimulation, workspaceId])

  async function handleCreateSimulation() {
    if (!description.trim()) {
      setError(t('sim.form.descriptionRequired'))
      return
    }
    setLoading(true)
    setError('')
    try {
      const created = await createSimulation(workspaceId, {
        workload_name: workloadName.trim() || 'workload',
        environment: environment.trim() || 'dev',
        description: description.trim(),
      })
      setSimulations((current) => [created, ...current.filter((item) => item.simulation_id !== created.simulation_id)])
      setSelectedSimulationId(created.simulation_id)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Failed to create simulation')
    } finally {
      setLoading(false)
    }
  }

  function downloadSimulationReport() {
    if (!selectedSimulation || !report) return
    downloadTextFile(
      `${safeFileName(selectedSimulation.workload_name)}-${selectedSimulation.simulation_id}-report.md`,
      report.content,
      'text/markdown;charset=utf-8',
    )
  }

  function downloadSimulationTemplate() {
    if (!selectedSimulation || !template) return
    downloadTextFile(
      `${safeFileName(selectedSimulation.workload_name)}-${selectedSimulation.simulation_id}-outline.bicep`,
      template.content,
    )
  }

  return (
    <main className="page-shell simulation-page-shell">
      <section className="panel-card hero-card">
        <p className="eyebrow">{t('sim.hero.eyebrow')}</p>
        <h2>{t('sim.hero.title')}</h2>
        <p className="subtext">
          {t('sim.hero.subtext')}
        </p>
        <div className="simulation-form-grid">
          <label className="field-label">
            {t('sim.form.workspace')}
            <input className="search-input" value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} />
          </label>
          <label className="field-label">
            {t('sim.form.workload')}
            <input className="search-input" value={workloadName} onChange={(event) => setWorkloadName(event.target.value)} />
          </label>
          <label className="field-label">
            {t('sim.form.environment')}
            <input className="search-input" value={environment} onChange={(event) => setEnvironment(event.target.value)} />
          </label>
          <label className="field-label">
            {t('sim.form.fitLimit')}
            <input
              className="search-input"
              type="number"
              min={1}
              max={500}
              value={fitLimit}
              onChange={(event) => setFitLimit(Math.min(500, Math.max(1, Number(event.target.value) || 1)))}
            />
          </label>
        </div>
        <label className="field-label simulation-description-field">
          {t('sim.form.description')}
          <textarea
            className="search-input simulation-description-input"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
          />
        </label>
        <div className="control-row">
          <button type="button" className="toolbar-button primary" onClick={handleCreateSimulation} disabled={loading}>
            {loading ? t('sim.form.generating') : t('sim.form.generate')}
          </button>
          {error ? <span className="error-text">{error}</span> : null}
        </div>
      </section>

      <section className="panel-grid simulation-panel-grid">
        <article className="panel-card">
          <h3>{t('sim.list.heading')}</h3>
          <div className="simulation-list">
            {simulations.map((item) => (
              <button
                key={item.simulation_id}
                type="button"
                className={`simulation-list-item ${selectedSimulation?.simulation_id === item.simulation_id ? 'active' : ''}`}
                onClick={() => setSelectedSimulationId(item.simulation_id)}
              >
                <strong>{item.workload_name}</strong>
                <span>{item.environment} • {item.recommended_resources.length} resources</span>
              </button>
            ))}
            {!simulations.length ? <p className="hint">{t('sim.list.empty')}</p> : null}
          </div>
        </article>

        <article className="panel-card">
          <h3>{t('sim.detail.heading')}</h3>
          {selectedSimulation ? (
            <>
              <p className="hint">
                {selectedSimulation.mode} • matched: {selectedSimulation.matched_rules.join(', ')}
              </p>
              <div className="simulation-resource-list">
                {selectedSimulation.recommended_resources.map((item) => (
                  <div key={`${selectedSimulation.simulation_id}-${item.resource_type}`} className="simulation-resource-card">
                    <div className="cost-recommendation-heading">
                      <strong>{item.resource_type}</strong>
                      <span className={`mini-chip ${priorityTone(item.priority)}`}>{item.priority}</span>
                    </div>
                    <p className="hint">Name hint: {item.name_hint}</p>
                    <p>{item.reason}</p>
                  </div>
                ))}
              </div>
              {fit ? (
                <div className="cost-note-box simulation-fit-box">
                  <h4>{t('sim.fit.heading')}</h4>
                  <p className="hint">
                    {t('sim.fit.inventoryResources')} {fit.inventory_resource_count} • {t('sim.fit.covered')} {fit.covered_count} • {t('sim.fit.missingRequired')} {fit.missing_required_count}
                  </p>
                  <div className="simulation-fit-list">
                    {fit.items.map((item) => (
                      <div key={`${selectedSimulation.simulation_id}-${item.resource_type}-fit`} className="simulation-fit-row">
                        <div>
                          <strong>{item.resource_type}</strong>
                          <p className="hint">{item.recommendation}</p>
                          {item.sample_existing_names.length ? <p className="hint">Existing: {item.sample_existing_names.join(' • ')}</p> : null}
                        </div>
                        <span className={`mini-chip ${item.status === 'covered' ? 'severity-low' : item.priority === 'required' ? 'severity-high' : 'severity-medium'}`}>
                          {item.status} · {item.existing_count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="simulation-insight-grid">
                <div className="cost-note-box">
                  <h4>{t('sim.notes.architecture')}</h4>
                  {selectedSimulation.architecture_notes.map((note) => (
                    <p key={note}>{note}</p>
                  ))}
                </div>
                <div className="cost-note-box">
                  <h4>{t('sim.notes.cost')}</h4>
                  {selectedSimulation.cost_considerations.map((note) => (
                    <p key={note}>{note}</p>
                  ))}
                </div>
                <div className="cost-note-box">
                  <h4>{t('sim.notes.security')}</h4>
                  {selectedSimulation.security_considerations.map((note) => (
                    <p key={note}>{note}</p>
                  ))}
                </div>
                <div className="cost-note-box">
                  <h4>{t('sim.notes.nextActions')}</h4>
                  {selectedSimulation.next_actions.map((action) => (
                    <p key={action}>{action}</p>
                  ))}
                </div>
              </div>
              <div className="cost-note-box">
                <h4>{t('sim.notes.assumptions')}</h4>
                {selectedSimulation.assumptions.map((assumption) => (
                  <p key={assumption}>{assumption}</p>
                ))}
              </div>
              <div className="cost-note-box simulation-template-box">
                <div className="cost-recommendation-heading">
                  <h4>{t('sim.report.heading')}</h4>
                  <button type="button" className="toolbar-button search-inline-button" onClick={downloadSimulationReport} disabled={!report}>
                    {t('sim.report.download')}
                  </button>
                  <span className="mini-chip">{report?.report_type ?? t('sim.report.notLoaded')}</span>
                </div>
                {report ? (
                  <>
                    <pre className="simulation-template-content">{report.content}</pre>
                    {report.warnings.map((warning) => (
                      <p className="hint" key={warning}>{warning}</p>
                    ))}
                  </>
                ) : (
                  <p className="hint">{t('sim.report.unavailable')}</p>
                )}
              </div>
              <div className="cost-note-box simulation-template-box">
                <div className="cost-recommendation-heading">
                  <h4>{t('sim.iac.heading')}</h4>
                  <button type="button" className="toolbar-button search-inline-button" onClick={downloadSimulationTemplate} disabled={!template}>
                    {t('sim.report.download')}
                  </button>
                  <span className="mini-chip">{templateLoading ? t('sim.iac.loading') : template?.format ?? t('sim.report.notLoaded')}</span>
                </div>
                {template ? (
                  <>
                    <p className="hint">Deployable: {template.deployable ? 'yes' : 'no'} • resources: {template.resources.length}</p>
                    <pre className="simulation-template-content">{template.content}</pre>
                    {template.warnings.map((warning) => (
                      <p className="hint" key={warning}>{warning}</p>
                    ))}
                  </>
                ) : (
                  <p className="hint">{t('sim.iac.unavailable')}</p>
                )}
              </div>
            </>
          ) : (
            <p className="hint">{t('sim.detail.empty')}</p>
          )}
        </article>
      </section>
    </main>
  )
}
