import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../supabase', () => ({ supabase: { schema: vi.fn() } }))

import { searchTasksByTitle } from './tasks'
import { searchFollowUpsByCounterparty } from './follow-ups'
import { searchSignalsByBody } from './signals'
import { searchWorkLinesByName } from './work-lines'
import { searchObjectivesByName } from './objectives'
import { searchPeopleByName } from './directory'
import { containsPattern } from './like-pattern'
import { supabase } from '@/lib/supabase'

const schemaMock = vi.mocked(supabase.schema)

/** One permissive builder: every chain call is recorded as [method, arg, opts]; awaiting resolves empty. */
function recorder() {
  const calls: Array<[string, unknown, unknown?]> = []
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'is', 'in', 'ilike', 'order', 'limit', 'single', 'maybeSingle']) {
    b[m] = vi.fn((a?: unknown, c?: unknown) => { calls.push([m, a, c]); return b })
  }
  b.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve)
  return { calls, b }
}

beforeEach(() => schemaMock.mockReset())

describe('palette searches escape LIKE wildcards via containsPattern (#1359)', () => {
  it('routes every unescaped palette search through containsPattern, so % _ * match literally', async () => {
    const cases: Array<[() => Promise<unknown>, string, string]> = [
      [() => searchSignalsByBody('50%'), 'signals', containsPattern('50%')],
      [() => searchFollowUpsByCounterparty('a_b'), 'follow_ups', containsPattern('a_b')],
      [() => searchTasksByTitle('a*b'), 'tasks', containsPattern('a*b')],
      [() => searchWorkLinesByName('50%'), 'work_lines', containsPattern('50%')],
      [() => searchObjectivesByName('a_b'), 'objectives', containsPattern('a_b')],
      [() => searchPeopleByName('a*b'), 'people', containsPattern('a*b')],
    ]
    for (const [run, table, pattern] of cases) {
      const rec = recorder()
      schemaMock.mockReturnValue({ from: vi.fn((t: string) => { expect(t).toBe(table); return rec.b }) } as never)
      await run()
      const hit = rec.calls.find(([method]) => method === 'ilike')
      expect(hit?.[2], table).toBe(pattern)
    }
  })
})