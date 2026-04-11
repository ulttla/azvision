import type { TopologyNode } from '../../lib/api'

export type CountItem = {
  key: string
  count: number
}

export type SearchResult = {
  node: TopologyNode
  score: number
  matchedFields: string[]
  matchedPreviewNames?: string[]
}

export type SearchResultGroup = {
  key: ResourceCategory
  label: string
  results: SearchResult[]
}

export type SearchScope = 'visible' | 'child-only' | 'collapsed-preview'

export type ResourceCategory = 'compute' | 'data' | 'network' | 'web' | 'other' | 'scope'
export type RelationCategory = 'structural' | 'network' | 'other'

export type ResourceFilterState = Record<ResourceCategory, boolean>
export type RelationFilterState = Record<RelationCategory, boolean>
export type RelationTypeFilterState = Record<string, boolean>

export const DEFAULT_RESOURCE_FILTERS: ResourceFilterState = {
  scope: true,
  compute: true,
  data: true,
  network: true,
  web: true,
  other: true,
}

export const DEFAULT_RELATION_FILTERS: RelationFilterState = {
  structural: true,
  network: true,
  other: true,
}

export const DEFAULT_RELATION_TYPE_FILTERS: RelationTypeFilterState = {
  contains: true,
  manages: true,
  connects_to: true,
  secures: true,
  routes: true,
}

export const SEARCH_GROUP_ORDER: ResourceCategory[] = ['data', 'network', 'web', 'compute', 'scope', 'other']
export const COMPARE_COLOR_PALETTE = ['#22d3ee', '#f59e0b', '#a78bfa', '#34d399', '#f472b6', '#f87171']
export const TOPOLOGY_PRESET_VERSION = 1
export const TOPOLOGY_PRESET_STORAGE_KEY = 'azvision.topology.presets.v1'
export const TOPOLOGY_SNAPSHOT_STORAGE_KEY = 'azvision.topology.snapshots.v1'
export const SNAPSHOT_STORAGE_WARN_BYTES = 3 * 1024 * 1024
export const SNAPSHOT_THUMBNAIL_MAX_LENGTH = 500 * 1024

