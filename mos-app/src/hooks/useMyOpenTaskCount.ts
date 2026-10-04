import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { useAuth } from '@/auth/use-auth'
import type { ReadScope } from '@/lib/scoped-reads'
import {
  getOpenTaskCountSnapshot, subscribeOpenTaskCount, watchOpenTaskCount,
} from '@/lib/open-task-count-store'

// The viewer's open-task count: one shared result for every caller, refreshed after task writes and on focus.
// Null until it resolves and on failure.
export function useMyOpenTaskCount(): number | null {
  const auth = useAuth()
  const personId = auth.status === 'authenticated' ? auth.viewer?.person?.id : undefined
  const readScope: ReadScope | null = auth.status === 'authenticated' ? auth.readScope ?? null : null
  const subscribe = useCallback(
    (listener: () => void) => subscribeOpenTaskCount(listener, readScope),
    [readScope],
  )
  const getSnapshot = useCallback(() => getOpenTaskCountSnapshot(readScope), [readScope])
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  useEffect(() => {
    if (personId) watchOpenTaskCount(personId, readScope)
  }, [personId, readScope])

  return personId && snapshot?.personId === personId ? snapshot.count : null
}
