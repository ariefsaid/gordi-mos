import { describe, it, expect } from 'vitest'
import { compileQuerySpec, compileCompositionSpec } from './compiler'
import { MAX_PANELS_PER_VIEW } from './types'
import type { QuerySpec, CompositionSpec } from './types'

const ctx = { personId: 'p1', orgId: 'o1' }
const taskQuery = (extra: Partial<QuerySpec> = {}): QuerySpec => ({
  entity: 'tasks', select: ['id', 'title', 'status'],
  timeRange: { column: 'due_date', from: '$start_of_month', to: '$end_of_month' },
  ...extra,
})

describe('compileQuerySpec — AC-UV-002', () => {
  it('rejects unknown entity / column / op / non-numeric aggregate / bad limit', () => {
    expect(() => compileQuerySpec({ entity: 'tasks', select: ['id'], timeRange: { column: 'due_date', from: 'a', to: 'b' } }, ctx)).not.toThrow() // ok path
    expect(() => compileQuerySpec({ entity: 'nope' as never, select: [], timeRange: { column: 'due_date', from: 'a', to: 'b' } }, ctx)).toThrowError(/UNKNOWN_ENTITY/)
    expect(() => compileQuerySpec({ entity: 'tasks', select: ['secret'], timeRange: { column: 'due_date', from: 'a', to: 'b' } }, ctx)).toThrowError(/UNKNOWN_COLUMN/)
    expect(() => compileQuerySpec({ entity: 'tasks', select: ['id'], filters: [{ column: 'status', op: 'matches' as never, value: 'x' }], timeRange: { column: 'due_date', from: 'a', to: 'b' } }, ctx)).toThrowError(/UNKNOWN_OP/)
    expect(() => compileQuerySpec({ entity: 'sales_daily_revenue', select: ['clean_revenue'], aggregate: { fn: 'sum', column: 'branch_name', alias: 'x' }, timeRange: { column: 'revenue_date', from: 'a', to: 'b' } }, ctx)).toThrowError(/NON_NUMERIC_AGGREGATE/)
    expect(() => compileQuerySpec({ entity: 'tasks', select: ['id'], limit: 0, timeRange: { column: 'due_date', from: 'a', to: 'b' } }, ctx)).toThrowError(/INVALID_LIMIT/)
    expect(() => compileQuerySpec({ entity: 'tasks', select: ['id'], limit: 999, timeRange: { column: 'due_date', from: 'a', to: 'b' } }, ctx)).toThrowError(/INVALID_LIMIT/)
  })
  it('rejects a non-groupable column in groupBy with NOT_GROUPABLE_COLUMN', () => {
    expect(() => compileQuerySpec({ entity: 'tasks', select: ['id'], groupBy: 'title', timeRange: { column: 'due_date', from: 'a', to: 'b' } }, ctx)).toThrowError(/NOT_GROUPABLE_COLUMN/)
  })
  it('rejects an `in` filter whose value array exceeds 500 entries (FILTER_LIST_TOO_LONG)', () => {
    const tooLong = Array.from({ length: 501 }, (_, i) => `id-${i}`)
    expect(() => compileQuerySpec({
      entity: 'tasks', select: ['id'],
      filters: [{ column: 'status', op: 'in', value: tooLong }],
      timeRange: { column: 'due_date', from: 'a', to: 'b' },
    }, ctx)).toThrowError(/FILTER_LIST_TOO_LONG/)
  })
  it('allows an `in` filter whose value array is exactly 500 entries', () => {
    const atLimit = Array.from({ length: 500 }, (_, i) => `id-${i}`)
    expect(() => compileQuerySpec({
      entity: 'tasks', select: ['id'],
      filters: [{ column: 'status', op: 'in', value: atLimit }],
      timeRange: { column: 'due_date', from: 'a', to: 'b' },
    }, ctx)).not.toThrow()
  })
})

