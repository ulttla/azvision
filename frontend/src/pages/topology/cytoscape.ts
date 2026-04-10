let cytoscapeRuntimePromise: Promise<any> | null = null

export async function loadCytoscapeRuntime(): Promise<any> {
  if (!cytoscapeRuntimePromise) {
    cytoscapeRuntimePromise = Promise.all([import('cytoscape'), import('cytoscape-dagre')]).then(
      ([cytoscapeModule, dagreModule]) => {
        const cytoscapeFactory = cytoscapeModule.default
        cytoscapeFactory.use(dagreModule.default)
        return cytoscapeFactory
      },
    )
  }

  return cytoscapeRuntimePromise
}
