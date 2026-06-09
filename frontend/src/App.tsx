import { Suspense, lazy, useEffect, useMemo, useState } from 'react'

import { ErrorBoundary } from './components/ErrorBoundary'
import { PublicBetaOnboarding } from './components/PublicBetaOnboarding'
import { useI18n } from './i18n/context'
import type { DictKey } from './i18n/dict'
import { bootstrapDemoWorkspace, getAuthConfigCheck, getBackendHealth, getBackendReadiness, getDemoWorkspaceStatus, getTopologyFreshness, getWorkspaces } from './lib/api'
import type { AuthConfigCheckResponse } from './lib/api'

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

function LoadingShell({ loadingLabel }: { loadingLabel: string }) {
  return (
    <main className="page-shell">
      <section className="panel-card">
        <p>{loadingLabel}</p>
      </section>
    </main>
  )
}

function ReadinessPill({ label, ready }: { label: string; ready: boolean }) {
  return (
    <span className={`account-lifecycle-pill ${ready ? 'ready' : 'pending'}`}>
      <span aria-hidden="true">{ready ? '✓' : '!'}</span>
      {label}
    </span>
  )
}

function AccountLifecycleReadiness({ authReadiness, t }: { authReadiness: AuthConfigCheckResponse | null; t: (key: DictKey) => string }) {
  const oidc = authReadiness?.checks.oidc
  const lifecycle = authReadiness?.checks.account_lifecycle
  const rateLimit = authReadiness?.checks.rate_limit
  const oidcProviderReady = Boolean(
    oidc?.login_enabled && oidc.issuer_present && oidc.audience_present && oidc.jwks_url_present && oidc.workspace_map_present && oidc.workspace_map_valid,
  )
  const accountManagementGated = lifecycle?.account_management_enabled === false
  const publicRoutesExposureGated = lifecycle?.public_routes_exposure_gated === true
  const sharedLimiterReady = Boolean(rateLimit?.public_beta_shared_gate_satisfied)

  return (
    <section className="account-lifecycle-readiness" data-testid="account-lifecycle-readiness" aria-label={t('accountLifecycle.aria')}>
      <div>
        <p className="account-lifecycle-kicker">{t('accountLifecycle.kicker')}</p>
        <h2>{t('accountLifecycle.title')}</h2>
        <p>{t('accountLifecycle.subtext')}</p>
      </div>
      <div className="account-lifecycle-pill-row" data-testid="account-lifecycle-pill-row">
        <ReadinessPill label={t('accountLifecycle.pill.oidcMapped')} ready={oidcProviderReady} />
        <ReadinessPill label={t('accountLifecycle.pill.accountManagementGated')} ready={accountManagementGated} />
        <ReadinessPill label={t('accountLifecycle.pill.publicRoutesGated')} ready={publicRoutesExposureGated} />
        <ReadinessPill label={t('accountLifecycle.pill.sharedLimiter')} ready={sharedLimiterReady} />
      </div>
    </section>
  )
}

