import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/open-task-count', () => ({ getMyOpenTaskCount: vi.fn() }))

import { getMyOpenTaskCount } from '@/lib/db/open-task-count'
import {
  announceOpenTaskCountChanged,
  __resetOpenTaskCountForTests,
  getOpenTaskCountSnapshot,
  subscribeOpenTaskCount,
  watchOpenTaskCount,
} from '@/lib/open-task-count-store'
import { publishReadScope } from '@/lib/scoped-reads'

const mockCount = vi.mocked(getMyOpenTaskCount)

beforeEach(() => {
  publishReadScope(null)
  vi.resetAllMocks()
  __resetOpenTaskCountForTests()
})

afterEach(() => {
  publishReadScope(null)
})

describe('open task count refresh', () => {
  it('refreshes when the browser returns to focus', async () => {
    mockCount.mockResolvedValueOnce(2).mockResolvedValueOnce(3)
    const unsubscribe = subscribeOpenTaskCount(vi.fn())
    watchOpenTaskCount('viewer')
    await vi.waitFor(() => expect(getOpenTaskCountSnapshot()).toEqual({ personId: 'viewer', count: 2 }))

    window.dispatchEvent(new Event('focus'))

    await vi.waitFor(() => expect(getOpenTaskCountSnapshot()).toEqual({ personId: 'viewer', count: 3 }))
    expect(mockCount).toHaveBeenCalledTimes(2)
    unsubscribe()
  })

  it('retries when the watched count previously failed to load', async () => {
    mockCount.mockRejectedValueOnce(new Error('temporary read failure')).mockResolvedValueOnce(4)
    watchOpenTaskCount('viewer')
    await vi.waitFor(() => expect(getOpenTaskCountSnapshot()).toEqual({ personId: 'viewer', count: null }))

    watchOpenTaskCount('viewer')

    expect(mockCount).toHaveBeenCalledTimes(2)
    await vi.waitFor(() => expect(getOpenTaskCountSnapshot()).toEqual({ personId: 'viewer', count: 4 }))
  })

  it('starts a newer read for each write invalidation and ignores superseded counts', async () => {
    const scope = {
      generation: 21,
      authUserId: 'auth-user',
      viewerId: 'viewer',
      orgId: 'org',
      authorityKey: 'member',
    }
    publishReadScope(scope)

    let resolveOldRead!: (count: number) => void
    let resolveFirstRefresh!: (count: number) => void
    let resolveSecondRefresh!: (count: number) => void
    const oldRead = new Promise<number>((resolve) => {
      resolveOldRead = resolve
    })
    const firstRefresh = new Promise<number>((resolve) => {
      resolveFirstRefresh = resolve
    })
    const secondRefresh = new Promise<number>((resolve) => {
      resolveSecondRefresh = resolve
    })
    const oldReadDrained = oldRead.then(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))
    const firstRefreshDrained = firstRefresh.then(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))
    mockCount.mockReturnValueOnce(oldRead).mockReturnValueOnce(firstRefresh).mockReturnValueOnce(secondRefresh)

    const changed = vi.fn()
    const unsubscribe = subscribeOpenTaskCount(changed, scope)
    watchOpenTaskCount('viewer', scope)
    await vi.waitFor(() => expect(mockCount).toHaveBeenCalledTimes(1))

    announceOpenTaskCountChanged()
    await vi.waitFor(() => expect(mockCount).toHaveBeenCalledTimes(2))
    announceOpenTaskCountChanged()
    await vi.waitFor(() => expect(mockCount).toHaveBeenCalledTimes(3))
    resolveSecondRefresh(5)
    await vi.waitFor(() => {
      expect(getOpenTaskCountSnapshot(scope)).toEqual({ personId: 'viewer', count: 5 })
    })

    const notificationsAfterFreshRead = changed.mock.calls.length
    resolveFirstRefresh(4)
    await firstRefreshDrained
    resolveOldRead(3)
    await oldReadDrained

    expect(getOpenTaskCountSnapshot(scope)).toEqual({ personId: 'viewer', count: 5 })
    expect(changed).toHaveBeenCalledTimes(notificationsAfterFreshRead)
    unsubscribe()
  })

  it('returns to unknown when a refresh fails after a successful count', async () => {
    mockCount.mockResolvedValueOnce(4).mockRejectedValueOnce(new Error('temporary read failure'))
    watchOpenTaskCount('viewer')
    await vi.waitFor(() => expect(getOpenTaskCountSnapshot()).toEqual({ personId: 'viewer', count: 4 }))

    announceOpenTaskCountChanged()

    await vi.waitFor(() => expect(getOpenTaskCountSnapshot()).toEqual({ personId: 'viewer', count: null }))
  })
})
