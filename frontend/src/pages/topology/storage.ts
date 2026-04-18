import type { Core } from 'cytoscape'

import {
  createTopologySnapshot,
  deleteTopologySnapshot,
  getTopologySnapshots,
  recordTopologySnapshotRestoreEvent,
  type SnapshotApiCreateRequest,
  type SnapshotApiRecord,
  updateTopologySnapshot,
} from '../../lib/api'
import {
  SNAPSHOT_STORAGE_WARN_BYTES,
  SNAPSHOT_THUMBNAIL_MAX_LENGTH,
  TOPOLOGY_PRESET_STORAGE_KEY,
  TOPOLOGY_PRESET_VERSION,
  TOPOLOGY_SNAPSHOT_STORAGE_KEY,
  type ImportedPresetPayload,
  type ImportedSnapshotPayload,
  type SavedTopologyPreset,
  type SavedTopologySnapshot,
  type SearchScope,
  type SnapshotStorageKind,
  type TopologyPresetState,
  type TopologySnapshotState,
  UI_TEXT,
} from './model'

export type SnapshotStorageMode = 'local' | 'server'

export type SnapshotStorageCreateResult = {
  snapshot: SavedTopologySnapshot
  warning?: string
}

export type SnapshotImportSummary = {
  importedCount: number
  skippedCount: number
  failedCount: number
  warning?: string
}

const TOPOLOGY_SNAPSHOT_NOTICE_ACK_KEY = 'azvision.topology.snapshot-notice-ack.v1'

function normalizeSnapshotStorageKind(value: unknown): SnapshotStorageKind {
  return value === 'server' ? 'server' : 'local'
}

function readSnapshotNoticeAckMap() {
  if (typeof window === 'undefined') {
    return {}
  }

  try {
    const raw = window.localStorage.getItem(TOPOLOGY_SNAPSHOT_NOTICE_ACK_KEY)
    if (!raw) {
      return {}
    }

    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

function writeSnapshotNoticeAckMap(value: Record<string, string>) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(TOPOLOGY_SNAPSHOT_NOTICE_ACK_KEY, JSON.stringify(value))
}

export function createSnapshotNoticeFingerprint(snapshots: SavedTopologySnapshot[]) {
  return JSON.stringify(
    [...snapshots]
      .map((snapshot) => ({
        id: snapshot.id,
        name: snapshot.name,
        updatedAt: snapshot.updatedAt,
        createdAt: snapshot.createdAt,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  )
}

export function getSnapshotNoticeAcknowledgedFingerprint(workspaceId: string) {
  const ackMap = readSnapshotNoticeAckMap()
  return typeof ackMap[workspaceId] === 'string' ? ackMap[workspaceId] : ''
}

export function setSnapshotNoticeAcknowledgedFingerprint(workspaceId: string, fingerprint: string) {
  if (!workspaceId) {
    return
  }

  const ackMap = readSnapshotNoticeAckMap()
  ackMap[workspaceId] = fingerprint
  writeSnapshotNoticeAckMap(ackMap)
}

export interface SnapshotStorageProvider {
  mode: SnapshotStorageMode
  list(workspaceId: string): Promise<SavedTopologySnapshot[]>
  create(workspaceId: string, snapshot: SavedTopologySnapshot): Promise<SnapshotStorageCreateResult>
  update(
    workspaceId: string,
    snapshotId: string,
    patch: { name?: string; note?: string; isPinned?: boolean; archived?: boolean },
  ): Promise<SavedTopologySnapshot>
  recordRestore(workspaceId: string, snapshotId: string): Promise<SavedTopologySnapshot>
  remove(workspaceId: string, snapshotId: string): Promise<void>
}

let topologySnapshotStorageWarning = ''

export function consumeTopologySnapshotStorageWarning() {
  const warning = topologySnapshotStorageWarning
  topologySnapshotStorageWarning = ''
  return warning
}

export function createEmptyTopologyPresetState(): TopologyPresetState {
  return {
    presetVersion: TOPOLOGY_PRESET_VERSION,
    workspaceId: '',
    compareRefs: [],
    clusterChildren: true,
    scope: 'visible',
    query: '',
    selectedSubscriptionId: '',
    resourceGroupName: '',
  }
}

export function normalizeSearchScope(value?: string | null): SearchScope {
  return value === 'child-only' || value === 'collapsed-preview' || value === 'visible'
    ? value
    : 'visible'
}

export function sanitizePresetState(state: Partial<TopologyPresetState>): TopologyPresetState {
  return {
    presetVersion: TOPOLOGY_PRESET_VERSION,
    workspaceId: String(state.workspaceId ?? '').trim(),
    compareRefs: Array.from(
      new Set((state.compareRefs ?? []).filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))),
    ),
    clusterChildren: state.clusterChildren !== false,
    scope: normalizeSearchScope(state.scope),
    query: String(state.query ?? ''),
    selectedSubscriptionId: String(state.selectedSubscriptionId ?? '').trim(),
    resourceGroupName: String(state.resourceGroupName ?? '').trim(),
  }
}

export function loadSavedTopologyPresets(): SavedTopologyPreset[] {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const raw = window.localStorage.getItem(TOPOLOGY_PRESET_STORAGE_KEY)
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .map((item) => {
        if (typeof item !== 'object' || item === null) {
          return null
        }

        const base = sanitizePresetState(item as Partial<TopologyPresetState>)
        return {
          id: String((item as { id?: unknown }).id ?? ''),
          name: String((item as { name?: unknown }).name ?? '').trim(),
          createdAt: String((item as { createdAt?: unknown }).createdAt ?? ''),
          updatedAt: String((item as { updatedAt?: unknown }).updatedAt ?? ''),
          ...base,
        } satisfies SavedTopologyPreset
      })
      .filter((item): item is SavedTopologyPreset => Boolean(item?.id) && Boolean(item?.name))
  } catch {
    return []
  }
}

export function persistSavedTopologyPresets(presets: SavedTopologyPreset[]) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(TOPOLOGY_PRESET_STORAGE_KEY, JSON.stringify(presets))
}

