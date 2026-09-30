import { describe, it, expect, vi, beforeEach } from 'vitest'

// getMyOpenTaskCount reaches mos via supabase.schema('mos').from('tasks').select('*', {count,head})
// then filter builders, awaited for { count, error }.
vi.mock('../supabase', () => ({ supabase: { schema: vi.fn() } }))

import { getMyOpenTaskCount } from './open-task-count'
import { supabase } from '@/lib/supabase'

const schemaMock = vi.mocked(supabase.schema)
const PERSON = '40000000-0000-0000-0000-000000000001'

interface Rec { tables: string[]; selects: Array<[string, unknown]>; filters: string[] }
type Result = { count: number | null; error: unknown }

function mockTasks(result: Result): Rec {
  const rec: Rec = { tables: [], selects: [], filters: [] }
  const builder: Record<string, unknown> = {}
  builder.then = (resolve: (v: Result) => unknown) => resolve(result)
  builder.select = vi.fn((s: string, opts?: unknown) => { rec.selects.push([s, opts]); return builder })
  builder.is = vi.fn((c: string) => { rec.filters.push(`is:${c}`); return builder })
  builder.neq = vi.fn((c: string, v: unknown) => { rec.filters.push(`neq:${c}=${String(v)}`); return builder })
  builder.or = vi.fn((value: string) => { rec.filters.push(`or:${value}`); return builder })
  schemaMock.mockReturnValue({ from: vi.fn((table: string) => { rec.tables.push(table); return builder }) } as never)
  return rec
}

beforeEach(() => vi.clearAllMocks())

describe('getMyOpenTaskCount — the ONE open-task count behind the rail badge and Home (#1129)', () => {
  it('returns null without a valid viewer person id (never an org total)', async () => {
    expect(await getMyOpenTaskCount()).toBeNull()
    expect(await getMyOpenTaskCount('not-a-uuid')).toBeNull()
    expect(schemaMock).not.toHaveBeenCalled()
  })

  it("counts the viewer's own (PIC or Supervisor), non-Done, non-archived tasks with a HEAD exact count", async () => {
    const rec = mockTasks({ count: 11, error: null })
    expect(await getMyOpenTaskCount(PERSON)).toBe(11)
    expect(rec.tables).toEqual(['tasks'])
    expect(rec.selects).toEqual([['*', { count: 'exact', head: true }]])
    expect(rec.filters).toEqual(['is:archived_at', 'neq:status=Done',
      `or:responsible_person_id.eq.${PERSON},accountable_person_id.eq.${PERSON}`])
  })

  it('coalesces a null count to 0', async () => {
    mockTasks({ count: null, error: null })
    expect(await getMyOpenTaskCount(PERSON)).toBe(0)
  })

  it('throws when the count query errors', async () => {
    mockTasks({ count: null, error: { message: 'rls denied' } })
    await expect(getMyOpenTaskCount(PERSON)).rejects.toThrow(/open task count failed/)
  })
})
