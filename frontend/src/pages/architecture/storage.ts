export type ArchitectureNodeOverrideState = {
  displayNameOverride?: string
  stageKeyOverride?: string
}

export type ArchitectureOverrideState = {
  hiddenSourceNodeKeys: string[]
  nodeOverrides?: Record<string, ArchitectureNodeOverrideState>
  updatedAt?: string
}

const STORAGE_KEY = 'azvision:architecture-overrides:v1'

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function readAllStates(): Record<string, ArchitectureOverrideState> {
  if (!isBrowser()) {
    return {}
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return {}
    }

    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') {
      return {}
    }

    return parsed as Record<string, ArchitectureOverrideState>
  } catch {
    return {}
  }
}

function writeAllStates(states: Record<string, ArchitectureOverrideState>) {
  if (!isBrowser()) {
    return
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(states))
}

export function loadArchitectureOverrideState(scopeKey: string): ArchitectureOverrideState {
  if (!scopeKey) {
    return { hiddenSourceNodeKeys: [] }
  }

  const state = readAllStates()[scopeKey]
  if (!state || !Array.isArray(state.hiddenSourceNodeKeys)) {
    return { hiddenSourceNodeKeys: [] }
  }

  const nodeOverrides =
    state.nodeOverrides && typeof state.nodeOverrides === 'object'
      ? Object.fromEntries(
          Object.entries(state.nodeOverrides).filter(
            ([nodeKey, override]) => typeof nodeKey === 'string' && Boolean(nodeKey) && Boolean(override),
          ),
        )
      : undefined

  return {
    hiddenSourceNodeKeys: state.hiddenSourceNodeKeys.filter(
      (value): value is string => typeof value === 'string' && value.length > 0,
    ),
    nodeOverrides,
    updatedAt: state.updatedAt,
  }
}

export function saveArchitectureOverrideState(
  scopeKey: string,
  state: ArchitectureOverrideState,
) {
  if (!scopeKey) {
    return
  }

  const states = readAllStates()
  const nodeOverrides = Object.fromEntries(
    Object.entries(state.nodeOverrides ?? {}).filter(([, override]) =>
      Boolean(override.displayNameOverride?.trim() || override.stageKeyOverride?.trim()),
    ),
  )

  states[scopeKey] = {
    hiddenSourceNodeKeys: Array.from(new Set(state.hiddenSourceNodeKeys)).sort((left, right) =>
      left.localeCompare(right),
    ),
    nodeOverrides,
    updatedAt: state.updatedAt ?? new Date().toISOString(),
  }
  writeAllStates(states)
}

export function clearArchitectureOverrideState(scopeKey: string) {
  if (!scopeKey) {
    return
  }

  const states = readAllStates()
  delete states[scopeKey]
  writeAllStates(states)
}
