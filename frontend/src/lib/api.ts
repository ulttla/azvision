export type Workspace = {
  id: string
  name: string
  company_name?: string
  description?: string
}

export type InventorySubscription = {
  subscription_id?: string
  display_name?: string
  state?: string | null
  tenant_id?: string | null
  source?: string
}

export type InventoryResourceGroup = {
  subscription_id?: string
  name?: string
  location?: string | null
  id?: string
  managed_by?: string | null
  tags?: Record<string, string>
  source?: string
}

export type InventoryResource = {
  subscription_id?: string
  resource_group?: string | null
  name?: string
  type?: string | null
  kind?: string | null
  location?: string | null
  id?: string
  tags?: Record<string, string>
  source?: string
}

export type InventoryListResponse<T> = {
  workspace_id: string
  subscription_id?: string | null
  resource_group_name?: string | null
  mode?: string
  warning?: string | null
  status?: string
  message?: string
  items: T[]
}

export type InventorySummaryResponse = {
  workspace_id: string
  subscription_id?: string | null
  resource_group_name?: string | null
  mode?: string
  warning?: string | null
  status?: string
  message?: string
  summary: {
    subscription_count: number
    resource_group_count: number
    resource_count: number
  }
  items: {
    subscriptions: InventorySubscription[]
    resource_groups: InventoryResourceGroup[]
    resources: InventoryResource[]
  }
}

export type TopologyChildSummary = {
  total: number
  type_counts: Record<string, number>
  sample_names?: string[]
  collapsed?: boolean
  expanded?: boolean
}

export type TopologyNode = {
  node_key: string
  node_type: string
  node_ref: string
  display_name: string
  source: string
  confidence: number
  subscription_id?: string
  resource_group?: string
  resource_type?: string
  kind?: string | null
  location?: string | null
  managed_by?: string | null
  parent_resource_id?: string | null
  state?: string | null
  tenant_id?: string | null
  tags?: Record<string, string>
  child_summary?: TopologyChildSummary | null
  is_expanded?: boolean
}

export type TopologyEdge = {
  source_node_key: string
  target_node_key: string
  relation_type: string
  relation_category?: string
  source: string
  confidence: number
}

export type TopologySummary = {
  subscription_count: number
  resource_group_count: number
  resource_count: number
  hidden_resource_count?: number
  node_count: number
  edge_count: number
  relation_counts?: Record<string, number>
}

export type TopologyResponse = {
  workspace_id: string
  generated_at: string
  mode?: string
  options?: {
    include_network_inference?: boolean
    collapse_managed_instance_children?: boolean
    expanded_node_ref?: string | null
    resource_group_name?: string | null
  }
  summary?: TopologySummary
  status?: string
  message?: string
  nodes: TopologyNode[]
  edges: TopologyEdge[]
}

export type TopologyNodeDetail = {
  workspace_id: string
  node_key: string
  node_type: string
  node_ref: string
  display_name: string
  source: string
  confidence: number
  status?: string
  message?: string
  details?: Record<string, unknown>
}

export type ExportItem = {
  id: string
  workspace_id: string
  format: string
  status: string
  output_path: string
  created_at: string
  size_bytes?: number
}

export type SnapshotApiRecord = {
  id: string
  workspace_id: string
  preset_version: number
  name: string
  note: string
  compare_refs: string[]
  cluster_children: boolean
  scope: 'visible' | 'child-only' | 'collapsed-preview'
  query: string
  selected_subscription_id: string
  resource_group_name: string
  topology_generated_at: string
  visible_node_count: number
  loaded_node_count: number
  edge_count: number
  has_thumbnail?: boolean
  thumbnail_data_url?: string  // absent in list responses; only present on single-record GET
  captured_at: string
  created_at: string
  updated_at: string
  last_restored_at: string
  restore_count: number
  is_pinned: boolean
  archived_at: string
}

export type SnapshotApiCreateRequest = {
  preset_version: number
  name: string
  note: string
  compare_refs: string[]
  cluster_children: boolean
  scope: 'visible' | 'child-only' | 'collapsed-preview'
  query: string
  selected_subscription_id: string
  resource_group_name: string
  topology_generated_at: string
  visible_node_count: number
  loaded_node_count: number
  edge_count: number
  thumbnail_data_url: string
  /** Original capture timestamp. When provided (e.g. on local→server import) the
   *  server preserves it instead of using the current time. */
  captured_at?: string
}