function sanitizeSnapshotCount(value: unknown) {
  const numericValue = Number(value ?? 0)
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return 0
  }

  return Math.floor(numericValue)
}

function sanitizeSnapshotTimestamp(value: unknown) {
  return String(value ?? '').trim()
}

function sanitizeSnapshotBoolean(value: unknown) {
  return value === true
}

export function sanitizeSnapshotThumbnailDataUrl(value: unknown) {
  const thumbnailDataUrl = String(value ?? '').trim()
  if (!thumbnailDataUrl) {
    return ''
  }

  if (!thumbnailDataUrl.startsWith('data:image/')) {
    return ''
  }

  if (thumbnailDataUrl.length > SNAPSHOT_THUMBNAIL_MAX_LENGTH) {
    return ''
  }

  return thumbnailDataUrl
}

export function estimateSerializedBytes(value: unknown) {
  try {
    return JSON.stringify(value).length
  } catch {
    return 0
  }
}

export function sanitizeSnapshotState(state: Partial<TopologySnapshotState>): TopologySnapshotState {
  const base = sanitizePresetState(state)

  return {
    ...base,
    note: String(state.note ?? '').trim(),
    topologyGeneratedAt: String(state.topologyGeneratedAt ?? ''),
    visibleNodeCount: sanitizeSnapshotCount(state.visibleNodeCount),
    loadedNodeCount: sanitizeSnapshotCount(state.loadedNodeCount),
    edgeCount: sanitizeSnapshotCount(state.edgeCount),
    thumbnailDataUrl: sanitizeSnapshotThumbnailDataUrl(state.thumbnailDataUrl),
  }
}

