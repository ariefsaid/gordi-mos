import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../supabase', () => ({ supabase: { schema: vi.fn() } }))

import { supabase } from '@/lib/supabase'
import { listTaskViewers, addTaskViewer, removeTaskViewer } from './task-viewers'

const schemaMock = vi.mocked(supabase.schema)
const TASK = 'task-1'

// A chainable query builder that resolves to one queued result and records what it was asked.
function builder(result: { data?: unknown; error?: unknown }) {
  const calls: Record<string, unknown[][]> = { select: [], insert: [], delete: [], eq: [], order: [] }
  const b: Record<string, unknown> = {}
  for (const name of Object.keys(calls)) {
    b[name] = vi.fn((...args: unknown[]) => { calls[name].push(args); return b })
  }
  b.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null, ...result }).then(resolve)
  schemaMock.mockReturnValue({ from: vi.fn(() => b) } as never)
  return calls
}

beforeEach(() => vi.clearAllMocks())

describe('task viewers (the who-can-see list)', () => {
  it('lists the people on a Task, oldest first, filtered by task only (RLS decides the rest)', async () => {
    const rows = [{ id: 'v1', task_id: TASK, person_id: 'p1' }]
    const calls = builder({ data: rows })
    expect(await listTaskViewers(TASK)).toEqual(rows)
    expect(calls.eq).toEqual([['task_id', TASK]])
    expect(calls.order[0][0]).toBe('created_at')
  })

  it('returns an empty list when the Task is not readable', async () => {
    builder({ data: null })
    expect(await listTaskViewers(TASK)).toEqual([])
  })

  it('adds a person without sending org_id', async () => {
    const calls = builder({})
    await addTaskViewer(TASK, 'p2')
    expect(calls.insert).toEqual([[{ task_id: TASK, person_id: 'p2' }]])
  })

  it('treats adding someone already on the list as done', async () => {
    builder({ error: { code: '23505', message: 'duplicate' } })
    await expect(addTaskViewer(TASK, 'p2')).resolves.toBeUndefined()
  })

  it('surfaces any other add failure (for example the writer may not change privacy)', async () => {
    builder({ error: { code: '42501', message: 'row-level security' } })
    await expect(addTaskViewer(TASK, 'p2')).rejects.toThrow(/row-level security/)
  })

  it('removes one person from one Task', async () => {
    const calls = builder({})
    await removeTaskViewer(TASK, 'p2')
    expect(calls.delete).toHaveLength(1)
    expect(calls.eq).toEqual([['task_id', TASK], ['person_id', 'p2']])
  })

  it('surfaces list and remove failures', async () => {
    builder({ error: { message: 'down' } })
    await expect(listTaskViewers(TASK)).rejects.toThrow(/down/)
    await expect(removeTaskViewer(TASK, 'p2')).rejects.toThrow(/down/)
  })
})
