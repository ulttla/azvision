import { Suspense, lazy, useState } from 'react'

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

type ViewMode = 'topology' | 'architecture' | 'cost'

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

  return (
    <>
      <header className="workspace-header-shell">
        <div className="workspace-header-inner">
          <div>
            <p className="eyebrow workspace-shell-eyebrow">AzVision Workspace</p>
            <h1 className="workspace-shell-title">Azure topology and architecture workspace</h1>
            <p className="subtext workspace-shell-subtext">
              Switch between topology exploration, presentation architecture, and cost triage.
            </p>
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
          </div>
        </div>
      </header>

      <Suspense fallback={<LoadingShell />}>
        {viewMode === 'topology' ? <TopologyPage /> : viewMode === 'architecture' ? <ArchitecturePage /> : <CostPage />}
      </Suspense>
    </>
  )
}
