import { getMyOpenTaskCount } from '@/lib/db/open-task-count'
import type { ReadScope } from '@/lib/scoped-reads'
import { createScopedCountStore, type ScopedCountSnapshot } from '@/lib/scoped-count-store'

const store = createScopedCountStore(getMyOpenTaskCount, {
  initialCount: null,
  initialLoading: false,
  refreshOnFocus: true,
})

export function watchOpenTaskCount(personId: string, scope: ReadScope | null = null): void {
  void store.watch(personId, scope)
}

export function refreshOpenTaskCount(): Promise<void> {
  return store.refresh()
}

export function subscribeOpenTaskCount(
  personId: string,
  listener: () => void,
  scope: ReadScope | null = null,
): () => void {
  return store.subscribe(personId, scope, listener)
}

let lastRawSnapshot: ScopedCountSnapshot | null = null
let lastPublicSnapshot: { personId: string; count: number | null } | null = null

export function getOpenTaskCountSnapshot(
  personId: string,
  scope: ReadScope | null = null,
): { personId: string; count: number | null } | null {
  const snapshot = store.getSnapshot(personId, scope)
  if (snapshot.key !== personId) return null
  if (snapshot !== lastRawSnapshot) {
    lastRawSnapshot = snapshot
    lastPublicSnapshot = { personId, count: snapshot.count }
  }
  return lastPublicSnapshot
}

export function __resetOpenTaskCountForTests(): void {
  store.reset()
}
