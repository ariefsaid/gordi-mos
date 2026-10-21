import { beforeEach, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import { latestCancelVoidDate, listCancelVoidRegister, recordCancelVoidReview } from './cancel-void'

vi.mock('@/lib/supabase', () => ({ supabase: { schema: vi.fn() } }))
const schema = vi.mocked(supabase.schema)
beforeEach(() => vi.clearAllMocks())

function builder(result: { data: unknown; error: unknown }) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {}
  for (const method of ['select', 'eq', 'gte', 'lte', 'order', 'in', 'insert']) query[method] = vi.fn(() => query)
  for (const method of ['range', 'limit', 'single']) query[method] = vi.fn().mockResolvedValue(result)
  return query
}

it('reads one branch/date slice including detail rows, then all review history for case identities', async () => {
  const rows = Array.from({ length: 101 }, (_, index) => ({ esb_code: 'TEST', case_id: `case-${index}`, row_id: `case-${index}`, is_case: true }))
  const source = builder({ data: rows, error: null })
  const reviews = builder({ data: [{ id: 'history' }], error: null })
  schema.mockImplementation(name => ({ from: vi.fn(() => name === 'reporting' ? source : reviews) }) as never)
  const result = await listCancelVoidRegister('TEST-BRANCH', '2026-10-01', '2026-10-19')
  expect(result.rows).toEqual(rows)
  expect(source.eq).toHaveBeenCalledWith('branch_code', 'TEST-BRANCH')
  expect(source.gte).toHaveBeenCalledWith('sales_date', '2026-10-01')
  expect(source.lte).toHaveBeenCalledWith('sales_date', '2026-10-19')
  expect(reviews.in).toHaveBeenCalledWith('case_id', rows.slice(0, 100).map(row => row.case_id))
  expect(reviews.in).toHaveBeenCalledWith('case_id', ['case-100'])
  expect(reviews.in).toHaveBeenCalledWith('esb_code', ['TEST'])
  expect(result.reviews).toHaveLength(2)
})

it('does not read unrelated reviews for an empty slice and propagates read failures', async () => {
  const query = builder({ data: [], error: null })
  schema.mockReturnValue({ from: vi.fn(() => query) } as never)
  expect(await listCancelVoidRegister('TEST', '2026-10-01', '2026-10-19')).toEqual({ rows: [], reviews: [] })
  expect(schema).toHaveBeenCalledTimes(1)
  query.range.mockResolvedValue({ data: null, error: new Error('offline') })
  await expect(listCancelVoidRegister('TEST', '2026-10-01', '2026-10-19')).rejects.toThrow()
})

it('appends only the human fields; org, reviewer, evidence and timestamp belong to the server', async () => {
  const query = builder({ data: { id: 'new-review' }, error: null })
  schema.mockReturnValue({ from: vi.fn(() => query) } as never)
  const input = { esbCode: 'TEST', caseId: 'case', personId: 'person', reason: 'other' as const, note: '  Checked  ' }
  expect(await recordCancelVoidReview(input)).toEqual({ id: 'new-review' })
  expect(query.insert).toHaveBeenCalledWith({ esb_code: 'TEST', case_id: 'case', person_id: 'person', reason: 'other', note: 'Checked' })
  query.single.mockResolvedValue({ data: null, error: new Error('refused') })
  await expect(recordCancelVoidReview(input)).rejects.toThrow('refused')
})

it('ops lead anchors to readable case dates without querying financial data', async () => {
  const query = builder({ data: [{ sales_date: '2026-10-19' }], error: null })
  const from = vi.fn(() => query)
  schema.mockReturnValue({ from } as never)
  expect(await latestCancelVoidDate('TEST')).toBe('2026-10-19')
  expect(from).toHaveBeenCalledWith('cancel_void_register')
  query.limit.mockResolvedValue({ data: [], error: null })
  expect(await latestCancelVoidDate('TEST')).toBeNull()
  query.limit.mockResolvedValue({ data: null, error: new Error('refused') })
  await expect(latestCancelVoidDate('TEST')).rejects.toThrow('refused')
})