export function buildSnapshotThumbnailDataUrl(cy: Core | null) {
  if (!cy) {
    return ''
  }

  try {
    return cy.jpg({
      full: false,
      scale: 0.5,
      quality: 0.6,
      bg: '#0b1220',
    })
  } catch {
    return ''
  }
}

export function loadSavedTopologySnapshots(): SavedTopologySnapshot[] {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const raw = window.localStorage.getItem(TOPOLOGY_SNAPSHOT_STORAGE_KEY)
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .map((item) => {
        if (typeof item !== 'object' || item === null) {
          return null
        }

        const base = sanitizeSnapshotState(item as Partial<TopologySnapshotState>)
        return {
          id: String((item as { id?: unknown }).id ?? ''),
          name: String((item as { name?: unknown }).name ?? '').trim(),
          capturedAt: sanitizeSnapshotTimestamp((item as { capturedAt?: unknown }).capturedAt) || String((item as { createdAt?: unknown }).createdAt ?? ''),
          createdAt: String((item as { createdAt?: unknown }).createdAt ?? ''),
          updatedAt: String((item as { updatedAt?: unknown }).updatedAt ?? ''),
          lastRestoredAt: sanitizeSnapshotTimestamp((item as { lastRestoredAt?: unknown }).lastRestoredAt),
          restoreCount: sanitizeSnapshotCount((item as { restoreCount?: unknown }).restoreCount),
          isPinned: sanitizeSnapshotBoolean((item as { isPinned?: unknown }).isPinned),
          archivedAt: sanitizeSnapshotTimestamp((item as { archivedAt?: unknown }).archivedAt),
          storageKind: normalizeSnapshotStorageKind((item as { storageKind?: unknown }).storageKind),
          ...base,
        } satisfies SavedTopologySnapshot
      })
      .filter((item): item is SavedTopologySnapshot => Boolean(item?.id) && Boolean(item?.name))
  } catch {
    topologySnapshotStorageWarning = UI_TEXT.snapshotStorageReadFailed
    return []
  }
}

export function persistSavedTopologySnapshots(snapshots: SavedTopologySnapshot[]) {
  if (typeof window === 'undefined') {
    return {
      ok: true as const,
      estimatedBytes: 0,
    }
  }

  const serializedSnapshots = JSON.stringify(snapshots)

  try {
    window.localStorage.setItem(TOPOLOGY_SNAPSHOT_STORAGE_KEY, serializedSnapshots)
    return {
      ok: true as const,
      estimatedBytes: serializedSnapshots.length,
    }
  } catch (error) {
    return {
      ok: false as const,
      estimatedBytes: serializedSnapshots.length,
      message:
        error instanceof DOMException && error.name === 'QuotaExceededError'
          ? UI_TEXT.snapshotStorageQuotaExceeded
          : UI_TEXT.snapshotStorageWriteFailed,
    }
  }
}

export function arePresetStatesEqual(left: TopologyPresetState, right: TopologyPresetState) {
  const normalizedLeft = sanitizePresetState(left)
  const normalizedRight = sanitizePresetState(right)

  return (
    normalizedLeft.workspaceId === normalizedRight.workspaceId &&
    normalizedLeft.clusterChildren === normalizedRight.clusterChildren &&
    normalizedLeft.scope === normalizedRight.scope &&
    normalizedLeft.query === normalizedRight.query &&
    normalizedLeft.selectedSubscriptionId === normalizedRight.selectedSubscriptionId &&
    normalizedLeft.resourceGroupName === normalizedRight.resourceGroupName &&
    normalizedLeft.compareRefs.length === normalizedRight.compareRefs.length &&
    normalizedLeft.compareRefs.every((ref, index) => ref === normalizedRight.compareRefs[index])
  )
}

export function createPresetId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function createUniquePresetName(baseName: string, existingNames: Set<string>) {
  const normalizedBaseName = baseName.trim() || UI_TEXT.defaultPresetName
  if (!existingNames.has(normalizedBaseName)) {
    existingNames.add(normalizedBaseName)
    return normalizedBaseName
  }

  let index = 2
  while (existingNames.has(`${normalizedBaseName} (${index})`)) {
    index += 1
  }

  const nextName = `${normalizedBaseName} (${index})`
  existingNames.add(nextName)
  return nextName
}

