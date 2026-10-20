import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createScopedCountStore } from './scoped-count-store'
import { publishReadScope } from './scoped-reads'

const scope = (viewerId: string) => ({
  generation: 1,
  authUserId: 'auth-user',
  viewerId,
  orgId: 'org',
  authorityKey: 'member',
})

beforeEach(() => publishReadScope(null))

describe('scoped count store', () => {
  it('shares a read with subscribers and refreshes the active count', async () => {
    const read = vi.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(3)
    const store = createScopedCountStore(read)
    publishReadScope(scope('viewer'))
    const changed = vi.fn()
    const unsubscribe = store.subscribe('viewer', scope('viewer'), changed)

    await store.watch('viewer', scope('viewer'))
    expect(store.getSnapshot('viewer', scope('viewer'))).toEqual({ key: 'viewer', count: 2, loading: false })

    await store.refresh()
    expect(store.getSnapshot('viewer', scope('viewer'))).toEqual({ key: 'viewer', count: 3, loading: false })
    expect(read).toHaveBeenCalledTimes(2)
    expect(changed).toHaveBeenCalled()
    unsubscribe()
  })

  it('refreshes an explicit scoped key without requiring a subscriber', async () => {
    const read = vi.fn().mockResolvedValue(9)
    const store = createScopedCountStore(read)
    const viewerScope = scope('viewer')
    publishReadScope(viewerScope)

    await store.refresh('viewer', viewerScope)

    expect(read).toHaveBeenCalledOnce()
    expect(store.getSnapshot('viewer', viewerScope)).toEqual({ key: 'viewer', count: 9, loading: false })
  })

  it('does not publish a stale read after the viewer scope changes', async () => {
    let resolveOldRead!: (count: number) => void
    const read = vi.fn()
      .mockImplementationOnce(() => new Promise<number>((resolve) => { resolveOldRead = resolve }))
      .mockResolvedValueOnce(7)
    const store = createScopedCountStore(read)

    publishReadScope(scope('viewer-a'))
    const oldRead = store.watch('viewer-a', scope('viewer-a'))
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1))
    publishReadScope(scope('viewer-b'))
    await store.watch('viewer-b', scope('viewer-b'))
    resolveOldRead(4)
    await oldRead

    expect(store.getSnapshot('viewer-b', scope('viewer-b'))).toEqual({ key: 'viewer-b', count: 7, loading: false })
    expect(store.getSnapshot('viewer-a', scope('viewer-a')).count).toBeNull()
  })
})