describe('compileQuerySpec — union groupBy/aggregate columns into resolvedSelect (Sec-fix item 1)', () => {
  it('includes the groupBy column and the aggregate column in resolvedSelect even when the caller omitted them from select', () => {
    const c = compileQuerySpec({
      entity: 'sales_daily_revenue',
      select: ['branch_name'], // caller only asked for branch_name
      groupBy: 'branch_code',   // not in select
      aggregate: { fn: 'sum', column: 'clean_revenue', alias: 'total' }, // not in select
      timeRange: { column: 'revenue_date', from: 'a', to: 'b' },
    }, ctx)
    expect(c.resolvedSelect).toEqual(expect.arrayContaining(['branch_name', 'branch_code', 'clean_revenue']))
    // no silent duplicate when already present
    expect(c.resolvedSelect.filter((col) => col === 'branch_code')).toHaveLength(1)
  })
  it('does not duplicate a column already present in select', () => {
    const c = compileQuerySpec({
      entity: 'sales_daily_revenue',
      select: ['branch_code', 'clean_revenue'],
      groupBy: 'branch_code',
      aggregate: { fn: 'sum', column: 'clean_revenue', alias: 'total' },
      timeRange: { column: 'revenue_date', from: 'a', to: 'b' },
    }, ctx)
    expect(c.resolvedSelect.filter((col) => col === 'branch_code')).toHaveLength(1)
    expect(c.resolvedSelect.filter((col) => col === 'clean_revenue')).toHaveLength(1)
  })
})

describe('compileQuerySpec — AC-UV-003 (tokens)', () => {
  it('resolves $current_person / $current_org / date tokens', () => {
    const c = compileQuerySpec({ entity: 'tasks', select: ['id'], filters: [{ column: 'responsible_person_id', op: 'eq', value: '$current_person' }], timeRange: { column: 'due_date', from: '$start_of_month', to: '$end_of_month' } }, ctx)
    expect(c.resolvedFilters[0].value).toBe('p1')
    expect(c.resolvedFilters[1].value).toEqual([expect.any(String), expect.any(String)])
  })
  it('rejects unknown $ token and unresolvable-known token (none in P1 set, but guard holds)', () => {
    expect(() => compileQuerySpec({ entity: 'tasks', select: ['id'], filters: [{ column: 'status', op: 'eq', value: '$bogus' }], timeRange: { column: 'due_date', from: 'a', to: 'b' } }, ctx)).toThrowError(/UNKNOWN_TOKEN/)
  })
  it('never emits a $ token in the compiled output', () => {
    const c = compileQuerySpec(taskQuery({ filters: [{ column: 'responsible_person_id', op: 'eq', value: '$current_person' }] }), ctx)
    const json = JSON.stringify(c)
    expect(json).not.toMatch(/\$current/)
  })
})

describe('compileQuerySpec — AC-UV-004 (D7 ceilings)', () => {
  it('requires a timeRange for tasks (requiresTimeRange)', () => {
    expect(() => compileQuerySpec({ entity: 'tasks', select: ['id'] }, ctx)).toThrowError(/MISSING_TIME_RANGE/)
  })
  it('does NOT require a timeRange for catalog entities (objectives)', () => {
    expect(() => compileQuerySpec({ entity: 'objectives', select: ['id', 'name'] }, ctx)).not.toThrow()
  })
  it('always carries a limit in [1,500] (explicit or defaulted for aggregate)', () => {
    const withAgg = compileQuerySpec({ entity: 'sales_daily_revenue', select: ['clean_revenue'], aggregate: { fn: 'sum', column: 'clean_revenue', alias: 'total' }, timeRange: { column: 'revenue_date', from: 'a', to: 'b' } }, ctx)
    expect(withAgg.limit).toBe(500)
  })
})