export default function App() {
  const { t, locale, setLocale } = useI18n()
  const toggleLocale = () => setLocale(locale === 'en' ? 'ko' : 'en')

  const backendLabels = useMemo(
    () => ({
      online: t('status.online'),
      checking: t('status.checking'),
      offline: t('status.offline'),
    }),
    [t],
  )
  const authLabels = useMemo(
    () => ({
      ready: t('status.ready'),
      checking: t('status.checking'),
      'not-configured': t('status.notConfigured'),
    }),
    [t],
  )
  const freshnessLabels = useMemo(
    () => ({
      fresh: t('status.fresh'),
      stale: t('status.stale'),
      checking: t('status.checking'),
      empty: t('status.noData'),
    }),
    [t],
  )

  const [viewMode, setViewMode] = useState<ViewMode>('topology')
  const [backendConnectivity, setBackendConnectivity] = useState<BackendConnectivityStatus>('checking')
  const [authConnectivity, setAuthConnectivity] = useState<AuthConnectivityStatus>('checking')
  const [authReadiness, setAuthReadiness] = useState<AuthConfigCheckResponse | null>(null)
  const [topologyFreshness, setTopologyFreshness] = useState<TopologyFreshnessStatus>('checking')
  const [topologyNodeCount, setTopologyNodeCount] = useState<number | null>(null)
  const [workspaceCount, setWorkspaceCount] = useState<number | null>(null)
  const [demoWorkspaceStatus, setDemoWorkspaceStatus] = useState<'checking' | 'ready' | 'unavailable'>('checking')
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
    setConnectivityRefreshMessage(t('status.refreshing'))
    setDemoWorkspaceStatus('checking')

    try {
      const [backendHealthResult, backendReadinessResult, authResult, demoStatusResult, freshnessResult] = await Promise.allSettled([
        getBackendHealth(),
        getBackendReadiness(),
        getAuthConfigCheck(),
        getDemoWorkspaceStatus(),
        getWorkspaces().then(async (workspaces) => {
          if (workspaces.length === 0) {
            return { status: 'empty' as const, nodeCount: null, workspaceCount: 0 }
          }

          const freshness = await getTopologyFreshness(workspaces[0].id)
          if (freshness.generated_at === null) {
            return { status: 'empty' as const, nodeCount: null, workspaceCount: workspaces.length }
          }

          const ageMs = Date.now() - new Date(freshness.generated_at).getTime()
          return {
            status: ageMs < 24 * 60 * 60 * 1000 ? ('fresh' as const) : ('stale' as const),
            nodeCount: freshness.node_count,
            workspaceCount: workspaces.length,
          }
        }),
      ])

      setBackendConnectivity(
        backendHealthResult.status === 'fulfilled' &&
          backendHealthResult.value.status === 'ok' &&
          backendReadinessResult.status === 'fulfilled' &&
          backendReadinessResult.value.status === 'ok' &&
          backendReadinessResult.value.checks.database
          ? 'online'
          : 'offline',
      )
      if (authResult.status === 'fulfilled') {
        setAuthReadiness(authResult.value)
        setAuthConnectivity(authResult.value.auth_ready ? 'ready' : 'not-configured')
      } else {
        setAuthReadiness(null)
        setAuthConnectivity('not-configured')
      }
      setDemoWorkspaceStatus(
        demoStatusResult.status === 'fulfilled' && demoStatusResult.value.is_demo && demoStatusResult.value.has_topology
          ? 'ready'
          : 'unavailable',
      )

      if (freshnessResult.status === 'fulfilled') {
        setTopologyFreshness(freshnessResult.value.status)
        setTopologyNodeCount(freshnessResult.value.nodeCount)
        setWorkspaceCount(freshnessResult.value.workspaceCount)
      } else {
        setTopologyFreshness('empty')
        setTopologyNodeCount(null)
        setWorkspaceCount(null)
      }

      setConnectivityRefreshMessage(t('status.refreshed'))
      window.setTimeout(() => setConnectivityRefreshMessage(''), 2500)
    } finally {
      setConnectivityRefreshing(false)
    }
  }

  useEffect(() => {
    let active = true

    async function refreshBackendConnectivity() {
      try {
        const [health, readiness] = await Promise.all([getBackendHealth(), getBackendReadiness()])
        if (active) {
          setBackendConnectivity(
            health.status === 'ok' && readiness.status === 'ok' && readiness.checks.database ? 'online' : 'offline',
          )
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
          setAuthReadiness(auth)
          setAuthConnectivity(auth.auth_ready ? 'ready' : 'not-configured')
        }
      } catch {
        if (active) {
          setAuthReadiness(null)
          setAuthConnectivity('not-configured')
        }
      }
    }

    async function refreshDemoWorkspaceStatus() {
      try {
        const demoStatus = await getDemoWorkspaceStatus()
        if (active) {
          setDemoWorkspaceStatus(demoStatus.is_demo && demoStatus.has_topology ? 'ready' : 'unavailable')
        }
      } catch {
        if (active) {
          setDemoWorkspaceStatus('unavailable')
        }
      }
    }

    async function refreshTopologyFreshness() {
      try {
        const workspaces = await getWorkspaces()
        if (!active || workspaces.length === 0) {
          if (active) {
            setTopologyFreshness('empty')
            setTopologyNodeCount(null)
            setWorkspaceCount(workspaces.length)
          }
          return
        }
        setWorkspaceCount(workspaces.length)
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
          setWorkspaceCount(null)
        }
      }
    }

    void refreshBackendConnectivity()
    void refreshAuthConnectivity()
    void refreshDemoWorkspaceStatus()
    void refreshTopologyFreshness()
    const intervalId = window.setInterval(refreshBackendConnectivity, 30000)
    const authIntervalId = window.setInterval(refreshAuthConnectivity, 30000)
    const demoIntervalId = window.setInterval(refreshDemoWorkspaceStatus, 60000)
    const topologyIntervalId = window.setInterval(refreshTopologyFreshness, 60000)

    return () => {
      active = false
      window.clearInterval(intervalId)
      window.clearInterval(authIntervalId)
      window.clearInterval(demoIntervalId)
      window.clearInterval(topologyIntervalId)
    }
  }, [])

  const isFirstRun = workspaceCount === 0 && topologyFreshness === 'empty'

  async function handleOpenDemoPath() {
    setConnectivityRefreshMessage(t('status.refreshing'))
    try {
      const demoStatus = await bootstrapDemoWorkspace()
      setDemoWorkspaceStatus(demoStatus.is_demo && demoStatus.has_topology ? 'ready' : 'unavailable')
      setWorkspaceCount((current) => current ?? 1)
      setViewMode('topology')
      setConnectivityRefreshMessage(t('status.refreshed'))
      window.setTimeout(() => setConnectivityRefreshMessage(''), 2500)
    } catch {
      setDemoWorkspaceStatus('unavailable')
      setViewMode('topology')
    }
  }

  return (
    <>
      <header className="workspace-header-shell">
        <div className="workspace-header-inner">
          <div>
            <p className="eyebrow workspace-shell-eyebrow">{t('shell.eyebrow')}</p>
            <h1 className="workspace-shell-title">{t('shell.title')}</h1>
            <p className="subtext workspace-shell-subtext">
              {t('shell.subtext')}
            </p>
            <div className="workspace-connectivity-row" aria-live="polite" data-testid="app-connectivity-row">
              <span className="workspace-connectivity-group">
                <span
                  className={`connectivity-dot ${backendConnectivity}`}
                  aria-hidden="true"
                />
                <span className="workspace-connectivity-copy">
                  {t('status.backend')} {backendLabels[backendConnectivity] ?? backendConnectivity}
                </span>
              </span>
              <span className="workspace-connectivity-sep" aria-hidden="true">•</span>
              <span className="workspace-connectivity-group">
                <span
                  className={`connectivity-dot ${authConnectivity === 'ready' ? 'online' : authConnectivity === 'checking' ? 'checking' : 'offline'}`}
                  aria-hidden="true"
                />
                <span className="workspace-connectivity-copy">
                  {t('status.auth')} {authLabels[authConnectivity] ?? authConnectivity}
                </span>
              </span>
              <span className="workspace-connectivity-sep" aria-hidden="true">•</span>
              <span className="workspace-connectivity-group">
                <span
                  className={`connectivity-dot ${topologyFreshness === 'fresh' ? 'online' : topologyFreshness === 'checking' ? 'checking' : 'offline'}`}
                  aria-hidden="true"
                />
                <span className="workspace-connectivity-copy">
                  {t('status.topology')} {freshnessLabels[topologyFreshness] ?? topologyFreshness}{topologyNodeCount !== null ? ` (${topologyNodeCount} ${t('common.nodes')})` : ''}
                </span>
              </span>
              <span className={`public-beta-demo-badge ${demoWorkspaceStatus}`} data-testid="public-beta-demo-badge">
                {demoWorkspaceStatus === 'ready' ? t('publicBeta.demoBadge.ready') : t('publicBeta.demoBadge.pending')}
              </span>
              <button
                type="button"
                className="workspace-connectivity-refresh"
                onClick={handleRefreshConnectivity}
                disabled={connectivityRefreshing}
                aria-busy={connectivityRefreshing}
                data-testid="app-connectivity-refresh"
              >
                {connectivityRefreshing ? t('status.refreshing') : t('status.refresh')}
              </button>
              {connectivityRefreshMessage ? (
                <span className="workspace-connectivity-refresh-message" role="status">
                  {connectivityRefreshMessage}
                </span>
              ) : null}
            </div>

            <PublicBetaOnboarding
              isFirstRun={isFirstRun}
              connectivityRefreshing={connectivityRefreshing}
              onOpenDemoPath={handleOpenDemoPath}
              onRefreshConnectivity={handleRefreshConnectivity}
            />

            <AccountLifecycleReadiness authReadiness={authReadiness} t={t} />
          </div>

          <div className="view-toggle" role="tablist" aria-label={t('aria.viewMode')}>
            <button
              type="button"
              className={`view-toggle-button ${viewMode === 'topology' ? 'active' : ''}`}
              onClick={() => setViewMode('topology')}
              role="tab"
              aria-selected={viewMode === 'topology'}
            >
              {t('view.topology')}
            </button>
            <button
              type="button"
              className={`view-toggle-button ${viewMode === 'architecture' ? 'active' : ''}`}
              onClick={() => setViewMode('architecture')}
              role="tab"
              aria-selected={viewMode === 'architecture'}
            >
              {t('view.architecture')}
            </button>
            <button
              type="button"
              className={`view-toggle-button ${viewMode === 'cost' ? 'active' : ''}`}
              onClick={() => setViewMode('cost')}
              role="tab"
              aria-selected={viewMode === 'cost'}
            >
              {t('view.cost')}
            </button>
            <button
              type="button"
              className={`view-toggle-button ${viewMode === 'simulation' ? 'active' : ''}`}
              onClick={() => setViewMode('simulation')}
              role="tab"
              aria-selected={viewMode === 'simulation'}
            >
              {t('view.simulation')}
            </button>
          </div>

          <button
            type="button"
            className="lang-toggle"
            onClick={toggleLocale}
            aria-label={t('aria.toggleLanguage')}
            data-testid="app-lang-toggle"
          >
            {t('lang.toggle')}
          </button>
        </div>
      </header>

      <ErrorBoundary labels={{
        eyebrow: t('error.eyebrow'),
        title: t('error.title'),
        subtext: t('error.subtext'),
        reload: t('error.reload'),
        devDetails: t('error.devDetails'),
      }}>
        <Suspense fallback={<LoadingShell loadingLabel={t('shell.loading')} />}>
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
      </ErrorBoundary>
    </>
  )
}
