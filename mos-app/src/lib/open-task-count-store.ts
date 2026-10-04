import { getMyOpenTaskCount } from '@/lib/db/open-task-count'
import type { ReadLease, ReadScope } from '@/lib/scoped-reads'
import { createReadLease, getReadScope } from '@/lib/scoped-reads'

// One shared result for every consumer (rail badge, Home), refreshed after task writes and on focus.
type Snapshot = { personId: string; count: number | null } | null

type PendingRead = {
  personId: string
  scope: ReadScope | null
  promise: Promise<void>
}

let snapshot: Snapshot = null
let activeScope: ReadScope | null = null
let lease: ReadLease = createReadLease(null)
let watched: string | undefined
let pending: PendingRead | null = null
let latest = 0
const listeners = new Set<() => void>()
let listeningForFocus = false

function sameScope(left: ReadScope | null, right: ReadScope | null): boolean {
  if (left === null || right === null) return left === right
  return left.generation === right.generation
    && left.authUserId === right.authUserId
    && left.viewerId === right.viewerId
    && left.orgId === right.orgId
    && left.authorityKey === right.authorityKey
}

function canUseScope(scope: ReadScope | null): boolean {
  return scope === null || sameScope(getReadScope(), scope)
}

function notify(): void {
  for (const listen of [...listeners]) listen()
}

function activateScope(scope: ReadScope | null): boolean {
  if (!canUseScope(scope)) return false
  if (sameScope(activeScope, scope)) return true

  latest += 1
  pending = null
  lease.dispose()
  activeScope = scope === null ? null : Object.freeze({ ...scope })
  lease = createReadLease(activeScope)
  snapshot = null
  watched = undefined
  notify()
  return true
}

function isCurrent(scope: ReadScope | null, version: number): boolean {
  return version === latest
    && sameScope(activeScope, scope)
    && canUseScope(scope)
}

function countKey(personId: string): string {
  return `tasks:open-count:${personId}`
}

function load(personId: string, scope: ReadScope | null, force: boolean): Promise<void> {
  if (!activateScope(scope)) return Promise.resolve()
  watched = personId

  const key = countKey(personId)
  if (pending
    && pending.personId === personId
    && sameScope(pending.scope, scope)
    && !force) {
    return pending.promise
  }

  if (force) lease.invalidate([key])

  const version = ++latest
  const currentLease = lease
  const promise = currentLease.read(key, () => getMyOpenTaskCount(personId)).then(
    (count) => {
      if (!isCurrent(scope, version)) return
      pending = null
      snapshot = { personId, count }
      notify()
    },
    () => {
      if (!isCurrent(scope, version)) return
      pending = null
      snapshot = { personId, count: null }
      notify()
    },
  )
  const entry: PendingRead = { personId, scope, promise }
  pending = entry
  void promise.finally(() => {
    if (pending === entry) pending = null
  })
  return promise
}

function onWindowFocus(): void {
  if (watched) void load(watched, activeScope, true)
}

/** Start watching the viewer's count; same-scope cold watchers join the in-flight read. */
export function watchOpenTaskCount(personId: string, scope: ReadScope | null = null): void {
  if (!activateScope(scope)) return
  watched = personId
  if (pending
    && pending.personId === personId
    && sameScope(pending.scope, scope)) return
  if (snapshot?.personId !== personId || snapshot.count === null) void load(personId, scope, false)
}

/** Call after any task write; refetches the watched viewer's count. */
export function announceOpenTaskCountChanged(): void {
  if (watched) void load(watched, activeScope, true)
}

export function subscribeOpenTaskCount(
  listener: () => void,
  scope: ReadScope | null = null,
): () => void {
  if (!activateScope(scope)) return () => {}
  listeners.add(listener)
  if (!listeningForFocus && typeof window !== 'undefined') {
    window.addEventListener('focus', onWindowFocus)
    listeningForFocus = true
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && listeningForFocus && typeof window !== 'undefined') {
      window.removeEventListener('focus', onWindowFocus)
      listeningForFocus = false
    }
  }
}

export const getOpenTaskCountSnapshot = (scope: ReadScope | null = null): Snapshot =>
  sameScope(activeScope, scope) && canUseScope(scope) ? snapshot : null

export function __resetOpenTaskCountForTests(): void {
  lease.dispose()
  activeScope = null
  lease = createReadLease(null)
  snapshot = null
  watched = undefined
  pending = null
  latest += 1
  if (listeningForFocus && typeof window !== 'undefined') window.removeEventListener('focus', onWindowFocus)
  listeningForFocus = false
  listeners.clear()
}