describe('compileCompositionSpec — AC-UV-005/006 (boundary)', () => {
  const spec = (panels: CompositionSpec['panels']): CompositionSpec => ({ version: 1, panels })
  const goodPanel = { id: 'p1', primitive: 'DataTable', querySpec: taskQuery() }
  it('rejects version !== 1', () => {
    expect(() => compileCompositionSpec({ version: 2 as 1, panels: [goodPanel] }, ctx)).toThrowError(/UNSUPPORTED_VERSION/)
  })
  it('rejects an off-registry primitive', () => {
    expect(() => compileCompositionSpec(spec([{ id: 'p1', primitive: 'Bogus', querySpec: taskQuery() }]), ctx)).toThrowError(/UNKNOWN_PRIMITIVE/)
  })
  it('rejects an off-whitelist entity (boundary never lets unknown through)', () => {
    expect(() => compileCompositionSpec(spec([{ id: 'p1', primitive: 'DataTable', querySpec: { entity: 'nope' as never, select: ['id'], timeRange: { column: 'due_date', from: 'a', to: 'b' } } }]), ctx)).toThrowError(/UNKNOWN_ENTITY/)
  })
  it('compiles a valid spec to CompiledPanels with schema+table', () => {
    const out = compileCompositionSpec(spec([goodPanel]), ctx)
    expect(out).toHaveLength(1)
    expect(out[0].compiledQuery).toMatchObject({ schema: 'mos', table: 'tasks' })
  })
  it('rejects an empty panel array', () => {
    expect(() => compileCompositionSpec(spec([]), ctx)).toThrow()
  })
  it('rejects more than MAX_PANELS_PER_VIEW (20) panels', () => {
    const tooMany = Array.from({ length: MAX_PANELS_PER_VIEW + 1 }, (_, i) => ({ ...goodPanel, id: `p${i}` }))
    expect(() => compileCompositionSpec(spec(tooMany), ctx)).toThrowError(new RegExp(`${MAX_PANELS_PER_VIEW}`))
  })
  it('accepts exactly MAX_PANELS_PER_VIEW panels (boundary, not off-by-one)', () => {
    const exact = Array.from({ length: MAX_PANELS_PER_VIEW }, (_, i) => ({ ...goodPanel, id: `p${i}` }))
    expect(() => compileCompositionSpec(spec(exact), ctx)).not.toThrow()
  })
  it('rejects a malformed querySpec whose `select` is not an array with a ValidationError, never a raw TypeError', () => {
    // DELIBERATE CHANGE (P1 review fix-wave item 4): previously a malformed `select` blew up
    // inside compileQuerySpec's `for (const col of spec.select)` with a native TypeError —
    // an unvalidated crash reaching the render boundary (ADR-0017 D5 forbids this). Now every
    // shape defect — including a bad `select` — degrades to a proper ValidationError.
    const brokenPanel = { id: 'p1', primitive: 'DataTable', querySpec: { entity: 'tasks', select: null } }
    expect(() => compileCompositionSpec(spec([brokenPanel as never]), ctx)).toThrowError(/INVALID_SPEC_SHAPE/)
  })
})

describe('compileCompositionSpec — top-level shape guards (INVALID_SPEC_SHAPE)', () => {
  it('rejects a null spec with a ValidationError, never a TypeError', () => {
    expect(() => compileCompositionSpec(null as never, ctx)).toThrowError(/INVALID_SPEC_SHAPE/)
  })
  it('rejects a non-object spec (string) with a ValidationError', () => {
    expect(() => compileCompositionSpec('nope' as never, ctx)).toThrowError(/INVALID_SPEC_SHAPE/)
  })
  it('rejects a spec whose panels is not an array with a ValidationError', () => {
    expect(() => compileCompositionSpec({ version: 1, panels: 'nope' } as never, ctx)).toThrowError(/INVALID_SPEC_SHAPE/)
  })
  it('rejects a spec missing panels entirely with a ValidationError', () => {
    expect(() => compileCompositionSpec({ version: 1 } as never, ctx)).toThrowError(/INVALID_SPEC_SHAPE/)
  })
  it('rejects a panel whose querySpec.select is not an array with a ValidationError (not a raw TypeError)', () => {
    const bad = { id: 'p1', primitive: 'DataTable', querySpec: { entity: 'tasks', select: 'nope' } }
    expect(() => compileCompositionSpec({ version: 1, panels: [bad] } as never, ctx)).toThrowError(/INVALID_SPEC_SHAPE/)
  })
})
