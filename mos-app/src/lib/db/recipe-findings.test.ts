import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase', () => ({ supabase: { schema: vi.fn() } }))
import { supabase } from '@/lib/supabase'
import { listRecipeFindings } from './recipe-findings'

beforeEach(() => vi.clearAllMocks())

function database(errorTable?: string) {
  const calls: [string, string, unknown[]][] = []
  vi.mocked(supabase.schema).mockReturnValue({ from: (table: string) => {
    const builder: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'in', 'gte', 'lte', 'order', 'range']) {
      builder[method] = (...args: unknown[]) => { calls.push([table, method, args]); return builder }
    }
    builder.then = (resolve: (value: unknown) => void) => Promise.resolve({ data: [], error: table === errorTable ? new Error('offline') : null }).then(resolve)
    return builder
  } } as never)
  return calls
}

it('reads branch/company-bounded days with recipe history and capture receipts through RLS', async () => {
  const calls = database()
  expect(await listRecipeFindings('NEW', '2026-10-01', '2026-10-08', ['TEST'])).toEqual({ rows: [], receipts: [] })
  expect(supabase.schema).toHaveBeenCalledWith('reporting')
  expect(calls).toContainEqual(['recipe_deduction_findings', 'eq', ['branch_code', 'NEW']])
  expect(calls).toContainEqual(['recipe_deduction_findings', 'in', ['esb_code', ['TEST']]])
  expect(calls).toContainEqual(['recipe_deduction_findings', 'gte', ['day', '2026-10-01']])
  expect(calls).toContainEqual(['recipe_deduction_findings', 'lte', ['day', '2026-10-08']])
  expect(calls).toContainEqual(['recipe_deduction_findings', 'order', ['impact_idr', { ascending: false, nullsFirst: false }]])
  expect(calls).toContainEqual(['recipe_deduction_findings', 'range', [0, 999]])
  expect(calls.find(c => c[0] === 'recipe_deduction_findings' && c[1] === 'select')?.[2][0]).toContain('recipe_versions(version,first_seen)')
  expect(calls.some(c => c[2][0] === 'org_id')).toBe(false)
})

it.each(['recipe_deduction_findings', 'recipe_finding_snapshots'])('does not turn a failed %s read into a clean empty register', async table => {
  database(table)
  await expect(listRecipeFindings('NEW', '2026-10-01', '2026-10-08', ['TEST'])).rejects.toThrow('offline')
})
