import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/open-task-count', () => ({ getMyOpenTaskCount: vi.fn() }))

import { getMyOpenTaskCount } from '@/lib/db/open-task-count'
import {
  __resetOpenTaskCountForTests,
  getOpenTaskCountSnapshot,
  subscribeOpenTaskCount,
  watchOpenTaskCount,
} from '@/lib/open-task-count-store'

const mockCount = vi.mocked(getMyOpenTaskCount)

beforeEach(() => {
  vi.resetAllMocks()
  __resetOpenTaskCountForTests()
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
})
