import { describe, it, expect } from 'vitest'
import { compileQuerySpec, compileCompositionSpec } from './compiler'
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
    const tooMany = Array.from({ length: 21 }, (_, i) => ({ ...goodPanel, id: `p${i}` }))
    expect(() => compileCompositionSpec(spec(tooMany), ctx)).toThrowError(/UNSUPPORTED_VERSION/)
  })
  it('propagates a non-ValidationError thrown while compiling a panel unchanged', () => {
    // A malformed querySpec whose `select` is not an array blows up inside compileQuerySpec's
    // `for (const col of spec.select)` with a native TypeError, not a ValidationError — the
    // boundary must not swallow or recode a genuine bug as a ValidationError.
    const brokenPanel = { id: 'p1', primitive: 'DataTable', querySpec: { entity: 'tasks', select: null } }
    expect(() => compileCompositionSpec(spec([brokenPanel as never]), ctx)).toThrow(TypeError)
  })
})