export function normalizeImportedPresetPayload(raw: unknown) {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(UI_TEXT.importInvalidJson)
  }

  const payload = raw as { presetVersion?: unknown; presets?: unknown }
  const payloadVersion =
    payload.presetVersion === undefined ? TOPOLOGY_PRESET_VERSION : Number(payload.presetVersion)
  if (!Number.isFinite(payloadVersion)) {
    throw new Error(UI_TEXT.importInvalidJson)
  }
  if (payloadVersion > TOPOLOGY_PRESET_VERSION) {
    throw new Error(UI_TEXT.importUnsupportedVersion)
  }

  if (!Array.isArray(payload.presets)) {
    throw new Error(UI_TEXT.importInvalidJson)
  }

  return payload.presets
    .map((item) => {
      if (typeof item !== 'object' || item === null) {
        return null
      }

      const preset = item as Partial<SavedTopologyPreset>
      const base = sanitizePresetState(preset)
      return {
        id: createPresetId(),
        name: String(preset.name ?? '').trim(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...base,
      } satisfies SavedTopologyPreset
    })
    .filter((item): item is SavedTopologyPreset => Boolean(item?.name) && Boolean(item?.workspaceId))
}

export function normalizeImportedSnapshotPayload(raw: unknown) {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(UI_TEXT.importInvalidSnapshotJson)
  }

  const payload = raw as { presetVersion?: unknown; snapshots?: unknown }
  const payloadVersion =
    payload.presetVersion === undefined ? TOPOLOGY_PRESET_VERSION : Number(payload.presetVersion)
  if (!Number.isFinite(payloadVersion)) {
    throw new Error(UI_TEXT.importInvalidSnapshotJson)
  }
  if (payloadVersion > TOPOLOGY_PRESET_VERSION) {
    throw new Error(UI_TEXT.importUnsupportedVersion)
  }

  if (!Array.isArray(payload.snapshots)) {
    throw new Error(UI_TEXT.importInvalidSnapshotJson)
  }

  return payload.snapshots
    .map((item) => {
      if (typeof item !== 'object' || item === null) {
        return null
      }

      const snapshot = item as Partial<SavedTopologySnapshot>
      const base = sanitizeSnapshotState(snapshot)
      const now = new Date().toISOString()
      const nextSnapshot: SavedTopologySnapshot = {
        id: createPresetId(),
        name: String(snapshot.name ?? '').trim(),
        capturedAt: sanitizeSnapshotTimestamp(snapshot.capturedAt) || String(snapshot.createdAt ?? '') || now,
        createdAt: now,
        updatedAt: now,
        lastRestoredAt: sanitizeSnapshotTimestamp(snapshot.lastRestoredAt),
        restoreCount: sanitizeSnapshotCount(snapshot.restoreCount),
        isPinned: sanitizeSnapshotBoolean(snapshot.isPinned),
        archivedAt: sanitizeSnapshotTimestamp(snapshot.archivedAt),
        storageKind: 'local',
        ...base,
      }

      return nextSnapshot
    })
    .filter((item): item is SavedTopologySnapshot => Boolean(item?.name) && Boolean(item?.workspaceId))
}

export function readTopologyPresetFromUrl(): TopologyPresetState {
  if (typeof window === 'undefined') {
    return createEmptyTopologyPresetState()
  }

  const search = new URLSearchParams(window.location.search)

  return sanitizePresetState({
    presetVersion: Number(search.get('pv') ?? TOPOLOGY_PRESET_VERSION),
    workspaceId: search.get('workspace') ?? '',
    compareRefs: search.getAll('mi').filter(Boolean),
    clusterChildren: search.get('cluster') !== '0',
    scope: normalizeSearchScope(search.get('scope')),
    query: search.get('q') ?? '',
    selectedSubscriptionId: search.get('sub') ?? '',
    resourceGroupName: search.get('rg') ?? '',
  })
}

