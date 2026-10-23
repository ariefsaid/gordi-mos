import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../supabase', () => ({ supabase: { schema: vi.fn() } }))

import { supabase } from '@/lib/supabase'
import { BlockDocumentConflictError, BlockDocumentTooLargeError, BLOCK_DOCUMENT_MAX_BYTES } from './block-document'
import { readTaskBody, saveTaskBody } from './task-body'

const schemaMock = vi.mocked(supabase.schema)

function stub(result: { data: unknown; error: unknown }) {
  const calls = { table: '', select: '', update: [] as unknown[], eqs: [] as Array<[string, unknown]> }
  const builder: Record<string, unknown> = {}
  builder.select = vi.fn((cols: string) => { calls.select = cols; return builder })
  builder.update = vi.fn((p: unknown) => { calls.update.push(p); return builder })
  builder.eq = vi.fn((c: string, v: unknown) => { calls.eqs.push([c, v]); return builder })
  builder.maybeSingle = vi.fn(() => Promise.resolve(result))
  builder.then = (resolve: (v: unknown) => void) => resolve(result)
  schemaMock.mockReturnValue({ from: vi.fn((table: string) => { calls.table = table; return builder }) } as never)
  return calls
}

beforeEach(() => vi.clearAllMocks())

describe('task description document data layer', () => {
  it('reads the document and the updated_at token from mos.tasks', async () => {
    const calls = stub({ data: { body: [{ type: 'paragraph' }], updated_at: 't1' }, error: null })
    expect(await readTaskBody('t1')).toEqual({ blocks: [{ type: 'paragraph' }], updatedAt: 't1' })
    expect(calls.table).toBe('tasks')
    expect(calls.select).toBe('body,updated_at')
  })

  it('reads a null body as no document yet, and an invisible row as null', async () => {
    stub({ data: { body: null, updated_at: 't1' }, error: null })
    expect(await readTaskBody('t1')).toEqual({ blocks: null, updatedAt: 't1' })
    stub({ data: null, error: null })
    expect(await readTaskBody('t1')).toBeNull()
  })

  it('a saved document reads back unchanged', async () => {
    const blocks = [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello', styles: {} }, { type: 'mention', props: { kind: 'person', id: 'p1' } }] }]
    const calls = stub({ data: [{ updated_at: 't2' }], error: null })
    expect(await saveTaskBody('task-1', blocks, 't1')).toBe('t2')
    expect(calls.update).toEqual([{ body: blocks }])
    stub({ data: { body: calls.update[0] && (calls.update[0] as { body: unknown }).body, updated_at: 't2' }, error: null })
    expect((await readTaskBody('task-1'))?.blocks).toEqual(blocks)
  })

  it('saves conditionally on the read updated_at and never sends updated_at', async () => {
    const calls = stub({ data: [{ updated_at: 't2' }], error: null })
    await saveTaskBody('task-1', [], 't1')
    expect(calls.eqs).toEqual([['id', 'task-1'], ['updated_at', 't1']])
    expect(JSON.stringify(calls.update)).not.toContain('updated_at')
  })

  it('refuses when zero rows match (changed elsewhere, or no longer editable)', async () => {
    stub({ data: [], error: null })
    await expect(saveTaskBody('task-1', [], 't1')).rejects.toBeInstanceOf(BlockDocumentConflictError)
  })

  it('refuses over the byte limit without a request', async () => {
    const calls = stub({ data: [{ updated_at: 't2' }], error: null })
    await expect(saveTaskBody('task-1', [{ type: 'paragraph', content: 'x'.repeat(BLOCK_DOCUMENT_MAX_BYTES) }], 't1'))
      .rejects.toBeInstanceOf(BlockDocumentTooLargeError)
    expect(calls.update).toEqual([])
  })

  it('surfaces a database error', async () => {
    stub({ data: null, error: { message: 'boom' } })
    await expect(saveTaskBody('task-1', [], 't1')).rejects.toThrow(/saveTaskBody failed/)
  })
})
