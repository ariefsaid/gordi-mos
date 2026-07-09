// Widgets — query_entity result → typed artifact builders (table/insight/chart).
// Mirrors buildDataTableWidgetFromQueryResult's fail-closed contract: pure, never throw,
// return null on any mismatch. ADR-0045 widget layer.
import { describe, it, expect } from 'vitest'
import {
  buildDataTableWidgetFromQueryResult,
  buildInsightWidgetFromQueryResult,
  buildChartWidgetFromQueryResult,
} from './widgets'

const okResult = (rows: Record<string, unknown>[], rowCount?: number) => ({
  rows,
  rowCount: rowCount ?? rows.length,
})

describe('buildDataTableWidgetFromQueryResult', () => {
  it('builds a table from requested columns with humanized headers', () => {
    const w = buildDataTableWidgetFromQueryResult(
      { entity: 'blocked_tasks', columns: ['title', 'status'], as: 'table' },
      okResult([{ title: 'Fix sync', status: 'blocked' }]),
    )
    expect(w).toEqual({
      kind: 'data_table',
      title: 'Blocked Tasks',
      columns: [
        { key: 'title', header: 'Title' },
        { key: 'status', header: 'Status' },
      ],
      rows: [{ title: 'Fix sync', status: 'blocked' }],
    })
  })

  it('returns null on error', () => {
    expect(buildDataTableWidgetFromQueryResult({ as: 'table' }, { error: 'boom' })).toBeNull()
  })

  it('returns null when rows is empty', () => {
    expect(buildDataTableWidgetFromQueryResult({ entity: 'tasks', as: 'table' }, okResult([]))).toBeNull()
  })

  it('returns null when as is not table', () => {
    expect(buildDataTableWidgetFromQueryResult({ entity: 'tasks', as: 'insight' }, okResult([{ x: 1 }]))).toBeNull()
  })
})

describe('buildInsightWidgetFromQueryResult', () => {
  it('uses the first requested column as the headline value', () => {
    const w = buildInsightWidgetFromQueryResult(
      { entity: 'tasks', columns: ['count'], as: 'insight' },
      okResult([{ count: 42, label: 'x' }]),
    )
    expect(w).not.toBeNull()
    expect(w).toMatchObject({ kind: 'data_insight', title: 'Tasks', value: 42, label: 'Count' })
    expect(w!.detail).toMatch(/row/)
  })

  it('humanizes the column key for the label', () => {
    const w = buildInsightWidgetFromQueryResult(
      { entity: 'tasks', columns: ['open_count'], as: 'insight' },
      okResult([{ open_count: 7 }]),
    )
    expect(w!.label).toBe('Open Count')
  })

  it('falls back to the first numeric field when no columns requested', () => {
    const w = buildInsightWidgetFromQueryResult(
      { entity: 'sales', as: 'insight' },
      okResult([{ name: 'Revenue', total: 1234 }]),
    )
    expect(w).toMatchObject({ kind: 'data_insight', title: 'Sales', value: 1234, label: 'Total' })
  })

  it('returns null when as is not insight', () => {
    expect(buildInsightWidgetFromQueryResult({ as: 'table' }, okResult([{ x: 1 }]))).toBeNull()
  })

  it('returns null on error', () => {
    expect(buildInsightWidgetFromQueryResult({ as: 'insight' }, { error: 'boom' })).toBeNull()
  })

  it('returns null when there are no rows', () => {
    expect(buildInsightWidgetFromQueryResult({ entity: 'tasks', as: 'insight' }, okResult([]))).toBeNull()
  })

  it('returns null when the requested column is not present in the row', () => {
    expect(
      buildInsightWidgetFromQueryResult(
        { entity: 'tasks', columns: ['missing'], as: 'insight' },
        okResult([{ x: 1 }]),
      ),
    ).toBeNull()
  })

  it('returns null when no numeric field is available for fallback', () => {
    expect(
      buildInsightWidgetFromQueryResult(
        { entity: 'tasks', as: 'insight' },
        okResult([{ name: 'only string' }]),
      ),
    ).toBeNull()
  })
})

describe('buildChartWidgetFromQueryResult', () => {
  it('builds a chart from requested columns with coerced points', () => {
    const w = buildChartWidgetFromQueryResult(
      { entity: 'revenue', columns: ['day', 'total'], as: 'chart' },
      okResult([
        { day: 'Mon', total: 10 },
        { day: 'Tue', total: 20 },
      ]),
    )
    expect(w).toEqual({
      kind: 'data_chart',
      title: 'Revenue',
      xKey: 'day',
      yKey: 'total',
      points: [
        { day: 'Mon', total: 10 },
        { day: 'Tue', total: 20 },
      ],
    })
  })

  it('falls back xKey to the first field and yKey to the first numeric field != xKey', () => {
    const w = buildChartWidgetFromQueryResult(
      { entity: 'sales', as: 'chart' },
      okResult([{ day: 'Mon', total: 5, note: 'x' }]),
    )
    expect(w).toMatchObject({ xKey: 'day', yKey: 'total' })
  })

  it('caps points at 50', () => {
    const rows = Array.from({ length: 80 }, (_, i) => ({ d: `d${i}`, v: i }))
    const w = buildChartWidgetFromQueryResult(
      { entity: 'sales', columns: ['d', 'v'], as: 'chart' },
      okResult(rows),
    )
    expect(w!.points.length).toBe(50)
  })

  it('drops non-numeric y rows but keeps numeric ones', () => {
    const w = buildChartWidgetFromQueryResult(
      { entity: 'sales', columns: ['d', 'v'], as: 'chart' },
      okResult([
        { d: 'a', v: 1 },
        { d: 'b', v: null },
        { d: 'c', v: 3 },
      ]),
    )
    expect(w!.points).toEqual([
      { d: 'a', v: 1 },
      { d: 'c', v: 3 },
    ])
  })

  it('returns null when as is not chart', () => {
    expect(buildChartWidgetFromQueryResult({ as: 'table' }, okResult([{ d: 'a', v: 1 }]))).toBeNull()
  })

  it('returns null on error', () => {
    expect(buildChartWidgetFromQueryResult({ as: 'chart' }, { error: 'boom' })).toBeNull()
  })

  it('returns null when there are no rows', () => {
    expect(buildChartWidgetFromQueryResult({ entity: 'sales', as: 'chart' }, okResult([]))).toBeNull()
  })

  it('returns null when no y values are numeric', () => {
    expect(
      buildChartWidgetFromQueryResult(
        { entity: 'sales', columns: ['d', 'v'], as: 'chart' },
        okResult([
          { d: 'a', v: null },
          { d: 'b', v: 'nope' },
        ]),
      ),
    ).toBeNull()
  })

  it('returns null when x and y resolve to the same key', () => {
    expect(
      buildChartWidgetFromQueryResult(
        { entity: 'sales', columns: ['d', 'd'], as: 'chart' },
        okResult([{ d: 1 }]),
      ),
    ).toBeNull()
  })
})