export type SnapshotApiUpdateRequest = {
  name?: string
  note?: string
  is_pinned?: boolean
  archived?: boolean
}

export type SnapshotListSortBy = 'updated_at' | 'captured_at' | 'last_restored_at'
export type SnapshotListSortOrder = 'asc' | 'desc'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1'

export type ApiErrorDetail = {
  ok?: boolean
  status?: string
  message?: string
}

class ApiError extends Error {
  readonly status: number
  readonly detail: ApiErrorDetail

  constructor(status: number, detail: ApiErrorDetail) {
    const message = detail.message || `API request failed: ${status}`
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, init)

  if (!response.ok) {
    let detail: ApiErrorDetail = {}
    try {
      detail = await response.json()
    } catch {
      // body was not JSON – keep empty detail
    }
    throw new ApiError(response.status, detail)
  }

  return response.json() as Promise<T>
}

export async function getWorkspaces(): Promise<Workspace[]> {
  const data = await fetchJson<{ items: Workspace[] }>('/workspaces')
  return data.items
}

export async function getWorkspaceSubscriptions(
  workspaceId: string,
): Promise<InventoryListResponse<InventorySubscription>> {
  return fetchJson<InventoryListResponse<InventorySubscription>>(
    `/workspaces/${workspaceId}/subscriptions`,
  )
}

export async function getWorkspaceResourceGroups(
  workspaceId: string,
  options?: {
    subscriptionId?: string
    limit?: number
  },
): Promise<InventoryListResponse<InventoryResourceGroup>> {
  const search = new URLSearchParams()

  if (options?.subscriptionId) {
    search.set('subscription_id', options.subscriptionId)
  }
  if (options?.limit) {
    search.set('limit', String(options.limit))
  }

  const query = search.toString()
  return fetchJson<InventoryListResponse<InventoryResourceGroup>>(
    `/workspaces/${workspaceId}/resource-groups${query ? `?${query}` : ''}`,
  )
}

export async function getWorkspaceResources(
  workspaceId: string,
  options?: {
    subscriptionId?: string
    resourceGroupName?: string
    limit?: number
  },
): Promise<InventoryListResponse<InventoryResource>> {
  const search = new URLSearchParams()

  if (options?.subscriptionId) {
    search.set('subscription_id', options.subscriptionId)
  }
  if (options?.resourceGroupName) {
    search.set('resource_group_name', options.resourceGroupName)
  }
  if (options?.limit) {
    search.set('limit', String(options.limit))
  }

  const query = search.toString()
  return fetchJson<InventoryListResponse<InventoryResource>>(
    `/workspaces/${workspaceId}/resources${query ? `?${query}` : ''}`,
  )
}

export async function getWorkspaceInventorySummary(
  workspaceId: string,
  options?: {
    subscriptionId?: string
    resourceGroupName?: string
    resourceGroupLimit?: number
    resourceLimit?: number
  },
): Promise<InventorySummaryResponse> {
  const search = new URLSearchParams()

  if (options?.subscriptionId) {
    search.set('subscription_id', options.subscriptionId)
  }
  if (options?.resourceGroupName) {
    search.set('resource_group_name', options.resourceGroupName)
  }
  if (options?.resourceGroupLimit) {
    search.set('resource_group_limit', String(options.resourceGroupLimit))
  }
  if (options?.resourceLimit) {
    search.set('resource_limit', String(options.resourceLimit))
  }

  const query = search.toString()
  return fetchJson<InventorySummaryResponse>(
    `/workspaces/${workspaceId}/inventory-summary${query ? `?${query}` : ''}`,
  )
}