export function writeTopologyPresetToUrl(state: TopologyPresetState) {
  if (typeof window === 'undefined') {
    return
  }

  const search = new URLSearchParams()
  search.set('pv', String(TOPOLOGY_PRESET_VERSION))

  if (state.workspaceId) {
    search.set('workspace', state.workspaceId)
  }
  if (state.query) {
    search.set('q', state.query)
  }
  if (state.scope !== 'visible') {
    search.set('scope', state.scope)
  }
  if (!state.clusterChildren) {
    search.set('cluster', '0')
  }
  if (state.selectedSubscriptionId) {
    search.set('sub', state.selectedSubscriptionId)
  }
  if (state.resourceGroupName) {
    search.set('rg', state.resourceGroupName)
  }
  for (const ref of state.compareRefs) {
    search.append('mi', ref)
  }

  const nextUrl = `${window.location.pathname}${search.toString() ? `?${search.toString()}` : ''}`
  window.history.replaceState({}, '', nextUrl)
}

export function shouldWarnForSnapshotStorage(bytes: number) {
  return bytes >= SNAPSHOT_STORAGE_WARN_BYTES
}

function mapSnapshotApiRecord(record: SnapshotApiRecord): SavedTopologySnapshot {
  const base = sanitizeSnapshotState({
    presetVersion: record.preset_version,
    workspaceId: record.workspace_id,
    compareRefs: record.compare_refs,
    clusterChildren: record.cluster_children,
    scope: record.scope,
    query: record.query,
    selectedSubscriptionId: record.selected_subscription_id,
    resourceGroupName: record.resource_group_name,
    note: record.note,
    topologyGeneratedAt: record.topology_generated_at,
    visibleNodeCount: record.visible_node_count,
    loadedNodeCount: record.loaded_node_count,
    edgeCount: record.edge_count,
    thumbnailDataUrl: record.thumbnail_data_url,
  })

  return {
    id: record.id,
    name: String(record.name ?? '').trim(),
    capturedAt: record.captured_at || record.created_at,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    lastRestoredAt: record.last_restored_at || '',
    restoreCount: sanitizeSnapshotCount(record.restore_count),
    isPinned: record.is_pinned === true,
    archivedAt: record.archived_at || '',
    storageKind: 'server',
    ...base,
  }
}

function toSnapshotApiCreateRequest(snapshot: SavedTopologySnapshot): SnapshotApiCreateRequest {
  const sanitizedSnapshot = sanitizeSnapshotState(snapshot)
  const capturedAt = sanitizeSnapshotTimestamp(snapshot.capturedAt)

  return {
    preset_version: sanitizedSnapshot.presetVersion,
    name: snapshot.name.trim() || UI_TEXT.defaultSnapshotName,
    note: sanitizedSnapshot.note,
    compare_refs: sanitizedSnapshot.compareRefs,
    cluster_children: sanitizedSnapshot.clusterChildren,
    scope: sanitizedSnapshot.scope,
    query: sanitizedSnapshot.query,
    selected_subscription_id: sanitizedSnapshot.selectedSubscriptionId,
    resource_group_name: sanitizedSnapshot.resourceGroupName,
    topology_generated_at: sanitizedSnapshot.topologyGeneratedAt,
    visible_node_count: sanitizedSnapshot.visibleNodeCount,
    loaded_node_count: sanitizedSnapshot.loadedNodeCount,
    edge_count: sanitizedSnapshot.edgeCount,
    thumbnail_data_url: sanitizedSnapshot.thumbnailDataUrl,
    ...(capturedAt ? { captured_at: capturedAt } : {}),
  }
}

export function loadLocalSnapshotsForWorkspace(workspaceId: string) {
  return loadSavedTopologySnapshots().filter((snapshot) => snapshot.workspaceId === workspaceId)
}