export const UI_TEXT = {
  heroSubtext:
    'Dagre layout, network inference toggle, resource filters, managed instance child collapse, and on-demand expand are currently supported.',
  apiErrorPrefix: 'API connection error:',
  topologyErrorPrefix: 'Topology error:',
  loading: 'Loading...',
  exportSavedPrefix: 'Saved:',
  exportUnavailableNoGraph: 'No rendered topology is available to export yet.',
  exportUnavailableLoading: 'Topology is still loading. Wait until the graph finishes rendering before exporting.',
  exportUnavailableError: 'Resolve the topology error before exporting.',
  exportUnavailableEmpty: 'Load a topology view with visible graph data before exporting.',
  networkInferenceToggle: 'Load network inference',
  noCompareTargets: 'No compare targets selected',
  compareHint: 'You can expand and compare multiple managed instances from collapsed preview results or the detail panel.',
  resourceFilterHint: 'Subscription, resource group, and manual nodes always stay visible.',
  searchTip:
    'Tip: press Esc to clear selection, double-click a node to focus it, and expand child databases from the SQL Managed Instance detail panel.',
  resourceGroupFocusedHint: (name: string) => `Only resources in ${name} are currently being loaded from the server`,
  resourceGroupLoadHint: 'You can load only this resource group from the server.',
  parentManagedInstanceHint: 'Jump back to the parent managed instance while exploring child nodes.',
  managedInstanceExpandedHint: 'Keep focus centered around the selected node after expansion.',
  managedInstanceCollapsedHint: 'Expand to render child database nodes directly on the canvas.',
  noProjectedDetails: 'No projected details available',
  noSelectedNode: 'No node selected',
  savedPresetsTitle: 'Saved Presets',
  presetNamePlaceholder: 'Preset name (optional)',
  defaultPresetName: 'Preset',
  saveCurrentPreset: 'Save current preset',
  noSavedPresets: 'No saved presets yet',
  presetHint: 'Presets save reusable compare, search, and RG focus settings without notes or thumbnails.',
  presetGuideTitle: 'Best for repeatable workspace setup',
  presetGuideBody: 'Use presets when you want the same compare lane, search scope, and RG focus again later.',
  loadPreset: 'Load',
  renamePreset: 'Rename',
  deletePreset: 'Delete',
  activePresetBadge: 'Active',
  exportPresets: 'Export JSON',
  importPresets: 'Import JSON',
  savedPresetPrefix: 'Saved preset:',
  loadedPresetPrefix: 'Loaded preset:',
  renamedPresetPrefix: 'Renamed preset:',
  deletedPresetPrefix: 'Deleted preset:',
  exportedPresetsPrefix: 'Exported presets:',
  importedPresetsPrefix: 'Imported presets:',
  importInvalidJson: 'Invalid preset JSON file',
  importUnsupportedVersion: 'Unsupported preset payload version',
  importNoValidPresets: 'No valid presets found in the imported file',
  presetNamePrompt: 'Preset name',
  presetRenamePrompt: 'Rename preset',
  presetDeleteConfirm: (name: string) => `Delete preset "${name}"?`,
  presetMeta: (scope: string, compareCount: number, workspace: string) =>
    `${workspace} • ${scope} • ${compareCount} compare target${compareCount === 1 ? '' : 's'}`,
  savedSnapshotsTitle: 'Saved Snapshots',
  snapshotNamePlaceholder: 'Snapshot name (optional)',
  snapshotNotePlaceholder: 'Snapshot note (optional)',
  defaultSnapshotName: 'Snapshot',
  saveCurrentSnapshot: 'Save current snapshot',
  noSavedSnapshots: 'No snapshots saved yet',
  loadSnapshot: 'Restore',
  renameSnapshot: 'Rename',
  deleteSnapshot: 'Delete',
  activeSnapshotBadge: 'Active view',
  snapshotHint:
    'Snapshots capture current view state plus metadata. They do not store a frozen copy of live Azure resource data.',
  snapshotGuideTitle: 'Best for annotated point-in-time view setup',
  snapshotGuideBody: 'Use snapshots when you want notes, thumbnail preview, and saved counts for a specific topology view.',
  snapshotRestoreNotice: 'View state restored. Live topology data will refresh from the current workspace.',
  snapshotRestoreMetaHint: 'Restore reapplies the saved view settings, then reloads the current live topology.',
  snapshotSavedWithoutThumbnailSuffix: 'Saved without thumbnail to stay within browser storage limits',
  snapshotStorageNearLimit: 'Browser storage is getting full. Consider deleting older snapshots or exporting them to JSON.',
  snapshotStorageQuotaExceeded: 'Browser storage is full. Delete older snapshots or export them to JSON before saving more.',
  snapshotStorageWriteFailed: 'Snapshot storage write failed in this browser',
  snapshotStorageReadFailed: 'Saved snapshots could not be read from browser storage',
  savedSnapshotPrefix: 'Saved snapshot:',
  loadedSnapshotPrefix: 'Loaded snapshot:',
  renamedSnapshotPrefix: 'Renamed snapshot:',
  deletedSnapshotPrefix: 'Deleted snapshot:',
  exportedSnapshotsPrefix: 'Exported snapshots:',
  importedSnapshotsPrefix: 'Imported snapshots:',
  importInvalidSnapshotJson: 'Invalid snapshot JSON file',
  importNoValidSnapshots: 'No valid snapshots found in the imported file',
  snapshotRenamePrompt: 'Rename snapshot',
  snapshotDeleteConfirm: (name: string) => `Delete snapshot "${name}"?`,
  snapshotMeta: (scope: string, compareCount: number, workspace: string) =>
    `${workspace} • ${scope} • ${compareCount} compare target${compareCount === 1 ? '' : 's'}`,
  snapshotCounts: (visibleCount: number, loadedCount: number, edgeCount: number) =>
    `${visibleCount} visible • ${loadedCount} loaded • ${edgeCount} edges`,
  snapshotResourceGroupMeta: (resourceGroupName: string) =>
    resourceGroupName ? `RG focus • ${resourceGroupName}` : 'All resource groups',
  exportSnapshots: 'Export JSON',
  importSnapshots: 'Import JSON',
  importLocalSnapshots: 'Import local snapshots',
  dismissLocalSnapshotNotice: 'Dismiss',
  importingLocalSnapshots: 'Importing local snapshots…',
  snapshotStorageBadgeLabel: (storageKind: SnapshotStorageKind) =>
    storageKind === 'server' ? 'Server' : 'Local',
  snapshotStorageMeta: (storageKind: SnapshotStorageKind) =>
    storageKind === 'server' ? 'Stored in server snapshot history' : 'Stored only in this browser',
  snapshotImportSummary: (importedCount: number, skippedCount: number, failedCount: number) => {
    const parts: string[] = []

    if (importedCount) {
      parts.push(`Imported ${importedCount} snapshot${importedCount === 1 ? '' : 's'}`)
    }
    if (skippedCount) {
      parts.push(`Skipped ${skippedCount} duplicate${skippedCount === 1 ? '' : 's'}`)
    }
    if (failedCount) {
      parts.push(`${failedCount} failed`)
    }

    return parts.join(' • ') || 'No snapshots were imported'
  },
  localSnapshotNoticeTitle: (count: number) =>
    `This browser has ${count} local snapshot${count === 1 ? '' : 's'} for this workspace.`,
  localSnapshotNoticeBody:
    'Import them to server storage to keep them outside browser-local storage. Local copies stay here until you delete them manually.',
  searchScopes: {
    childOnly: {
      hint: 'Search only expanded child nodes currently visible on the canvas.',
      empty: 'No matches found in expanded child nodes.',
    },
    collapsedPreview: {
      hint: 'Search parent managed instances by collapsed child sample names.',
      empty: 'No matches found in collapsed child previews.',
    },
    visible: {
      hint: 'Search across all visible topology nodes.',
      empty: 'No matches found in visible nodes.',
    },
  },
} as const

export type TopologyPresetState = {
  presetVersion: number
  workspaceId: string
  compareRefs: string[]
  clusterChildren: boolean
  scope: SearchScope
  query: string
  resourceGroupName: string
}

export type SavedTopologyPreset = TopologyPresetState & {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

export type TopologySnapshotState = TopologyPresetState & {
  note: string
  topologyGeneratedAt: string
  visibleNodeCount: number
  loadedNodeCount: number
  edgeCount: number
  thumbnailDataUrl: string
}

export type SnapshotStorageKind = 'local' | 'server'

export type SavedTopologySnapshot = TopologySnapshotState & {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  storageKind: SnapshotStorageKind
}

export type ImportedPresetPayload = {
  presetVersion: number
  exportedAt: string
  presets: SavedTopologyPreset[]
}

export type ImportedSnapshotPayload = {
  presetVersion: number
  exportedAt: string
  snapshots: SavedTopologySnapshot[]
}
