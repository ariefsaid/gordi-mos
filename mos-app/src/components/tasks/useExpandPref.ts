import { useCallback, useSyncExternalStore } from 'react'
import type { Dispatch, SetStateAction } from 'react'

const KEY = 'mos.tasks.expandDefault'

function readPref(): boolean {
  try {
    return localStorage.getItem(KEY) === 'true'
  } catch {
    // SSR / privacy-mode / storage-disabled — fall back to split (false)
    return false
  }
}

// ── Module-level shared store ──────────────────────────────────────────────────
// C1 fix: useExpandPref was a private useState instantiated TWICE (read-only in
// TasksLayout to drive the .split grid, setter in TaskDrawer). The two copies
// never synced in-session, so toggling expand flipped the drawer + localStorage
// but the layout grid never re-rendered until reload. Making the preference a
// single module-level store (subscribed via useSyncExternalStore) means every
// consumer reads ONE source and re-renders together on change.
const subscribers = new Set<() => void>()
let snapshot = readPref()

function subscribe(cb: () => void): () => void {
  subscribers.add(cb)
  return () => { subscribers.delete(cb) }
}

function getSnapshot(): boolean {
  return snapshot
}

function setPref(next: boolean) {
  if (next === snapshot) return
  snapshot = next
  try {
    localStorage.setItem(KEY, next ? 'true' : 'false')
  } catch {
    // ignore write failures (storage disabled) — in-memory state still updates
  }
  for (const cb of subscribers) cb()
}

/**
 * Expand-vs-split preference for the task drawer (AC-104/105, OD-P3-3).
 * Per-user-GLOBAL: one preference applied to every task, persisted to
 * localStorage under `mos.tasks.expandDefault` and shared across every consumer
 * in-session via a module-level store. Returns a [value, setter] tuple shaped
 * like useState so callers can pass a boolean or an updater.
 */
export function useExpandPref(): [boolean, Dispatch<SetStateAction<boolean>>] {
  const expanded = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const setExpanded = useCallback<Dispatch<SetStateAction<boolean>>>(value => {
    const next = typeof value === 'function'
      ? (value as (p: boolean) => boolean)(snapshot)
      : value
    setPref(next)
  }, [])

  return [expanded, setExpanded]
}

/**
 * Test-only reset hook: clears the in-memory snapshot back to what localStorage
 * holds (call after localStorage.clear() in test setup so the shared module
 * state doesn't leak between cases).
 */
export function __resetExpandPrefForTests() {
  snapshot = readPref()
  for (const cb of subscribers) cb()
}
