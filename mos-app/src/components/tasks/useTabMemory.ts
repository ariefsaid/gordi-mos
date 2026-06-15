import { useCallback, useEffect, useState } from 'react'

export type TabKey = 'details' | 'checklist' | 'activity'

const DEFAULT_TAB: TabKey = 'details'
const VALID: readonly TabKey[] = ['details', 'checklist', 'activity']

function keyFor(taskId: string | null): string | null {
  return taskId ? `mos.tasks.tab.${taskId}` : null
}

function read(taskId: string | null): TabKey {
  const k = keyFor(taskId)
  if (!k) return DEFAULT_TAB
  try {
    const v = sessionStorage.getItem(k)
    return v && (VALID as readonly string[]).includes(v) ? (v as TabKey) : DEFAULT_TAB
  } catch {
    return DEFAULT_TAB
  }
}

/**
 * Per-task tab memory (AC-106, OD-P3-3). Default tab is "details"; the
 * last-used tab is remembered per task id in sessionStorage (reset on a fresh
 * session). A new task id reads its own memory, falling back to "details".
 */
export function useTabMemory(taskId: string | null): [TabKey, (t: TabKey) => void] {
  const [tab, setTabState] = useState<TabKey>(() => read(taskId))

  // When the open task changes, swap to that task's remembered tab.
  useEffect(() => {
    setTabState(read(taskId))
  }, [taskId])

  const setTab = useCallback((next: TabKey) => {
    setTabState(next)
    const k = keyFor(taskId)
    if (k) {
      try {
        sessionStorage.setItem(k, next)
      } catch {
        // ignore write failures
      }
    }
  }, [taskId])

  return [tab, setTab]
}
