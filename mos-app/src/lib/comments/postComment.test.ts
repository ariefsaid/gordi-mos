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
              { id: 'person-arief', full_name: 'Arief Said' },
              { id: 'person-riri', full_name: 'Riri Kitchen' },
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
  it('inserts a comment, resolves mentions, and fans out one notification per mentionee', async () => {
    const { sb, rec } = makeSb()

    const id = await postComment({
      sb: sb as unknown as CommentSupabase,
      entityType: 'task',
      entityId: 'task-1',
      body: 'Please review @riri and @unknown',
    })

    expect(id).toBe('comment-1')
    expect(rec.schemas).toContain('mos')
    expect(rec.tables).toContain('comments')
    expect(rec.inserts).toContainEqual({ entity_type: 'task', entity_id: 'task-1', body: 'Please review @riri and @unknown' })
    expect(rec.schemas).toContain('shared')
    expect(rec.tables).toContain('people')
    expect(rec.filters).toContainEqual(['archived_at', null])
    expect(rec.rpcs).toEqual([
      ['create_notification', {
        p_owner: 'person-riri',
        p_severity: 'info',
        p_title: '@mention in task',
        p_body: 'Please review @riri and @unknown',
        p_metadata: { source: 'mention', entity: { type: 'task', id: 'task-1' } },
      }],
    ])
  })

  it('does not call the definer helper when no mention resolves', async () => {
    const { sb, rec } = makeSb()

    await postComment({ sb: sb as unknown as CommentSupabase, entityType: 'task', entityId: 'task-1', body: 'No mention @unknown' })

    expect(rec.rpcs).toEqual([])
  })
})