export async function getTopology(
  workspaceId: string,
  options?: {
    subscriptionId?: string
    resourceGroupName?: string
    resourceGroupLimit?: number
    resourceLimit?: number
    includeNetworkInference?: boolean
    collapseManagedInstanceChildren?: boolean
    expandedNodeRef?: string
  },
): Promise<TopologyResponse> {
  const search = new URLSearchParams()

  if (options?.subscriptionId) {
    search.set('subscription_id', options.subscriptionId)
  }
  if (options?.resourceGroupName) {
    search.set('resource_group_name', options.resourceGroupName)
  }
  if (options?.resourceGroupLimit) {
    search.set('resource_group_limit', String(options.resourceGroupLimit))
  }
  if (options?.resourceLimit) {
    search.set('resource_limit', String(options.resourceLimit))
  }
  if (options?.includeNetworkInference !== undefined) {
    search.set('include_network_inference', String(options.includeNetworkInference))
  }
  if (options?.collapseManagedInstanceChildren !== undefined) {
    search.set(
      'collapse_managed_instance_children',
      String(options.collapseManagedInstanceChildren),
    )
  }
  if (options?.expandedNodeRef) {
    search.set('expanded_node_ref', options.expandedNodeRef)
  }

  const query = search.toString()
  return fetchJson<TopologyResponse>(
    `/workspaces/${workspaceId}/topology${query ? `?${query}` : ''}`,
  )
}

export async function getTopologyNodeDetail(
  workspaceId: string,
  nodeType: string,
  nodeRef: string,
  options?: {
    subscriptionId?: string
    resourceGroupName?: string
  },
): Promise<TopologyNodeDetail> {
  const search = new URLSearchParams({
    node_type: nodeType,
    node_ref: nodeRef,
  })

  if (options?.subscriptionId) {
    search.set('subscription_id', options.subscriptionId)
  }
  if (options?.resourceGroupName) {
    search.set('resource_group_name', options.resourceGroupName)
  }

  return fetchJson<TopologyNodeDetail>(
    `/workspaces/${workspaceId}/topology/node-detail?${search.toString()}`,
  )
}

export async function createExport(
  workspaceId: string,
  format: 'png' | 'pdf',
  imageDataUrl: string,
): Promise<ExportItem> {
  return fetchJson<ExportItem>(`/workspaces/${workspaceId}/exports`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      format,
      image_data_url: imageDataUrl,
    }),
  })
}

/** @deprecated Use createExport instead */
export const createPngExport = (workspaceId: string, imageDataUrl: string) =>
  createExport(workspaceId, 'png', imageDataUrl)

export async function getAuthConfigCheck(): Promise<{
  auth_ready: boolean
  checks: Record<string, boolean>
  note: string
}> {
  return fetchJson('/auth/config-check')
}

export async function getTopologySnapshots(
  workspaceId: string,
  options?: {
    sortBy?: SnapshotListSortBy
    sortOrder?: SnapshotListSortOrder
    includeArchived?: boolean
    pinnedFirst?: boolean
  },
): Promise<SnapshotApiRecord[]> {
  const search = new URLSearchParams()

  if (options?.sortBy) {
    search.set('sort_by', options.sortBy)
  }
  if (options?.sortOrder) {
    search.set('sort_order', options.sortOrder)
  }
  if (options?.includeArchived !== undefined) {
    search.set('include_archived', String(options.includeArchived))
  }
  if (options?.pinnedFirst !== undefined) {
    search.set('pinned_first', String(options.pinnedFirst))
  }

  const query = search.toString()
  const data = await fetchJson<{ items: SnapshotApiRecord[] }>(
    `/workspaces/${workspaceId}/snapshots${query ? `?${query}` : ''}`,
  )
  return data.items
}

