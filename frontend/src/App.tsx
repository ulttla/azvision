import { Suspense, lazy } from 'react'

const TopologyPage = lazy(async () => {
  const module = await import('./pages/TopologyPage')
  return { default: module.TopologyPage }
})

export default function App() {
  return (
    <Suspense fallback={<main className="page-shell"><section className="panel-card"><p>Loading topology workspace...</p></section></main>}>
      <TopologyPage />
    </Suspense>
  )
}
