import { useEffect, useState } from 'react'

import { ApiError, createSimulation, getSimulationTemplate, getSimulations, type SimulationRecord, type SimulationTemplateResponse } from '../lib/api'

const DEFAULT_WORKSPACE_ID = import.meta.env.VITE_DEFAULT_WORKSPACE_ID ?? 'local-demo'

function priorityTone(priority: string) {
  if (priority === 'required') return 'severity-high'
  if (priority === 'recommended') return 'severity-medium'
  return 'severity-low'
}

export function SimulationPage() {
  const [workspaceId, setWorkspaceId] = useState<string>(DEFAULT_WORKSPACE_ID)
  const [workloadName, setWorkloadName] = useState('new-app')
  const [environment, setEnvironment] = useState('dev')
  const [description, setDescription] = useState('private web app with SQL database, backup, and monitoring')
  const [simulations, setSimulations] = useState<SimulationRecord[]>([])
  const [selectedSimulationId, setSelectedSimulationId] = useState('')
  const [template, setTemplate] = useState<SimulationTemplateResponse | null>(null)
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
      return
    }
    let cancelled = false
    async function loadTemplate() {
      setTemplateLoading(true)
      try {
        const result = await getSimulationTemplate(workspaceId, selectedSimulation.simulation_id)
        if (!cancelled) {
          setTemplate(result)
        }
      } catch {
        if (!cancelled) {
          setTemplate(null)
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
  }, [selectedSimulation, workspaceId])

  async function handleCreateSimulation() {
    if (!description.trim()) {
      setError('Description is required')
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

  return (
    <main className="page-shell simulation-page-shell">
      <section className="panel-card hero-card">
        <p className="eyebrow">AzVision • Simulation</p>
        <h2>Rule-based resource planning first pass</h2>
        <p className="subtext">
          Describe a project and get a first-pass Azure resource plan. This is not a deployment template or price
          estimate yet; it is a structured starting point for architecture review.
        </p>
        <div className="simulation-form-grid">
          <label className="field-label">
            Workspace
            <input className="search-input" value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} />
          </label>
          <label className="field-label">
            Workload
            <input className="search-input" value={workloadName} onChange={(event) => setWorkloadName(event.target.value)} />
          </label>
          <label className="field-label">
            Environment
            <input className="search-input" value={environment} onChange={(event) => setEnvironment(event.target.value)} />
          </label>
        </div>
        <label className="field-label simulation-description-field">
          Project description
          <textarea
            className="search-input simulation-description-input"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
          />
        </label>
        <div className="control-row">
          <button type="button" className="toolbar-button primary" onClick={handleCreateSimulation} disabled={loading}>
            {loading ? 'Generating…' : 'Generate resource plan'}
          </button>
          {error ? <span className="error-text">{error}</span> : null}
        </div>
      </section>

      <section className="panel-grid simulation-panel-grid">
        <article className="panel-card">
          <h3>Generated plans</h3>
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
            {!simulations.length ? <p className="hint">No generated simulations in this process yet.</p> : null}
          </div>
        </article>

        <article className="panel-card">
          <h3>Recommended resources</h3>
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
              <div className="simulation-insight-grid">
                <div className="cost-note-box">
                  <h4>Architecture notes</h4>
                  {selectedSimulation.architecture_notes.map((note) => (
                    <p key={note}>{note}</p>
                  ))}
                </div>
                <div className="cost-note-box">
                  <h4>Cost considerations</h4>
                  {selectedSimulation.cost_considerations.map((note) => (
                    <p key={note}>{note}</p>
                  ))}
                </div>
                <div className="cost-note-box">
                  <h4>Security considerations</h4>
                  {selectedSimulation.security_considerations.map((note) => (
                    <p key={note}>{note}</p>
                  ))}
                </div>
                <div className="cost-note-box">
                  <h4>Next actions</h4>
                  {selectedSimulation.next_actions.map((action) => (
                    <p key={action}>{action}</p>
                  ))}
                </div>
              </div>
              <div className="cost-note-box">
                <h4>Assumptions</h4>
                {selectedSimulation.assumptions.map((assumption) => (
                  <p key={assumption}>{assumption}</p>
                ))}
              </div>
              <div className="cost-note-box simulation-template-box">
                <div className="cost-recommendation-heading">
                  <h4>IaC outline</h4>
                  <span className="mini-chip">{templateLoading ? 'loading' : template?.format ?? 'not loaded'}</span>
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
                  <p className="hint">Template outline is not available for this simulation yet.</p>
                )}
              </div>
            </>
          ) : (
            <p className="hint">Generate a plan to see recommendations.</p>
          )}
        </article>
      </section>
    </main>
  )
}
