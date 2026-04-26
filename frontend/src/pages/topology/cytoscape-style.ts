export const CYTOSCAPE_STYLE = [
  {
    selector: 'node',
    style: {
      'background-color': '#3b82f6',
      label: 'data(label)',
      color: '#dbeafe',
      'font-size': 11,
      'text-wrap': 'wrap',
      'text-max-width': 150,
      'text-valign': 'bottom',
      'text-margin-y': 6,
      'text-outline-width': 2,
      'text-outline-color': '#0f172a',
      width: 36,
      height: 36,
      'border-width': 1.5,
      'border-color': '#93c5fd',
    },
  },
  {
    selector: 'node[nodeType = "subscription"]',
    style: {
      shape: 'round-rectangle',
      width: 88,
      height: 34,
      'font-size': 12,
      'background-color': '#1d4ed8',
      'border-color': '#bfdbfe',
    },
  },
  {
    selector: 'node[nodeType = "resourcegroup"]',
    style: {
      shape: 'round-rectangle',
      width: 58,
      height: 58,
      'background-color': '#2563eb',
    },
  },
  {
    selector: 'node[nodeType = "resource"][resourceType = "Microsoft.Sql/managedInstances"]',
    style: {
      width: 48,
      height: 48,
      shape: 'round-rectangle',
    },
  },
  {
    selector: 'node[nodeType = "resource"][resourceType = "Microsoft.Sql/managedInstances/databases"]',
    style: {
      width: 28,
      height: 28,
      'font-size': 9,
      'text-max-width': 100,
    },
  },
  {
    selector: 'node[nodeType = "resource"][resourceCategory = "data"]',
    style: {
      shape: 'ellipse',
      'background-color': '#06b6d4',
    },
  },
  {
    selector: 'node[nodeType = "resource"][resourceCategory = "network"]',
    style: {
      shape: 'ellipse',
      'background-color': '#10b981',
    },
  },
  {
    selector: 'node[nodeType = "resource"][resourceCategory = "web"]',
    style: {
      shape: 'ellipse',
      'background-color': '#8b5cf6',
    },
  },
  {
    selector: 'node[nodeType = "resource"][resourceCategory = "compute"]',
    style: {
      shape: 'ellipse',
      'background-color': '#3b82f6',
    },
  },
  {
    selector: 'node[nodeType = "resource"][resourceCategory = "other"]',
    style: {
      shape: 'ellipse',
      'background-color': '#64748b',
    },
  },
  {
    selector: 'node[collapsedChildren > 0]',
    style: {
      'border-width': 3,
      'border-color': '#fbbf24',
    },
  },
  {
    selector: 'node[nodeType = "resource"][resourceType = "Microsoft.Sql/managedInstances"][compareGroup > 0]',
    style: {
      width: 58,
      height: 58,
      'border-width': 4,
      'border-color': 'data(compareColor)',
      'background-color': 'data(compareColor)',
    },
  },
  {
    selector: 'node[nodeType = "resource"][resourceType = "Microsoft.Sql/managedInstances/databases"][compareGroup > 0]',
    style: {
      width: 32,
      height: 32,
      'border-width': 3,
      'border-color': 'data(compareColor)',
      'background-color': 'data(compareColor)',
    },
  },
  {
    selector: 'node:parent',
    style: {
      shape: 'round-rectangle',
      'background-opacity': 0.12,
      'background-color': '#38bdf8',
      'border-width': 2,
      'border-style': 'dashed',
      'border-color': '#7dd3fc',
      padding: '26px',
      'text-valign': 'top',
      'text-margin-y': -8,
    },
  },
  {
    selector: 'node:parent[compareGroup > 0]',
    style: {
      'background-color': 'data(compareColor)',
      'border-color': 'data(compareColor)',
      'background-opacity': 0.12,
      'border-width': 3,
      padding: '34px',
    },
  },
  {
    selector: 'node[source = "manual"]',
    style: {
      shape: 'diamond',
      'background-color': '#f59e0b',
      'border-color': '#fde68a',
      color: '#fef3c7',
    },
  },
  {
    selector: 'edge',
    style: {
      width: 2,
      'line-color': '#64748b',
      'target-arrow-color': '#64748b',
      'target-arrow-shape': 'triangle',
      'curve-style': 'bezier',
      color: '#cbd5e1',
      'font-size': 9,
      'text-rotation': 'autorotate',
      'text-background-color': '#0f172a',
      'text-background-opacity': 0.86,
      'text-background-padding': 2,
    },
  },
  {
    selector: 'edge[relationType = "contains"]',
    style: {
      'line-color': '#64748b',
      'target-arrow-color': '#64748b',
    },
  },
  {
    selector: 'edge[compareGroup > 0]',
    style: {
      width: 3,
      'line-color': 'data(compareColor)',
      'target-arrow-color': 'data(compareColor)',
    },
  },
  {
    selector: 'edge[relationType = "manages"]',
    style: {
      'line-style': 'dashed',
      'line-color': '#a78bfa',
      'target-arrow-color': '#a78bfa',
    },
  },
  {
    selector: 'edge[relationType = "connects_to"]',
    style: {
      'line-style': 'dashed',
      'line-color': '#14b8a6',
      'target-arrow-color': '#14b8a6',
    },
  },
  {
    selector: 'edge[sourceKind = "azure-explicit"]',
    style: {
      width: 3,
      'line-style': 'solid',
      'line-color': '#38bdf8',
      'target-arrow-color': '#38bdf8',
    },
  },
  {
    selector: 'edge[relationType = "secures"]',
    style: {
      'line-style': 'dashed',
      'line-color': '#f59e0b',
      'target-arrow-color': '#f59e0b',
    },
  },
  {
    selector: 'edge[relationType = "routes"]',
    style: {
      'line-style': 'dotted',
      'line-color': '#22c55e',
      'target-arrow-color': '#22c55e',
    },
  },
  {
    selector: '.selected-node',
    style: {
      'border-width': 4,
      'border-color': '#f8fafc',
      'overlay-opacity': 0,
      'underlay-color': '#e0f2fe',
      'underlay-opacity': 0.2,
      'underlay-padding': 8,
    },
  },
  {
    selector: '.search-match',
    style: {
      'border-width': 3,
      'border-color': '#f472b6',
    },
  },
  {
    selector: '.search-active',
    style: {
      'border-width': 4,
      'border-color': '#f9a8d4',
    },
  },
  {
    selector: '.parent-path-node',
    style: {
      'border-width': 5,
      'border-color': '#67e8f9',
      'underlay-color': '#22d3ee',
      'underlay-opacity': 0.18,
      'underlay-padding': 12,
      color: '#ecfeff',
    },
  },
  {
    selector: '.parent-path-edge',
    style: {
      width: 7,
      'line-color': '#22d3ee',
      'target-arrow-color': '#22d3ee',
      label: 'data(pathLabel)',
      'font-size': 12,
      color: '#ecfeff',
      'font-weight': '700',
      'text-background-color': '#164e63',
      'text-background-opacity': 0.98,
      'text-background-padding': 5,
      'line-style': 'solid',
    },
  },
  {
    selector: '.selected-neighbor',
    style: {
      'border-width': 3,
      'border-color': '#7dd3fc',
    },
  },
  {
    selector: '.selected-edge',
    style: {
      width: 4,
      'line-color': '#38bdf8',
      'target-arrow-color': '#38bdf8',
      label: 'data(relationType)',
      'font-size': 10,
      color: '#e0f2fe',
      'text-background-color': '#0f172a',
      'text-background-opacity': 0.92,
      'text-background-padding': 3,
    },
  },
  {
    selector: '.hovered-node',
    style: {
      'border-width': 3,
      'border-color': '#fef08a',
    },
  },
  {
    selector: '.hovered-neighbor',
    style: {
      'border-width': 2,
      'border-color': '#fde68a',
    },
  },
  {
    selector: '.hovered-edge',
    style: {
      width: 4,
      'line-color': '#facc15',
      'target-arrow-color': '#facc15',
      label: 'data(relationType)',
    },
  },
  {
    selector: '.faded',
    style: {
      opacity: 0.22,
    },
  },
] as any