export async function createTopologySnapshot(
  workspaceId: string,
  payload: SnapshotApiCreateRequest,
): Promise<SnapshotApiRecord> {
  return fetchJson<SnapshotApiRecord>(`/workspaces/${workspaceId}/snapshots`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
}

export async function getTopologySnapshot(
  workspaceId: string,
  snapshotId: string,
): Promise<SnapshotApiRecord> {
  return fetchJson<SnapshotApiRecord>(`/workspaces/${workspaceId}/snapshots/${snapshotId}`)
}

export async function updateTopologySnapshot(
  workspaceId: string,
  snapshotId: string,
  payload: SnapshotApiUpdateRequest,
): Promise<SnapshotApiRecord> {
  return fetchJson<SnapshotApiRecord>(`/workspaces/${workspaceId}/snapshots/${snapshotId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
}

export async function recordTopologySnapshotRestoreEvent(
  workspaceId: string,
  snapshotId: string,
): Promise<SnapshotApiRecord> {
  return fetchJson<SnapshotApiRecord>(`/workspaces/${workspaceId}/snapshots/${snapshotId}/restore-events`, {
    method: 'POST',
  })
}

export async function deleteTopologySnapshot(workspaceId: string, snapshotId: string): Promise<void> {
  await fetchJson(`/workspaces/${workspaceId}/snapshots/${snapshotId}`, {
    method: 'DELETE',
  })
}

// ── Manual Modeling ──────────────────────────────────────────────

export type ManualNode = {
  id: string
  manual_ref: string
  workspace_id: string
  display_name: string
  manual_type: string
  vendor?: string | null
  environment?: string | null
  notes?: string | null
  source: string
  confidence: number
  node_key?: string
  node_type?: string
  node_ref?: string
}

export type ManualEdge = {
  id: string
  manual_edge_ref: string
  workspace_id: string
  source_node_key: string
  target_node_key: string
  relation_type: string
  notes?: string | null
  source: string
  confidence: number
}

export type ManualListResponse<T> = {
  ok?: boolean
  workspace_id?: string
  status?: string
  message?: string
  items: T[]
}

export type CreateManualNodeRequest = {
  manual_ref?: string
  display_name: string
  manual_type?: string
  vendor?: string
  environment?: string
  notes?: string
  confidence?: number
}

export type CreateManualEdgeRequest = {
  manual_edge_ref?: string
  source_node_key: string
  target_node_key: string
  relation_type?: string
  notes?: string
  confidence?: number
}

export type UpdateManualNodeRequest = {
  display_name?: string
  manual_type?: string
  vendor?: string
  environment?: string
  notes?: string
  confidence?: number
}

export type UpdateManualEdgeRequest = {
  source_node_key?: string
  target_node_key?: string
  relation_type?: string
  notes?: string
  confidence?: number
}

function unwrapManualList<T>(data: T[] | ManualListResponse<T>): T[] {
  return Array.isArray(data) ? data : data.items
}

export async function listManualNodes(workspaceId: string): Promise<ManualNode[]> {
  const data = await fetchJson<ManualNode[] | ManualListResponse<ManualNode>>(
    `/workspaces/${workspaceId}/topology/manual-nodes`,
  )
  return unwrapManualList(data)
}

export async function createManualNode(
  workspaceId: string,
  payload: CreateManualNodeRequest,
): Promise<ManualNode & { status: string }> {
  return fetchJson(`/workspaces/${workspaceId}/topology/manual-nodes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function updateManualNode(
  workspaceId: string,
  manualNodeRef: string,
  payload: UpdateManualNodeRequest,
): Promise<ManualNode & { status: string }> {
  return fetchJson(`/workspaces/${workspaceId}/topology/manual-nodes/${manualNodeRef}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function deleteManualNode(workspaceId: string, manualNodeRef: string): Promise<void> {
  await fetchJson(`/workspaces/${workspaceId}/topology/manual-nodes/${manualNodeRef}`, {
    method: 'DELETE',
  })
}

export async function listManualEdges(workspaceId: string): Promise<ManualEdge[]> {
  const data = await fetchJson<ManualEdge[] | ManualListResponse<ManualEdge>>(
    `/workspaces/${workspaceId}/topology/manual-edges`,
  )
  return unwrapManualList(data)
}

export async function createManualEdge(
  workspaceId: string,
  payload: CreateManualEdgeRequest,
): Promise<ManualEdge & { status: string }> {
  return fetchJson(`/workspaces/${workspaceId}/topology/manual-edges`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function updateManualEdge(
  workspaceId: string,
  manualEdgeRef: string,
  payload: UpdateManualEdgeRequest,
): Promise<ManualEdge & { status: string }> {
  return fetchJson(`/workspaces/${workspaceId}/topology/manual-edges/${manualEdgeRef}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function deleteManualEdge(workspaceId: string, manualEdgeRef: string): Promise<void> {
  await fetchJson(`/workspaces/${workspaceId}/topology/manual-edges/${manualEdgeRef}`, {
    method: 'DELETE',
  })
}
