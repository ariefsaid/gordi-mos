import { countUnread } from '@/lib/db/notifications'
import type { ReadScope } from '@/lib/scoped-reads'
import { createScopedCountStore, type ScopedCountSnapshot } from '@/lib/scoped-count-store'

const UNREAD_COUNT_KEY = 'notifications:unread-count'

export type UnreadCountSnapshot = Readonly<{
  unreadCount: number
  loading: boolean
}>

const store = createScopedCountStore(() => countUnread(), {
  initialCount: 0,
  initialLoading: true,
  retainCountOnError: true,
})

export function subscribeUnreadCount(scope: ReadScope | null, listener: () => void): () => void {
  return store.subscribe(UNREAD_COUNT_KEY, scope, listener)
}

let lastRawSnapshot: ScopedCountSnapshot | null = null
let lastPublicSnapshot: UnreadCountSnapshot = { unreadCount: 0, loading: true }

export function getUnreadCountSnapshot(scope: ReadScope | null): UnreadCountSnapshot {
  const snapshot = store.getSnapshot(UNREAD_COUNT_KEY, scope)
  if (snapshot !== lastRawSnapshot) {
    lastRawSnapshot = snapshot
    lastPublicSnapshot = { unreadCount: snapshot.count ?? 0, loading: snapshot.loading }
  }
  return lastPublicSnapshot
}

export function watchUnreadCount(scope: ReadScope | null): Promise<void> {
  return scope === null
    ? store.refresh(UNREAD_COUNT_KEY, null)
    : store.watch(UNREAD_COUNT_KEY, scope)
}

export function refreshUnreadCount(scope?: ReadScope | null): Promise<void> {
  return scope === undefined ? store.refresh() : store.refresh(UNREAD_COUNT_KEY, scope)
}
