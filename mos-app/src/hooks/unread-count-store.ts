import { countUnread } from '@/lib/db/notifications'
import type { ReadLease, ReadScope } from '@/lib/scoped-reads'
import { createReadLease, getReadScope, sameScope } from '@/lib/scoped-reads'
import { onUnreadCountChanged as subscribeToUnreadChanges } from './unread-count-bus'

const UNREAD_COUNT_KEY = 'notifications:unread-count'

export type UnreadCountSnapshot = Readonly<{
  unreadCount: number
  loading: boolean
}>

const EMPTY_SNAPSHOT: UnreadCountSnapshot = Object.freeze({ unreadCount: 0, loading: true })

type PendingRefresh = {
  scope: ReadScope
  promise: Promise<void>
}

let activeScope: ReadScope | null = null
let lease: ReadLease | null = null
let snapshot: UnreadCountSnapshot = EMPTY_SNAPSHOT
let hasSuccessfulRead = false
let requestVersion = 0
let pending: PendingRefresh | null = null
const listeners = new Set<() => void>()
let unsubscribeBus: (() => void) | null = null

function notify(): void {
  for (const listen of [...listeners]) listen()
}

function activate(scope: ReadScope): boolean {
  if (!sameScope(getReadScope(), scope)) return false
  if (sameScope(activeScope, scope) && lease !== null) return true

  requestVersion += 1
  pending = null
  lease?.dispose()
  activeScope = Object.freeze({ ...scope })
  lease = createReadLease(activeScope)
  snapshot = EMPTY_SNAPSHOT
  hasSuccessfulRead = false
  notify()
  return true
}

function current(scope: ReadScope, version: number): boolean {
  return requestVersion === version
    && sameScope(activeScope, scope)
    && sameScope(getReadScope(), scope)
}

function refresh(scope: ReadScope, force: boolean): Promise<void> {
  if (!activate(scope) || lease === null) return Promise.resolve()

  if (pending && sameScope(pending.scope, scope) && !force) {
    return pending.promise
  }

  if (force) lease.invalidate([UNREAD_COUNT_KEY])

  const version = ++requestVersion
  const currentLease = lease
  snapshot = { ...snapshot, loading: true }
  notify()

  const promise = currentLease.read(UNREAD_COUNT_KEY, countUnread).then(
    (unreadCount) => {
      if (!current(scope, version)) return
      snapshot = { unreadCount, loading: false }
      hasSuccessfulRead = true
      notify()
    },
    () => {
      if (!current(scope, version)) return
      snapshot = { ...snapshot, loading: false }
      hasSuccessfulRead = false
      notify()
    },
  )
  const entry: PendingRefresh = { scope, promise }
  pending = entry
  void promise.finally(() => {
    if (pending === entry) pending = null
  })
  return promise
}

function refreshOnUnreadCountChanged(): void {
  const scope = activeScope
  if (scope && sameScope(getReadScope(), scope)) void refresh(scope, true)
}

export function subscribeUnreadCount(scope: ReadScope | null, listener: () => void): () => void {
  if (scope === null || !activate(scope)) return () => {}

  listeners.add(listener)
  if (unsubscribeBus === null) unsubscribeBus = subscribeToUnreadChanges(refreshOnUnreadCountChanged)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && unsubscribeBus !== null) {
      unsubscribeBus()
      unsubscribeBus = null
    }
  }
}

export function getUnreadCountSnapshot(scope: ReadScope | null): UnreadCountSnapshot {
  return scope !== null
    && sameScope(activeScope, scope)
    && sameScope(getReadScope(), scope)
    ? snapshot
    : EMPTY_SNAPSHOT
}

export function watchUnreadCount(scope: ReadScope): Promise<void> {
  if (!activate(scope)) return Promise.resolve()
  if (pending && sameScope(pending.scope, scope)) return pending.promise
  if (hasSuccessfulRead) return Promise.resolve()
  return refresh(scope, false)
}

export function refreshUnreadCount(scope: ReadScope): Promise<void> {
  return refresh(scope, true)
}
