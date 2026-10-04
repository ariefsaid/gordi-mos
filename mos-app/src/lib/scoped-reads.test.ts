import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createReadLease,
  invalidateReads,
  publishReadScope,
  sharePending,
} from './scoped-reads'
import type { ReadScope } from './scoped-reads'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function scope(generation: number, authUserId: string, viewerId: string, authorityKey = 'member'): ReadScope {
  return {
    generation,
    authUserId,
    viewerId,
    orgId: 'org-fixture',
    authorityKey,
  }
}

afterEach(() => {
  publishReadScope(null)
})

describe('scoped reads contract', () => {
  it('joins an identical current-scope pending read but keeps another scope separate', async () => {
    const firstScope = scope(1, 'auth-a', 'person-a')
    const secondScope = scope(2, 'auth-b', 'person-b')
    const firstRead = deferred<string>()
    const secondRead = deferred<string>()
    const loadFirst = vi.fn(() => firstRead.promise)
    const loadSecond = vi.fn(() => secondRead.promise)
    const key = 'signals:list:select-v1'

    publishReadScope(firstScope)
    const oldOwner = sharePending(firstScope, key, loadFirst)
    const sameScopeJoin = sharePending(firstScope, key, loadFirst)
    expect(loadFirst).toHaveBeenCalledTimes(1)

    publishReadScope(secondScope)
    const newOwner = sharePending(secondScope, key, loadSecond)
    expect(loadSecond).toHaveBeenCalledTimes(1)

    const oldSettled = oldOwner.then(() => undefined, () => undefined)
    firstRead.resolve('first-scope')
    secondRead.resolve('second-scope')
    await oldSettled
    await sameScopeJoin.catch(() => undefined)
    await expect(newOwner).resolves.toBe('second-scope')
    expect(loadFirst).toHaveBeenCalledTimes(1)
    expect(loadSecond).toHaveBeenCalledTimes(1)
  })

  it('keeps organization and authority changes distinct even with the same generation and person', async () => {
    const baseScope = scope(4, 'auth-a', 'person-a', 'member')
    const differentOrganization = { ...baseScope, orgId: 'org-other' }
    const differentAuthority = { ...baseScope, authorityKey: 'member+admin' }
    const key = 'tasks:list:select-v1'

    for (const nextScope of [differentOrganization, differentAuthority]) {
      const oldRead = deferred<string>()
      const nextRead = deferred<string>()
      const loadOld = vi.fn(() => oldRead.promise)
      const loadNext = vi.fn(() => nextRead.promise)
      publishReadScope(baseScope)
      const oldOwner = sharePending(baseScope, key, loadOld)
      const oldSettled = oldOwner.then(() => undefined, () => undefined)

      publishReadScope(nextScope)
      const newOwner = sharePending(nextScope, key, loadNext)
      expect(loadOld).toHaveBeenCalledTimes(1)
      expect(loadNext).toHaveBeenCalledTimes(1)

      oldRead.resolve('old-scope')
      nextRead.resolve('new-scope')
      await oldSettled
      await expect(newOwner).resolves.toBe('new-scope')
      publishReadScope(null)
    }
  })

  it('delivers independent DTO values and protects a lease success from caller mutation', async () => {
    const activeScope = scope(7, 'auth-a', 'person-a')
    const pending = deferred<{ rows: { id: string }[] }>()
    const load = vi.fn(() => pending.promise)
    const key = 'tasks:list:select-v1'
    const firstLease = createReadLease(activeScope)
    const secondLease = createReadLease(activeScope)
    publishReadScope(activeScope)

    const firstRead = firstLease.read(key, load)
    const secondRead = secondLease.read(key, load)
    expect(load).toHaveBeenCalledTimes(1)
    pending.resolve({ rows: [{ id: 'task-original' }] })
    const [first, second] = await Promise.all([firstRead, secondRead])

    first.rows[0].id = 'task-mutated-by-first-owner'
    expect(second.rows[0].id).toBe('task-original')

    const cachedAgain = await firstLease.read(key, load)
    expect(cachedAgain.rows[0].id).toBe('task-original')
    expect(cachedAgain).not.toBe(first)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('keeps null-scope leases private even when an authenticated scope is published', async () => {
    const activeScope = scope(9, 'auth-a', 'person-a')
    const firstPending = deferred<string>()
    const secondPending = deferred<string>()
    const firstLoad = vi.fn(() => firstPending.promise)
    const secondLoad = vi.fn(() => secondPending.promise)
    const firstLease = createReadLease(null)
    const secondLease = createReadLease(null)
    const key = 'task-directory:select-v1'
    publishReadScope(activeScope)

    const firstRead = firstLease.read(key, firstLoad)
    const secondRead = secondLease.read(key, secondLoad)
    expect(firstLoad).toHaveBeenCalledTimes(1)
    expect(secondLoad).toHaveBeenCalledTimes(1)

    firstPending.resolve('local-one')
    secondPending.resolve('local-two')
    await expect(firstRead).resolves.toBe('local-one')
    await expect(secondRead).resolves.toBe('local-two')
    await expect(firstLease.read(key, firstLoad)).resolves.toBe('local-one')
    await expect(secondLease.read(key, secondLoad)).resolves.toBe('local-two')
    expect(firstLoad).toHaveBeenCalledTimes(1)
    expect(secondLoad).toHaveBeenCalledTimes(1)
  })

  it('rejects future reads through a disposed lease', async () => {
    const lease = createReadLease(null)
    const load = vi.fn(async () => 'not retained')
    lease.dispose()

    await expect(lease.read('signals:list:select-v1', load)).rejects.toBeInstanceOf(Error)
    expect(load).not.toHaveBeenCalled()
  })

  it('does not revive an old A lease or pending read after A → B → A', async () => {
    const aFirst = scope(11, 'auth-a', 'person-a')
    const b = scope(12, 'auth-b', 'person-b')
    const aAgain = scope(13, 'auth-a', 'person-a')
    const oldARead = deferred<string>()
    const newARead = deferred<string>()
    const loadOldA = vi.fn(() => oldARead.promise)
    const loadNewA = vi.fn(() => newARead.promise)
    const key = 'tasks:open-count:viewer-v1'
    const oldALease = createReadLease(aFirst)
    publishReadScope(aFirst)
    const oldResult = oldALease.read(key, loadOldA)

    publishReadScope(b)
    publishReadScope(aAgain)
    const currentALease = createReadLease(aAgain)
    const currentResult = currentALease.read(key, loadNewA)
    expect(loadNewA).toHaveBeenCalledTimes(1)

    newARead.resolve('current-a')
    await expect(currentResult).resolves.toBe('current-a')
    oldARead.resolve('retired-a')
    await oldResult.catch(() => undefined)

    await expect(currentALease.read(key, loadNewA)).resolves.toBe('current-a')
    await expect(oldALease.read(key, loadOldA)).rejects.toBeInstanceOf(Error)
    expect(loadOldA).toHaveBeenCalledTimes(1)
    expect(loadNewA).toHaveBeenCalledTimes(1)
  })

  it('keeps an older pending completion from replacing a forced refresh result', async () => {
    const activeScope = scope(21, 'auth-a', 'person-a')
    const oldRead = deferred<{ value: string }>()
    const refreshedRead = deferred<{ value: string }>()
    let loads = 0
    const load = vi.fn(() => (loads++ === 0 ? oldRead.promise : refreshedRead.promise))
    const key = 'signals:collection:select-v1'
    const lease = createReadLease(activeScope)
    publishReadScope(activeScope)

    const oldResult = lease.read(key, load)
    const oldSettled = oldResult.then(() => undefined, () => undefined)
    invalidateReads(activeScope, [key])
    const refreshedResult = lease.read(key, load)
    expect(load).toHaveBeenCalledTimes(2)

    refreshedRead.resolve({ value: 'fresh' })
    await expect(refreshedResult).resolves.toEqual({ value: 'fresh' })
    oldRead.resolve({ value: 'stale' })
    await oldSettled

    await expect(lease.read(key, load)).resolves.toEqual({ value: 'fresh' })
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('evicts a failed read so the same lease can retry it', async () => {
    const activeScope = scope(31, 'auth-a', 'person-a')
    const key = 'tasks:team-directory:select-v1'
    const lease = createReadLease(activeScope)
    const fail = vi.fn(() => Promise.reject(new Error('temporary read failure')))
    const retry = vi.fn(async () => [{ id: 'team-1' }])
    publishReadScope(activeScope)

    await expect(lease.read(key, fail)).rejects.toThrow('temporary read failure')
    await expect(lease.read(key, retry)).resolves.toEqual([{ id: 'team-1' }])
    expect(fail).toHaveBeenCalledTimes(1)
    expect(retry).toHaveBeenCalledTimes(1)
  })
})
