import { Suspense, lazy, useEffect, useState } from 'react'

import { getAuthConfigCheck, getBackendHealth, getTopologyFreshness, getWorkspaces } from './lib/api'

const TopologyPage = lazy(async () => {
  const module = await import('./pages/TopologyPage')
  return { default: module.TopologyPage }
})

const ArchitecturePage = lazy(async () => {
  const module = await import('./pages/ArchitecturePage')
  return { default: module.ArchitecturePage }
})

const CostPage = lazy(async () => {
  const module = await import('./pages/CostPage')
  return { default: module.CostPage }
})

const SimulationPage = lazy(async () => {
  const module = await import('./pages/SimulationPage')
  return { default: module.SimulationPage }
})

type ViewMode = 'topology' | 'architecture' | 'cost' | 'simulation'
type BackendConnectivityStatus = 'checking' | 'online' | 'offline'
type AuthConnectivityStatus = 'checking' | 'ready' | 'not-configured'
type TopologyFreshnessStatus = 'checking' | 'fresh' | 'stale' | 'empty'

function LoadingShell() {
  return (
    <main className="page-shell">
      <section className="panel-card">
        <p>Loading AzVision workspace...</p>
      </section>
    </main>
  )
}

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('topology')
  const [backendConnectivity, setBackendConnectivity] = useState<BackendConnectivityStatus>('checking')
  const [authConnectivity, setAuthConnectivity] = useState<AuthConnectivityStatus>('checking')
  const [topologyFreshness, setTopologyFreshness] = useState<TopologyFreshnessStatus>('checking')
  const [topologyNodeCount, setTopologyNodeCount] = useState<number | null>(null)
  const [connectivityRefreshMessage, setConnectivityRefreshMessage] = useState('')
  const [connectivityRefreshing, setConnectivityRefreshing] = useState(false)

  async function handleRefreshConnectivity() {
    if (connectivityRefreshing) {
      return
    }

    setConnectivityRefreshing(true)
    setBackendConnectivity('checking')
    setAuthConnectivity('checking')
    setTopologyFreshness('checking')
    setConnectivityRefreshMessage('Refreshing...')

    try {
      const [backendResult, authResult, freshnessResult] = await Promise.allSettled([
        getBackendHealth(),
        getAuthConfigCheck(),
        getWorkspaces().then(async (workspaces) => {
          if (workspaces.length === 0) {
            return { status: 'empty' as const, nodeCount: null }
          }

          const freshness = await getTopologyFreshness(workspaces[0].id)
          if (freshness.generated_at === null) {
            return { status: 'empty' as const, nodeCount: null }
          }

          const ageMs = Date.now() - new Date(freshness.generated_at).getTime()
          return {
            status: ageMs < 24 * 60 * 60 * 1000 ? ('fresh' as const) : ('stale' as const),
            nodeCount: freshness.node_count,
          }
        }),
      ])

      setBackendConnectivity(
        backendResult.status === 'fulfilled' && backendResult.value.status === 'ok' ? 'online' : 'offline',
      )
      setAuthConnectivity(
        authResult.status === 'fulfilled' && authResult.value.auth_ready ? 'ready' : 'not-configured',
      )

      if (freshnessResult.status === 'fulfilled') {
        setTopologyFreshness(freshnessResult.value.status)
        setTopologyNodeCount(freshnessResult.value.nodeCount)
      } else {
        setTopologyFreshness('empty')
        setTopologyNodeCount(null)
      }

      setConnectivityRefreshMessage('Status refreshed')
      window.setTimeout(() => setConnectivityRefreshMessage(''), 2500)
    } finally {
      setConnectivityRefreshing(false)
    }
  }

  useEffect(() => {
    let active = true

    async function refreshBackendConnectivity() {
      try {
        const health = await getBackendHealth()
        if (active) {
          setBackendConnectivity(health.status === 'ok' ? 'online' : 'offline')
        }
      } catch {
        if (active) {
          setBackendConnectivity('offline')
        }
      }
    }

    async function refreshAuthConnectivity() {
      try {
        const auth = await getAuthConfigCheck()
        if (active) {
          setAuthConnectivity(auth.auth_ready ? 'ready' : 'not-configured')
        }
      } catch {
        if (active) {
          setAuthConnectivity('not-configured')
        }
      }
    }

    async function refreshTopologyFreshness() {
      try {
        const workspaces = await getWorkspaces()
        if (!active || workspaces.length === 0) {
          if (active) setTopologyFreshness('empty')
          return
        }
        const freshness = await getTopologyFreshness(workspaces[0].id)
        if (!active) return
        if (freshness.generated_at === null) {
          setTopologyFreshness('empty')
          setTopologyNodeCount(null)
          return
        }
        // stale if older than 24h
        const ageMs = Date.now() - new Date(freshness.generated_at).getTime()
        setTopologyFreshness(ageMs < 24 * 60 * 60 * 1000 ? 'fresh' : 'stale')
        setTopologyNodeCount(freshness.node_count)
      } catch {
        if (active) {
          setTopologyFreshness('empty')
          setTopologyNodeCount(null)
        }
      }
    }

    void refreshBackendConnectivity()
    void refreshAuthConnectivity()
    void refreshTopologyFreshness()
    const intervalId = window.setInterval(refreshBackendConnectivity, 30000)
    const authIntervalId = window.setInterval(refreshAuthConnectivity, 30000)
    const topologyIntervalId = window.setInterval(refreshTopologyFreshness, 60000)

    return () => {
      active = false
      window.clearInterval(intervalId)
      window.clearInterval(authIntervalId)
      window.clearInterval(topologyIntervalId)
    }
  }, [])

  return (
    <>
      <header className="workspace-header-shell">
        <div className="workspace-header-inner">
          <div>
            <p className="eyebrow workspace-shell-eyebrow">AzVision Workspace</p>
            <h1 className="workspace-shell-title">Azure topology and architecture workspace</h1>
            <p className="subtext workspace-shell-subtext">
              Switch between topology exploration, presentation architecture, cost triage, and simulation planning.
            </p>
            <div className="workspace-connectivity-row" aria-live="polite" data-testid="app-connectivity-row">
              <span className="workspace-connectivity-group">
                <span
                  className={`connectivity-dot ${backendConnectivity}`}
                  aria-hidden="true"
                />
                <span className="workspace-connectivity-copy">
                  Backend {backendConnectivity === 'online' ? 'online' : backendConnectivity === 'checking' ? 'checking' : 'offline'}
                </span>
              </span>
              <span className="workspace-connectivity-sep" aria-hidden="true">•</span>
              <span className="workspace-connectivity-group">
                <span
                  className={`connectivity-dot ${authConnectivity === 'ready' ? 'online' : authConnectivity === 'checking' ? 'checking' : 'offline'}`}
                  aria-hidden="true"
                />
                <span className="workspace-connectivity-copy">
                  Auth {authConnectivity === 'ready' ? 'ready' : authConnectivity === 'checking' ? 'checking' : 'not configured'}
                </span>
              </span>
              <span className="workspace-connectivity-sep" aria-hidden="true">•</span>
              <span className="workspace-connectivity-group">
                <span
                  className={`connectivity-dot ${topologyFreshness === 'fresh' ? 'online' : topologyFreshness === 'checking' ? 'checking' : 'offline'}`}
                  aria-hidden="true"
                />
                <span className="workspace-connectivity-copy">
                  Topology {topologyFreshness === 'fresh' ? 'fresh' : topologyFreshness === 'stale' ? 'stale' : topologyFreshness === 'checking' ? 'checking' : 'no data'}{topologyNodeCount !== null ? ` (${topologyNodeCount} nodes)` : ''}
                </span>
              </span>
              <button
                type="button"
                className="workspace-connectivity-refresh"
                onClick={handleRefreshConnectivity}
                disabled={connectivityRefreshing}
                aria-busy={connectivityRefreshing}
                data-testid="app-connectivity-refresh"
              >
                {connectivityRefreshing ? 'Refreshing...' : 'Refresh status'}
              </button>
              {connectivityRefreshMessage ? (
                <span className="workspace-connectivity-refresh-message" role="status">
                  {connectivityRefreshMessage}
                </span>
              ) : null}
            </div>
          </div>

          <div className="view-toggle" role="tablist" aria-label="AzVision view mode">
            <button
              type="button"
              className={`view-toggle-button ${viewMode === 'topology' ? 'active' : ''}`}
              onClick={() => setViewMode('topology')}
              role="tab"
              aria-selected={viewMode === 'topology'}
            >
              Topology View
            </button>
            <button
              type="button"
              className={`view-toggle-button ${viewMode === 'architecture' ? 'active' : ''}`}
              onClick={() => setViewMode('architecture')}
              role="tab"
              aria-selected={viewMode === 'architecture'}
            >
              Architecture View
            </button>
            <button
              type="button"
              className={`view-toggle-button ${viewMode === 'cost' ? 'active' : ''}`}
              onClick={() => setViewMode('cost')}
              role="tab"
              aria-selected={viewMode === 'cost'}
            >
              Cost Insights
            </button>
            <button
              type="button"
              className={`view-toggle-button ${viewMode === 'simulation' ? 'active' : ''}`}
              onClick={() => setViewMode('simulation')}
              role="tab"
              aria-selected={viewMode === 'simulation'}
            >
              Simulation
            </button>
          </div>
        </div>
      </header>

      <Suspense fallback={<LoadingShell />}>
        {viewMode === 'topology' ? (
          <TopologyPage />
        ) : viewMode === 'architecture' ? (
          <ArchitecturePage />
        ) : viewMode === 'cost' ? (
          <CostPage />
        ) : (
          <SimulationPage />
        )}
      </Suspense>
    </>
  )
}
