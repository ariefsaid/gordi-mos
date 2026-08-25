import { useCallback, useSyncExternalStore } from 'react'

/**
 * The rail's user-controlled collapse preference (#442).
 *
 * The icon-only rendering already existed but was reachable ONLY by shrinking the window into the
 * 920–1099.98px band (OD-REDESIGN-84.2 / P1-1) — at the full-rail widths the user had no say. This
 * is the say: one boolean, default `false` (expanded), that the ≥1100px regime consults.
 *
 * `localStorage`, deliberately. This is a DEVICE preference — the same person wants the wide rail
 * on a 27" monitor and the narrow one on a 13" laptop — so it is not org data, carries no `org_id`
 * seam, and never leaves the browser. Key `mos.rail.collapsed`, joining the `mos.*` family the
 * theme, locale, assistant and Tasks-view prefs already use.
 *
 * Shape is `useTasksViewPref`'s module-store-over-`useSyncExternalStore` pattern, verbatim: one
 * snapshot and one subscriber set, so the two consumers that must agree — the rail itself and the
 * top bar's brand column, which draws the divider on the rail's boundary — re-render together off
 * ONE source. Two independent `useState`s would let the divider drift off the rail edge for a frame.
 */
const STORAGE_KEY = 'mos.rail.collapsed'

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false // storage disabled (private mode / denied) → the documented default: expanded
  }
}

const subscribers = new Set<() => void>()
let snapshot: boolean = readCollapsed()

function subscribe(cb: () => void): () => void {
  subscribers.add(cb)
  return () => { subscribers.delete(cb) }
}

function getSnapshot(): boolean {
  return snapshot
}

function setCollapsedStore(next: boolean) {
  if (snapshot === next) return
  snapshot = next
  try { window.localStorage.setItem(STORAGE_KEY, String(next)) } catch { /* storage disabled */ }
  for (const cb of subscribers) cb()
}

export interface RailCollapsePref {
  /** The stored preference. `true` = the user asked for the icon-only rail. Default `false`. */
  collapsed: boolean
  setCollapsed: (next: boolean) => void
  toggle: () => void
}

export function useRailCollapsePref(): RailCollapsePref {
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const setCollapsed = useCallback((next: boolean) => { setCollapsedStore(next) }, [])
  const toggle = useCallback(() => { setCollapsedStore(!snapshot) }, [])
  return { collapsed, setCollapsed, toggle }
}

/**
 * Test-only reset: re-reads `localStorage` into the module snapshot so the shared store does not
 * leak between cases after a `localStorage.clear()`. Same escape hatch `useTasksViewPref` ships.
 */
export function __resetRailCollapsePrefForTests() {
  snapshot = readCollapsed()
  for (const cb of subscribers) cb()
}
