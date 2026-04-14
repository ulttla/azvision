export type ArchitectureOverrideState = {
  hiddenSourceNodeKeys: string[]
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

  return {
    hiddenSourceNodeKeys: state.hiddenSourceNodeKeys.filter(
      (value): value is string => typeof value === 'string' && value.length > 0,
    ),
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
  states[scopeKey] = {
    hiddenSourceNodeKeys: Array.from(new Set(state.hiddenSourceNodeKeys)).sort((left, right) =>
      left.localeCompare(right),
    ),
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
