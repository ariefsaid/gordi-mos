import { describe, it, expect, vi } from 'vitest'
import { fanOut, type NotificationSink, type NotificationRow } from './channelAdapter'

function fakeSink(onInsert: (row: NotificationRow) => { error: { message: string } | null }): {
  sink: NotificationSink
  inserted: NotificationRow[]
} {
  const inserted: NotificationRow[] = []
  const sink: NotificationSink = {
    schema: () => ({
      from: () => ({
        insert: async (row: NotificationRow) => {
          inserted.push(row)
          return onInsert(row)
        },
      }),
    }),
  }
  return { sink, inserted }
}

describe('channelAdapter fanOut (AC-P3-NF-003)', () => {
  it('AC-P3-NF-003: writes the in-app row and calls push, not throwing when VAPID is absent', async () => {
    const { sink, inserted } = fakeSink(() => ({ error: null }))
    const dispatchPush = vi.fn(async () => ({ ok: false, reason: 'no-vapid' }))
    const row: NotificationRow = { severity: 'info', title: 'Hi', metadata: { entity: { type: 'task' } } }

    const result = await fanOut({ sb: sink, dispatchPush }, row)

    expect(inserted).toEqual([row]) // in-app row written
    expect(dispatchPush).toHaveBeenCalledWith(row) // push channel invoked
    expect(result).toEqual({ inApp: true, push: { ok: false, reason: 'no-vapid' } })
  })

  it('AC-P3-NF-003: a push failure is swallowed into the result — the in-app row still lands', async () => {
    const { sink, inserted } = fakeSink(() => ({ error: null }))
    const dispatchPush = vi.fn(async () => {
      throw new Error('push transport down')
    })

    const result = await fanOut({ sb: sink, dispatchPush }, { title: 'T' })

    expect(inserted).toHaveLength(1) // durable channel unaffected
    expect(result.inApp).toBe(true)
    expect(result.push).toEqual({ ok: false, reason: 'push transport down' })
  })

  it('AC-P3-NF-003: with no push transport wired, the in-app write still lands', async () => {
    const { sink, inserted } = fakeSink(() => ({ error: null }))
    const result = await fanOut({ sb: sink }, { title: 'T' })
    expect(inserted).toHaveLength(1)
    expect(result.push).toEqual({ ok: false, reason: 'no-transport' })
  })

  it('AC-P3-NF-003: an in-app write error throws (the row must not be silently dropped)', async () => {
    const { sink } = fakeSink(() => ({ error: { message: 'rls denied' } }))
    await expect(fanOut({ sb: sink }, { title: 'T' })).rejects.toThrow(/rls denied/)
  })
})
