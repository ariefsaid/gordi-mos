import { describe, expect, it, vi } from 'vitest'
import { postComment, type CommentSupabase } from './postComment'

type Result = { data: unknown; error: unknown }

function makeBuilder(result: Result, rec: {
  selects: string[]
  inserts: unknown[]
  filters: Array<[string, unknown]>
  orders: Array<[string, unknown]>
}) {
  const builder: Record<string, unknown> = {}
  builder.select = vi.fn((s?: string) => { if (s) rec.selects.push(s); return builder })
  builder.insert = vi.fn((payload: unknown) => { rec.inserts.push(payload); return builder })
  builder.is = vi.fn((col: string, value: unknown) => { rec.filters.push([col, value]); return builder })
  builder.order = vi.fn((col: string, opts?: unknown) => { rec.orders.push([col, opts]); return builder })
  builder.single = vi.fn(() => Promise.resolve(result))
  builder.then = (resolve: (value: Result) => unknown) => Promise.resolve(result).then(resolve)
  return builder
}

function makeSb() {
  const rec = {
    schemas: [] as string[],
    tables: [] as string[],
    selects: [] as string[],
    inserts: [] as unknown[],
    filters: [] as Array<[string, unknown]>,
    orders: [] as Array<[string, unknown]>,
    rpcs: [] as Array<[string, unknown]>,
  }

  const schema = vi.fn((name: string) => {
    rec.schemas.push(name)
    return {
      from: vi.fn((table: string) => {
        rec.tables.push(table)
        if (name === 'shared' && table === 'people') {
          return makeBuilder({
            data: [
              { id: 'person-arden', full_name: 'Arden Sample' },
              { id: 'person-nico', full_name: 'Nico Kitchen' },
            ],
            error: null,
          }, rec)
        }
        if (name === 'mos' && table === 'comments') {
          return makeBuilder({ data: { id: 'comment-1' }, error: null }, rec)
        }
        return makeBuilder({ data: null, error: null }, rec)
      }),
      rpc: vi.fn((name: string, args: unknown) => {
        rec.rpcs.push([name, args])
        return Promise.resolve({ data: 'notification-1', error: null })
      }),
    }
  })

  return { sb: { schema }, rec }
}

describe('postComment (T27, AC-P3-CM-003/005)', () => {
  it('persists a comment and notifies each explicitly mentioned person', async () => {
    const { sb, rec } = makeSb()

    const id = await postComment({
      sb: sb as unknown as CommentSupabase,
      entityType: 'task',
      entityId: 'task-1',
      body: 'Please review @nico and @unknown',
      locale: 'en',
    })

    expect(id).toBe('comment-1')
    expect(rec.schemas).toContain('mos')
    expect(rec.tables).toContain('comments')
    expect(rec.inserts).toContainEqual({ entity_type: 'task', entity_id: 'task-1', body: 'Please review @nico and @unknown' })
    expect(rec.schemas).toContain('shared')
    expect(rec.tables).toContain('people')
    expect(rec.filters).toContainEqual(['archived_at', null])
    expect(rec.rpcs).toEqual([
      ['create_comment_mention_notification', {
        p_owner: 'person-nico',
        p_comment_id: 'comment-1',
        p_locale: 'en',
      }],
    ])
  })

  it('composes mention notification titles in the commenting person’s locale', async () => {
    const { sb, rec } = makeSb()

    await postComment({
      sb: sb as unknown as CommentSupabase,
      entityType: 'signal',
      entityId: 'signal-1',
      body: 'Tolong cek @nico',
      locale: 'id',
    })

    expect(rec.rpcs).toEqual([
      ['create_comment_mention_notification', {
        p_owner: 'person-nico',
        p_comment_id: 'comment-1',
        p_locale: 'id',
      }],
    ])
  })

  it('passes the chosen locale for server-composed notification titles', async () => {
    const { sb, rec } = makeSb()

    await postComment({
      sb: sb as unknown as CommentSupabase,
      entityType: 'task',
      entityId: 'task-1',
      body: 'Please review @nico',
      locale: 'en',
    })

    expect(rec.rpcs).toEqual([
      ['create_comment_mention_notification', {
        p_owner: 'person-nico',
        p_comment_id: 'comment-1',
        p_locale: 'en',
      }],
    ])
  })

  it('does not create notifications when no mention resolves', async () => {
    const { sb, rec } = makeSb()

    await postComment({ sb: sb as unknown as CommentSupabase, entityType: 'task', entityId: 'task-1', body: 'No mention @unknown', locale: 'en' })

    expect(rec.rpcs).toEqual([])
  })

  it('a notification RPC failure does not invalidate the saved comment', async () => {
    // The persisted comment id is returned even when its best-effort notification fails.
    const rec = {
      schemas: [] as string[],
      tables: [] as string[],
      selects: [] as string[],
      inserts: [] as unknown[],
      filters: [] as Array<[string, unknown]>,
      orders: [] as Array<[string, unknown]>,
      rpcs: [] as Array<[string, unknown]>,
    }
    const commentResult = { data: { id: 'comment-1' }, error: null }
    const peopleResult = {
      data: [{ id: 'person-nico', full_name: 'Nico Kitchen' }],
      error: null,
    }
    const schema = vi.fn((name: string) => {
      rec.schemas.push(name)
      return {
        from: vi.fn((table: string) => {
          rec.tables.push(table)
          const builder = makeBuilder(
            name === 'shared' && table === 'people' ? peopleResult : commentResult,
            rec,
          )
          return builder
        }),
        rpc: vi.fn((name: string, args: unknown) => {
          rec.rpcs.push([name, args])
          return Promise.resolve({ data: null, error: { message: 'transient rpc blowup' } })
        }),
      }
    })
    const sb = { schema }

    const id = await postComment({
      sb: sb as unknown as CommentSupabase,
      entityType: 'task',
      entityId: 'task-1',
      body: 'Hey @nico',
      locale: 'en',
    })

    // The comment row is the durable unit — its id is returned despite the mention failure.
    expect(id).toBe('comment-1')
    // The fan-out was attempted exactly once.
    expect(rec.rpcs).toHaveLength(1)
  })
})
