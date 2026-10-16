import { describe, expect, it } from 'vitest'
import { PLOT_MARGIN, Y_AXIS_WIDTH, chartSeries, dayAt } from './day-chart-geometry'

describe('dayAt — the day under a click or tap', () => {
  // The y-axis band plus the right gutter frame the plot: here a 300px plot holds 10 days of 30px each.
  const width = Y_AXIS_WIDTH + 300 + PLOT_MARGIN.right
  it('maps a position to its day band', () => {
    expect(dayAt(Y_AXIS_WIDTH, width, 10)).toBe(0)
    expect(dayAt(Y_AXIS_WIDTH + 29, width, 10)).toBe(0)
    expect(dayAt(Y_AXIS_WIDTH + 30, width, 10)).toBe(1)
    expect(dayAt(Y_AXIS_WIDTH + 299, width, 10)).toBe(9)
  })
  it('is null on the axis, in the gutter, or with no days', () => {
    expect(dayAt(10, width, 10)).toBeNull()
    expect(dayAt(width - 1, width, 10)).toBeNull()
    expect(dayAt(100, width, 0)).toBeNull()
  })



  it('projects missing revenue and comparison values without losing the latest label', () => {
    const days = [
      { date: '2040-03-01', value: 10, compare: 8 },
      { date: '2040-03-02', value: null, compare: 9 },
      { date: '2040-03-03', value: 30, compare: null },
    ]
    const chart = chartSeries(days, 'revenue', null, 0.08, (value) => `Rp ${value}`)
    expect(chart.data.map(({ value, compare, stub, latestLabel }) => [value, compare, stub, latestLabel])).toEqual([
      [10, 8, null, null], [null, 9, 2.4, null], [30, null, null, 'Rp 30'],
    ])
    expect(chart.ticks).toEqual([0, 10, 20, 30])
  })

  it('projects margin gaps and the budget series separately from revenue stubs', () => {
    const days = [
      { date: '2040-03-01', value: 100, compare: 90, marginPct: 0.5 },
      { date: '2040-03-02', value: 110, compare: 95, marginPct: null },
      { date: '2040-03-03', value: 120, compare: 100, marginPct: 0.6 },
    ]
    const chart = chartSeries(days, 'margin', 0.55, 0.08, String)
    expect(chart.data.map(({ value, compare, stub, latestLabel }) => [value, compare, stub, latestLabel])).toEqual([
      [0.5, 0.55, null, null], [null, 0.55, null, null], [0.6, 0.55, null, null],
    ])
    expect(chart.ticks).toEqual([0.5, 0.55, 0.6])
  })

  it('keeps margin marks and budget inside a padded plot domain while ticks stay clean', () => {
    const days = [
      { date: '2040-03-01', value: 100, compare: 90, marginPct: 0.5 },
      { date: '2040-03-02', value: 110, compare: 95, marginPct: 0.6 },
    ]
    const chart = chartSeries(days, 'margin', 0.55, 0.08, String)
    expect(chart.ticks).toEqual([0.5, 0.55, 0.6])
    expect(chart.yMin).toBeLessThan(0.5)
    expect(chart.yMax).toBeGreaterThan(0.6)
  })

})
