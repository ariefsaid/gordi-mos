import { useCallback, useState } from 'react'
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

/**
 * Expand-vs-split preference for the task drawer (AC-104/105, OD-P3-3).
 * Per-user-GLOBAL: one preference applied to every task, persisted to
 * localStorage under `mos.tasks.expandDefault`. Returns a [value, setter]
 * tuple shaped like useState so callers can pass a boolean or an updater.
 */
export function useExpandPref(): [boolean, Dispatch<SetStateAction<boolean>>] {
  const [expanded, setExpandedState] = useState<boolean>(readPref)

  const setExpanded = useCallback<Dispatch<SetStateAction<boolean>>>(value => {
    setExpandedState(prev => {
      const next = typeof value === 'function'
        ? (value as (p: boolean) => boolean)(prev)
        : value
      try {
        localStorage.setItem(KEY, next ? 'true' : 'false')
      } catch {
        // ignore write failures (storage disabled) — state still updates
      }
      return next
    })
  }, [])

  return [expanded, setExpanded]
}
