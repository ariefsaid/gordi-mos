import { useEffect, useSyncExternalStore } from 'react'
import { useAuth } from '@/auth/use-auth'
import {
  getOpenTaskCountSnapshot, subscribeOpenTaskCount, watchOpenTaskCount,
} from '@/lib/open-task-count-store'

// The viewer's open-task count: one shared result for every caller, refreshed after task writes.
// Null until it resolves and on failure.
export function useMyOpenTaskCount(): number | null {
  const auth = useAuth()
  const personId = auth.status === 'authenticated' ? auth.viewer?.person?.id : undefined
  const snapshot = useSyncExternalStore(subscribeOpenTaskCount, getOpenTaskCountSnapshot)

  useEffect(() => {
    if (personId) watchOpenTaskCount(personId)
  }, [personId])

  return personId && snapshot?.personId === personId ? snapshot.count : null
}
