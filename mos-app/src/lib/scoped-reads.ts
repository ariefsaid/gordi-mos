export type ReadKey = string

export type ReadScope = Readonly<{
  generation: number
  authUserId: string
  viewerId: string
  orgId: string
  authorityKey: string
}>

export interface ReadLease {
  read<T>(key: ReadKey, load: () => Promise<T>): Promise<T>
  invalidate(keys?: readonly ReadKey[]): void
  dispose(): void
}

interface PendingRead {
  revision: number
  promise: Promise<unknown>
}

interface SuccessfulRead {
  revision: number
  value: unknown
}

let currentScope: ReadScope | null = null
const pendingReads = new Map<ReadKey, PendingRead>()
const currentRevisions = new Map<ReadKey, number>()

export function sameScope(left: ReadScope | null, right: ReadScope | null): boolean {
  if (left === right) return true
  return left !== null
    && right !== null
    && left.generation === right.generation
    && left.authUserId === right.authUserId
    && left.viewerId === right.viewerId
    && left.orgId === right.orgId
    && left.authorityKey === right.authorityKey
}

function cloneDto<T>(value: T): T {
  return structuredClone(value)
}

function startLoad<T>(load: () => Promise<T>): Promise<T> {
  try {
    return Promise.resolve(load())
  } catch (error) {
    return Promise.reject(error)
  }
}

function revisionFor(key: ReadKey): number {
  return currentRevisions.get(key) ?? 0
}

function retiredScopeError(): Error {
  return new Error('Read lease scope is no longer active')
}

function invalidatedReadError(): Error {
  return new Error('Read result was superseded before delivery')
}

function disposedLeaseError(): Error {
  return new Error('Read lease has been disposed')
}

function assertCurrentScopedRead(scope: ReadScope, key: ReadKey, revision: number): void {
  if (!sameScope(currentScope, scope)) throw retiredScopeError()
  if (revisionFor(key) !== revision) throw invalidatedReadError()
}

export function publishReadScope(scope: ReadScope | null): void {
  if (scope !== null && sameScope(currentScope, scope)) return

  currentScope = scope === null ? null : Object.freeze({ ...scope })
  pendingReads.clear()
  currentRevisions.clear()
}

export function getReadScope(): ReadScope | null {
  return currentScope
}

export function sharePending<T>(scope: ReadScope, key: ReadKey, load: () => Promise<T>): Promise<T> {
  if (!sameScope(currentScope, scope)) return Promise.reject(retiredScopeError())

  const revision = revisionFor(key)
  const existing = pendingReads.get(key)
  if (existing?.revision === revision) {
    return existing.promise.then((value) => {
      assertCurrentScopedRead(scope, key, revision)
      return cloneDto(value as T)
    })
  }

  const promise = startLoad(load).then((value) => {
    assertCurrentScopedRead(scope, key, revision)
    return cloneDto(value)
  })
  const entry: PendingRead = { revision, promise }
  pendingReads.set(key, entry)
  const removeSettled = () => {
    if (pendingReads.get(key) === entry) pendingReads.delete(key)
  }
  void promise.then(removeSettled, removeSettled)

  return promise.then((value) => {
    assertCurrentScopedRead(scope, key, revision)
    return cloneDto(value as T)
  })
}

export function invalidateReads(scope: ReadScope, keys: readonly ReadKey[]): void {
  if (!sameScope(currentScope, scope)) return

  for (const key of new Set(keys)) {
    const revision = revisionFor(key) + 1
    currentRevisions.set(key, revision)
    pendingReads.delete(key)
  }
}

export function createReadLease(scope: ReadScope | null): ReadLease {
  const leaseScope = scope === null ? null : Object.freeze({ ...scope })
  const successes = new Map<ReadKey, SuccessfulRead>()
  const usedKeys = new Set<ReadKey>()
  const localPending = new Map<ReadKey, PendingRead>()
  const localRevisions = new Map<ReadKey, number>()
  let disposed = false

  const localRevisionFor = (key: ReadKey) => localRevisions.get(key) ?? 0

  function readLocal<T>(key: ReadKey, load: () => Promise<T>): Promise<T> {
    const revision = localRevisionFor(key)
    const cached = successes.get(key)
    if (cached?.revision === revision) {
      return Promise.resolve().then(() => {
        if (disposed) throw disposedLeaseError()
        if (localRevisionFor(key) !== revision) throw invalidatedReadError()
        return cloneDto(cached.value as T)
      })
    }
    successes.delete(key)

    const existing = localPending.get(key)
    if (existing?.revision === revision) {
      return existing.promise.then((value) => {
        if (disposed) throw disposedLeaseError()
        if (localRevisionFor(key) !== revision) throw invalidatedReadError()
        return cloneDto(value as T)
      })
    }

    const promise = startLoad(load).then((value) => {
      if (disposed) throw disposedLeaseError()
      if (localRevisionFor(key) !== revision) throw invalidatedReadError()
      return cloneDto(value)
    })
    const entry: PendingRead = { revision, promise }
    localPending.set(key, entry)
    const removeSettled = () => {
      if (localPending.get(key) === entry) localPending.delete(key)
    }
    void promise.then(removeSettled, removeSettled)

    return promise.then((value) => {
      if (disposed) throw disposedLeaseError()
      if (localRevisionFor(key) !== revision) throw invalidatedReadError()
      successes.set(key, { revision, value: cloneDto(value) })
      return cloneDto(value as T)
    })
  }

  function invalidateLocal(keys: readonly ReadKey[]): void {
    for (const key of new Set(keys)) {
      localRevisions.set(key, localRevisionFor(key) + 1)
      successes.delete(key)
      localPending.delete(key)
    }
  }

  return {
    read<T>(key: ReadKey, load: () => Promise<T>): Promise<T> {
      if (disposed) return Promise.reject(disposedLeaseError())
      usedKeys.add(key)

      if (leaseScope === null) return readLocal(key, load)
      if (!sameScope(currentScope, leaseScope)) return Promise.reject(retiredScopeError())

      const revision = revisionFor(key)
      const cached = successes.get(key)
      if (cached?.revision === revision) {
        return Promise.resolve().then(() => {
          if (disposed) throw disposedLeaseError()
          assertCurrentScopedRead(leaseScope, key, revision)
          return cloneDto(cached.value as T)
        })
      }
      successes.delete(key)

      return sharePending(leaseScope, key, load).then((value) => {
        if (disposed) throw disposedLeaseError()
        assertCurrentScopedRead(leaseScope, key, revision)
        successes.set(key, { revision, value: cloneDto(value) })
        return value
      })
    },

    invalidate(keys) {
      if (disposed) return
      const targetKeys = keys === undefined ? [...usedKeys] : [...keys]
      if (leaseScope === null) invalidateLocal(targetKeys)
      else invalidateReads(leaseScope, targetKeys)
    },

    dispose() {
      if (disposed) return
      disposed = true
      successes.clear()
      localPending.clear()
      localRevisions.clear()
      usedKeys.clear()
    },
  }
}