function buildSnapshotDedupKey(snapshot: SavedTopologySnapshot) {
  const normalizedSnapshot = sanitizeSnapshotState(snapshot)

  return JSON.stringify({
    name: String(snapshot.name ?? '').trim(),
    scope: normalizedSnapshot.scope,
    query: normalizedSnapshot.query,
    selectedSubscriptionId: normalizedSnapshot.selectedSubscriptionId,
    resourceGroupName: normalizedSnapshot.resourceGroupName,
    topologyGeneratedAt: normalizedSnapshot.topologyGeneratedAt,
    compareRefs: [...normalizedSnapshot.compareRefs].sort(),
    visibleNodeCount: normalizedSnapshot.visibleNodeCount,
    loadedNodeCount: normalizedSnapshot.loadedNodeCount,
    edgeCount: normalizedSnapshot.edgeCount,
  })
}

export async function importSnapshotsToStorage(
  workspaceId: string,
  snapshots: SavedTopologySnapshot[],
  provider: SnapshotStorageProvider,
  existingSnapshots: SavedTopologySnapshot[] = [],
): Promise<SnapshotImportSummary> {
  const seenKeys = new Set(existingSnapshots.map((snapshot) => buildSnapshotDedupKey(snapshot)))
  let warning = ''
  let importedCount = 0
  let skippedCount = 0
  let failedCount = 0

  for (const snapshot of snapshots) {
    const normalizedSnapshot: SavedTopologySnapshot = {
      ...snapshot,
      workspaceId,
      name: String(snapshot.name ?? '').trim(),
    }

    if (!normalizedSnapshot.name) {
      failedCount += 1
      continue
    }

    const dedupKey = buildSnapshotDedupKey(normalizedSnapshot)
    if (seenKeys.has(dedupKey)) {
      skippedCount += 1
      continue
    }

    try {
      const result = await provider.create(workspaceId, normalizedSnapshot)
      if (result.warning) {
        warning = result.warning
      }
      seenKeys.add(dedupKey)
      importedCount += 1
    } catch {
      failedCount += 1
    }
  }

  return {
    importedCount,
    skippedCount,
    failedCount,
    warning: warning || undefined,
  }
}

