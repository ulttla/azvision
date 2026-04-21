import type {
  SavedTopologySnapshot,
  SnapshotFilterTab,
  SnapshotSortBy,
  SnapshotSortOrder,
} from './model'

export function getSnapshotSortFieldValue(
  snapshot: SavedTopologySnapshot,
  sortBy: SnapshotSortBy,
): string {
  if (sortBy === 'last_restored_at') return snapshot.lastRestoredAt || ''
  if (sortBy === 'updated_at') return snapshot.updatedAt || ''
  return snapshot.capturedAt || snapshot.createdAt || ''
}

export function getSnapshotRecentTime(snapshot: SavedTopologySnapshot): string {
  return snapshot.lastRestoredAt || snapshot.capturedAt || snapshot.createdAt || ''
}

export function orderSavedSnapshots(
  snapshots: SavedTopologySnapshot[],
  sortBy: SnapshotSortBy,
  sortOrder: SnapshotSortOrder,
): SavedTopologySnapshot[] {
  return [...snapshots].sort((left, right) => {
    if (left.isPinned !== right.isPinned) {
      return left.isPinned ? -1 : 1
    }

    const leftArchived = Boolean(left.archivedAt)
    const rightArchived = Boolean(right.archivedAt)
    if (leftArchived !== rightArchived) {
      return leftArchived ? 1 : -1
    }

    const leftVal = getSnapshotSortFieldValue(left, sortBy)
    const rightVal = getSnapshotSortFieldValue(right, sortBy)
    const cmp = rightVal.localeCompare(leftVal) // desc by default
    if (cmp !== 0) return sortOrder === 'asc' ? -cmp : cmp

    const leftCapturedAt = left.capturedAt || left.createdAt || ''
    const rightCapturedAt = right.capturedAt || right.createdAt || ''
    return rightCapturedAt.localeCompare(leftCapturedAt)
  })
}

export function getRecentSnapshots(
  snapshots: SavedTopologySnapshot[],
  limit: number,
): SavedTopologySnapshot[] {
  return [...snapshots]
    .filter((snapshot) => !snapshot.archivedAt)
    .sort((left, right) => getSnapshotRecentTime(right).localeCompare(getSnapshotRecentTime(left)))
    .slice(0, limit)
}

export function getSnapshotFilterCounts(
  snapshots: SavedTopologySnapshot[],
  recentLimit: number,
): Record<SnapshotFilterTab, number> {
  const nonArchived = snapshots.filter((snapshot) => !snapshot.archivedAt)
  const archived = snapshots.filter((snapshot) => Boolean(snapshot.archivedAt))
  const pinned = nonArchived.filter((snapshot) => snapshot.isPinned)
  const recent = getRecentSnapshots(nonArchived, recentLimit)
  return {
    all: nonArchived.length,
    pinned: pinned.length,
    recent: recent.length,
    archived: archived.length,
  }
}

export function getDisplayedSnapshots(
  snapshots: SavedTopologySnapshot[],
  snapshotFilter: SnapshotFilterTab,
  sortBy: SnapshotSortBy,
  sortOrder: SnapshotSortOrder,
  recentLimit: number,
): SavedTopologySnapshot[] {
  const orderedSnapshots = orderSavedSnapshots(snapshots, sortBy, sortOrder)
  const nonArchived = orderedSnapshots.filter((snapshot) => !snapshot.archivedAt)

  if (snapshotFilter === 'all') {
    return nonArchived
  }
  if (snapshotFilter === 'pinned') {
    return nonArchived.filter((snapshot) => snapshot.isPinned)
  }
  if (snapshotFilter === 'recent') {
    return getRecentSnapshots(nonArchived, recentLimit)
  }
  return orderedSnapshots.filter((snapshot) => Boolean(snapshot.archivedAt))
}
