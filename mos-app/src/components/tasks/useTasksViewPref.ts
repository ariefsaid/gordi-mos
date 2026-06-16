import { useCallback, useSyncExternalStore } from 'react'

// ── Keys ────────────────────────────────────────────────────────────────────
// 'mos.tasks.view' is reserved for forward-compat (Board/Calendar are stubs);
// only 'table' is valid in v1, so view is not persisted/read here.
const KEY_GROUP_BY = 'mos.tasks.groupBy'
const KEY_COLLAPSED = 'mos.tasks.collapsedGroups'

// ── Types ────────────────────────────────────────────────────────────────────
export type TasksGroupBy = 'status' | 'owner' | 'bu'
export type TasksView = 'table'

export interface TasksViewPref {
  view: TasksView
  groupBy: TasksGroupBy
  collapsedGroups: Partial<Record<TasksGroupBy, string[]>>
  setGroupBy: (g: TasksGroupBy) => void
  /** Toggles the given groupKey under the current groupBy dimension. */
  toggleCollapsed: (groupKey: string) => void
  /** Returns true if groupKey is currently collapsed under the current groupBy. */
  isCollapsed: (groupKey: string) => boolean
}

// ── Storage helpers (guarded try/catch for SSR / privacy-mode) ──────────────

const VALID_GROUP_BY: TasksGroupBy[] = ['status', 'owner', 'bu']

function readView(): TasksView {
  // Only 'table' is valid in v1 (Board/Calendar are stubs); the stored value is
  // read so the key exists for forward-compat, but it always resolves to 'table'.
  return 'table'
}

function readGroupBy(): TasksGroupBy {
  try {
    const v = localStorage.getItem(KEY_GROUP_BY) as TasksGroupBy | null
    return v && VALID_GROUP_BY.includes(v) ? v : 'status'
  } catch {
    return 'status'
  }
}

function readCollapsed(): Partial<Record<TasksGroupBy, string[]>> {
  try {
    const raw = localStorage.getItem(KEY_COLLAPSED)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    // Validate: keep only valid TasksGroupBy keys with string[] values
    const result: Partial<Record<TasksGroupBy, string[]>> = {}
    for (const key of VALID_GROUP_BY) {
      if (Array.isArray(parsed[key])) {
        result[key] = (parsed[key] as unknown[]).filter((v): v is string => typeof v === 'string')
      }
    }
    return result
  } catch {
    return {}
  }
}

// ── Module-level shared store (mirrors useExpandPref's C1 pattern exactly) ──
// Single source of truth: one snapshot + subscriber set so all consumers
// share ONE source and re-render together on change.

interface StoreSnapshot {
  view: TasksView
  groupBy: TasksGroupBy
  collapsedGroups: Partial<Record<TasksGroupBy, string[]>>
}

const subscribers = new Set<() => void>()
let snapshot: StoreSnapshot = {
  view: readView(),
  groupBy: readGroupBy(),
  collapsedGroups: readCollapsed(),
}

function subscribe(cb: () => void): () => void {
  subscribers.add(cb)
  return () => { subscribers.delete(cb) }
}

function getSnapshot(): StoreSnapshot {
  return snapshot
}

function notify() {
  for (const cb of subscribers) cb()
}

function setGroupByStore(g: TasksGroupBy) {
  if (snapshot.groupBy === g) return
  snapshot = { ...snapshot, groupBy: g }
  try { localStorage.setItem(KEY_GROUP_BY, g) } catch { /* storage disabled */ }
  notify()
}

function toggleCollapsedStore(groupKey: string, currentGroupBy: TasksGroupBy) {
  const existing = snapshot.collapsedGroups[currentGroupBy] ?? []
  const next = existing.includes(groupKey)
    ? existing.filter(k => k !== groupKey)
    : [...existing, groupKey]
  const nextCollapsed = { ...snapshot.collapsedGroups, [currentGroupBy]: next }
  snapshot = { ...snapshot, collapsedGroups: nextCollapsed }
  try { localStorage.setItem(KEY_COLLAPSED, JSON.stringify(nextCollapsed)) } catch { /* storage disabled */ }
  notify()
}

/**
 * Per-user-global persistence for Tasks view preferences (FR-125, AC-127).
 * Mirrors useExpandPref's useSyncExternalStore-over-localStorage module pattern verbatim.
 * Keys: mos.tasks.view, mos.tasks.groupBy, mos.tasks.collapsedGroups.
 */
export function useTasksViewPref(): TasksViewPref {
  const { view, groupBy, collapsedGroups } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const setGroupBy = useCallback((g: TasksGroupBy) => {
    setGroupByStore(g)
  }, [])

  const toggleCollapsed = useCallback((groupKey: string) => {
    toggleCollapsedStore(groupKey, snapshot.groupBy)
  }, [])

  const isCollapsed = useCallback((groupKey: string) => {
    const collapsed = snapshot.collapsedGroups[snapshot.groupBy] ?? []
    return collapsed.includes(groupKey)
  }, [])

  return { view, groupBy, collapsedGroups, setGroupBy, toggleCollapsed, isCollapsed }
}

/**
 * Test-only reset: clears in-memory snapshot back to what localStorage holds.
 * Call after localStorage.clear() in test setup so the shared module state
 * doesn't leak between test cases.
 */
export function __resetTasksViewPrefForTests() {
  snapshot = {
    view: readView(),
    groupBy: readGroupBy(),
    collapsedGroups: readCollapsed(),
  }
  notify()
}
