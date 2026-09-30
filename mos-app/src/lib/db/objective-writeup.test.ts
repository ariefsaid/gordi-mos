import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../supabase', () => ({ supabase: { schema: vi.fn() } }))

import { supabase } from '@/lib/supabase'
import {
  readWriteUp, saveWriteUp, WriteUpConflictError, WriteUpTooLargeError, WRITE_UP_MAX_BYTES,
} from './objective-writeup'

const schemaMock = vi.mocked(supabase.schema)

function stub(result: { data: unknown; error: unknown }) {
  const calls = { update: [] as unknown[], eqs: [] as Array<[string, unknown]> }
  const builder: Record<string, unknown> = {}
  builder.select = vi.fn(() => builder)
  builder.update = vi.fn((p: unknown) => { calls.update.push(p); return builder })
  builder.eq = vi.fn((c: string, v: unknown) => { calls.eqs.push([c, v]); return builder })
  builder.maybeSingle = vi.fn(() => Promise.resolve(result))
  builder.then = (resolve: (v: unknown) => void) => resolve(result)
  schemaMock.mockReturnValue({ from: vi.fn(() => builder) } as never)
  return calls
}

beforeEach(() => vi.clearAllMocks())

describe('objective write-up data layer', () => {
  it('reads the blocks and the updated_at token', async () => {
    stub({ data: { write_up: [{ type: 'paragraph' }], updated_at: 't1' }, error: null })
    expect(await readWriteUp('o1')).toEqual({ writeUp: [{ type: 'paragraph' }], updatedAt: 't1' })
  })

  it('treats a null column as no write-up yet', async () => {
    stub({ data: { write_up: null, updated_at: 't1' }, error: null })
    expect(await readWriteUp('o1')).toEqual({ writeUp: null, updatedAt: 't1' })
  })

  it('saves conditionally on the read updated_at and never sends updated_at', async () => {
    const calls = stub({ data: [{ updated_at: 't2' }], error: null })
    expect(await saveWriteUp('o1', [{ type: 'paragraph' }], 't1')).toBe('t2')
    expect(calls.update).toEqual([{ write_up: [{ type: 'paragraph' }] }])
    expect(calls.eqs).toEqual([['id', 'o1'], ['updated_at', 't1']])
  })

  it('refuses when zero rows match', async () => {
    stub({ data: [], error: null })
    await expect(saveWriteUp('o1', [], 't1')).rejects.toBeInstanceOf(WriteUpConflictError)
  })

  it('refuses over the byte limit without a request', async () => {
    const calls = stub({ data: [{ updated_at: 't2' }], error: null })
    const big = [{ type: 'paragraph', content: 'x'.repeat(WRITE_UP_MAX_BYTES) }]
    await expect(saveWriteUp('o1', big, 't1')).rejects.toBeInstanceOf(WriteUpTooLargeError)
    expect(calls.update).toEqual([])
  })
})
