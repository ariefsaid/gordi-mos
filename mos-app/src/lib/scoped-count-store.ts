import type { ReadLease, ReadScope } from './scoped-reads'
import { createReadLease, getReadScope, sameScope } from './scoped-reads'

export type ScopedCountSnapshot = Readonly<{
  key: string | null
  count: number | null
  loading: boolean
}>

type ScopedCountStoreOptions = {
  initialCount?: number | null
  initialLoading?: boolean
  retainCountOnError?: boolean
  refreshOnFocus?: boolean
}

type PendingRefresh = {
  key: string
  scope: ReadScope | null
  promise: Promise<void>
}

export function createScopedCountStore(
  read: (key: string) => Promise<number | null>,
  options: ScopedCountStoreOptions = {},
) {
  const emptySnapshot: ScopedCountSnapshot = Object.freeze({
    key: null,
    count: options.initialCount ?? null,
    loading: options.initialLoading ?? true,
  })
  let activeScope: ReadScope | null = null
  let activeKey: string | null = null
  let lease: ReadLease = createReadLease(null)
  let snapshot = emptySnapshot
  let hasSuccessfulRead = false
  let requestVersion = 0
  let pending: PendingRefresh | null = null
  const listeners = new Set<() => void>()
  let listeningForFocus = false

  function notify(): void {
    for (const listen of [...listeners]) listen()
  }

  function activate(key: string, scope: ReadScope | null): boolean {
    if (!sameScope(getReadScope(), scope)) return false
    if (activeKey === key && sameScope(activeScope, scope)) return true

    requestVersion += 1
    pending = null
    lease.dispose()
    activeScope = scope === null ? null : Object.freeze({ ...scope })
    activeKey = key
    lease = createReadLease(activeScope)
    snapshot = {
      key: options.initialLoading ? key : null,
      count: options.initialCount ?? null,
      loading: options.initialLoading ?? true,
    }
    hasSuccessfulRead = false
    notify()
    return true
  }

  function isCurrent(key: string, scope: ReadScope | null, version: number): boolean {
    return requestVersion === version
      && activeKey === key
      && sameScope(activeScope, scope)
      && sameScope(getReadScope(), scope)
  }

  function load(force: boolean): Promise<void> {
    const key = activeKey
    const scope = activeScope
    if (key === null || !sameScope(getReadScope(), scope)) return Promise.resolve()
    if (pending && pending.key === key && sameScope(pending.scope, scope) && !force) {
      return pending.promise
    }

    const readKey = `count:${key}`
    if (force) lease.invalidate([readKey])

    const version = ++requestVersion
    const currentLease = lease
    snapshot = { ...snapshot, loading: true }
    notify()

    const promise = currentLease.read(readKey, () => read(key)).then(
      (count) => {
        if (!isCurrent(key, scope, version)) return
        if (pending?.promise === promise) pending = null
        snapshot = { key, count, loading: false }
        hasSuccessfulRead = count !== null
        notify()
      },
      () => {
        if (!isCurrent(key, scope, version)) return
        if (pending?.promise === promise) pending = null
        snapshot = {
          key,
          count: options.retainCountOnError ? snapshot.count : null,
          loading: false,
        }
        hasSuccessfulRead = false
        notify()
      },
    )
    const entry: PendingRefresh = { key, scope, promise }
    pending = entry
    void promise.finally(() => {
      if (pending === entry) pending = null
    })
    return promise
  }

  function onWindowFocus(): void {
    void refresh()
  }

  function refresh(key?: string, scope: ReadScope | null = null): Promise<void> {
    if (key !== undefined && !activate(key, scope)) return Promise.resolve()
    return load(true)
  }

  return {
    subscribe(key: string | null, scope: ReadScope | null, listener: () => void): () => void {
      if (key !== null && activate(key, scope)) {
        listeners.add(listener)
        if (options.refreshOnFocus && !listeningForFocus && typeof window !== 'undefined') {
          window.addEventListener('focus', onWindowFocus)
          listeningForFocus = true
        }
      }
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0 && listeningForFocus && typeof window !== 'undefined') {
          window.removeEventListener('focus', onWindowFocus)
          listeningForFocus = false
        }
      }
    },

    getSnapshot(key: string, scope: ReadScope | null): ScopedCountSnapshot {
      return activeKey === key
        && sameScope(activeScope, scope)
        && sameScope(getReadScope(), scope)
        ? snapshot
        : emptySnapshot
    },

    watch(key: string, scope: ReadScope | null): Promise<void> {
      if (!activate(key, scope)) return Promise.resolve()
      if (pending && pending.key === key && sameScope(pending.scope, scope)) return pending.promise
      if (hasSuccessfulRead) return Promise.resolve()
      return load(false)
    },

    refresh,

    reset(): void {
      lease.dispose()
      activeScope = null
      activeKey = null
      lease = createReadLease(null)
      snapshot = emptySnapshot
      hasSuccessfulRead = false
      pending = null
      requestVersion += 1
      if (listeningForFocus && typeof window !== 'undefined') window.removeEventListener('focus', onWindowFocus)
      listeningForFocus = false
      listeners.clear()
    },
  }
}