const localSnapshotStorageProvider: SnapshotStorageProvider = {
  mode: 'local',
  async list(workspaceId) {
    return loadLocalSnapshotsForWorkspace(workspaceId)
  },
  async create(workspaceId, snapshot) {
    const allSnapshots = loadSavedTopologySnapshots()
    const now = new Date().toISOString()
    const nextSnapshot = {
      ...snapshot,
      workspaceId,
      capturedAt: sanitizeSnapshotTimestamp(snapshot.capturedAt) || now,
      createdAt: snapshot.createdAt || now,
      updatedAt: snapshot.updatedAt || now,
      lastRestoredAt: sanitizeSnapshotTimestamp(snapshot.lastRestoredAt),
      restoreCount: sanitizeSnapshotCount(snapshot.restoreCount),
      isPinned: sanitizeSnapshotBoolean(snapshot.isPinned),
      archivedAt: sanitizeSnapshotTimestamp(snapshot.archivedAt),
      storageKind: 'local' as const,
    }
    const nextSnapshots = [nextSnapshot, ...allSnapshots]
    const persistResult = persistSavedTopologySnapshots(nextSnapshots)
    if (!persistResult.ok) {
      throw new Error(persistResult.message)
    }

    return {
      snapshot: nextSnapshot,
      warning: shouldWarnForSnapshotStorage(persistResult.estimatedBytes)
        ? UI_TEXT.snapshotStorageNearLimit
        : '',
    }
  },
  async update(workspaceId, snapshotId, patch) {
    const allSnapshots = loadSavedTopologySnapshots()
    const nextSnapshots = allSnapshots.map((snapshot) =>
      snapshot.id === snapshotId && snapshot.workspaceId === workspaceId
        ? {
            ...snapshot,
            ...patch,
            isPinned: patch.isPinned ?? snapshot.isPinned,
            archivedAt:
              patch.archived === undefined
                ? snapshot.archivedAt
                : patch.archived
                  ? new Date().toISOString()
                  : '',
            updatedAt: new Date().toISOString(),
          }
        : snapshot,
    )

    const updatedSnapshot = nextSnapshots.find(
      (snapshot) => snapshot.id === snapshotId && snapshot.workspaceId === workspaceId,
    )
    if (!updatedSnapshot) {
      throw new Error('Snapshot not found')
    }

    const persistResult = persistSavedTopologySnapshots(nextSnapshots)
    if (!persistResult.ok) {
      throw new Error(persistResult.message)
    }

    return updatedSnapshot
  },
  async recordRestore(workspaceId, snapshotId) {
    const allSnapshots = loadSavedTopologySnapshots()
    const nextSnapshots = allSnapshots.map((snapshot) =>
      snapshot.id === snapshotId && snapshot.workspaceId === workspaceId
        ? {
            ...snapshot,
            lastRestoredAt: new Date().toISOString(),
            restoreCount: sanitizeSnapshotCount(snapshot.restoreCount) + 1,
          }
        : snapshot,
    )

    const updatedSnapshot = nextSnapshots.find(
      (snapshot) => snapshot.id === snapshotId && snapshot.workspaceId === workspaceId,
    )
    if (!updatedSnapshot) {
      throw new Error('Snapshot not found')
    }

    const persistResult = persistSavedTopologySnapshots(nextSnapshots)
    if (!persistResult.ok) {
      throw new Error(persistResult.message)
    }

    return updatedSnapshot
  },
  async remove(workspaceId, snapshotId) {
    const allSnapshots = loadSavedTopologySnapshots()
    const nextSnapshots = allSnapshots.filter(
      (snapshot) => !(snapshot.id === snapshotId && snapshot.workspaceId === workspaceId),
    )

    const persistResult = persistSavedTopologySnapshots(nextSnapshots)
    if (!persistResult.ok) {
      throw new Error(persistResult.message)
    }
  },
}

const serverSnapshotStorageProvider: SnapshotStorageProvider = {
  mode: 'server',
  async list(workspaceId) {
    const snapshots = await getTopologySnapshots(workspaceId, {
      sortBy: 'last_restored_at',
      sortOrder: 'desc',
      includeArchived: true,
      pinnedFirst: true,
    })
    return snapshots.map(mapSnapshotApiRecord)
  },
  async create(workspaceId, snapshot) {
    const createdSnapshot = await createTopologySnapshot(workspaceId, toSnapshotApiCreateRequest(snapshot))
    return {
      snapshot: mapSnapshotApiRecord(createdSnapshot),
    }
  },
  async update(workspaceId, snapshotId, patch) {
    const updatedSnapshot = await updateTopologySnapshot(workspaceId, snapshotId, patch)
    return mapSnapshotApiRecord(updatedSnapshot)
  },
  async recordRestore(workspaceId, snapshotId) {
    const updatedSnapshot = await recordTopologySnapshotRestoreEvent(workspaceId, snapshotId)
    return mapSnapshotApiRecord(updatedSnapshot)
  },
  async remove(workspaceId, snapshotId) {
    await deleteTopologySnapshot(workspaceId, snapshotId)
  },
}

export function getSnapshotStorageMode(): SnapshotStorageMode {
  const configuredMode = String(import.meta.env.VITE_TOPOLOGY_SNAPSHOT_BACKEND ?? 'local').trim().toLowerCase()
  return configuredMode === 'server' ? 'server' : 'local'
}

export function createSnapshotStorageProvider(
  mode: SnapshotStorageMode = getSnapshotStorageMode(),
): SnapshotStorageProvider {
  return mode === 'server' ? serverSnapshotStorageProvider : localSnapshotStorageProvider
}
