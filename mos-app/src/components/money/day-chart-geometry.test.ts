import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bulletGeometry, chartSeries, cleanTicks, dayAt } from './day-chart-geometry'

describe('dayAt — the day under a click or tap', () => {
  // 68px axis + 4px gutter: a 372px chart leaves a 300px plot, 10 days of 30px each.
  it('maps a position to its day band', () => {
    expect(dayAt(68, 372, 10)).toBe(0)
    expect(dayAt(68 + 29, 372, 10)).toBe(0)
    expect(dayAt(68 + 30, 372, 10)).toBe(1)
    expect(dayAt(367, 372, 10)).toBe(9)
  })
  it('is null on the axis, in the gutter, or with no days', () => {
    expect(dayAt(10, 372, 10)).toBeNull()
    expect(dayAt(369, 372, 10)).toBeNull()
    expect(dayAt(100, 372, 0)).toBeNull()
  })

  it('uses clean round intervals for currency and percent axes', () => {
    expect(cleanTicks(0, 38_000_000)).toEqual([0, 10_000_000, 20_000_000, 30_000_000, 40_000_000])
    expect(cleanTicks(0.53, 0.67)).toEqual([0.5, 0.55, 0.6, 0.65, 0.7])
  })

  it('caps Recharts revenue columns at 24px even for the 7-day period', () => {
    const source = readFileSync(resolve(__dirname, 'day-revenue-chart.tsx'), 'utf8')
    expect(source).toMatch(/<Bar dataKey="value"[^>]*maxBarSize=\{24\}/)
  })

  it('projects missing revenue and comparison values without losing the latest label', () => {
    const days = [
      { date: '2026-10-01', value: 10, compare: 8 },
      { date: '2026-10-02', value: null, compare: 9 },
      { date: '2026-10-03', value: 30, compare: null },
    ]
    const chart = chartSeries(days, 'revenue', null, 0.08, (value) => `Rp ${value}`)
    expect(chart.data.map(({ value, compare, stub, latestLabel }) => [value, compare, stub, latestLabel])).toEqual([
      [10, 8, null, null], [null, 9, 2.4, null], [30, null, null, 'Rp 30'],
    ])
    expect(chart.ticks).toEqual([0, 10, 20, 30])
  })

  it('projects margin gaps and the budget series separately from revenue stubs', () => {
    const days = [
      { date: '2026-10-01', value: 100, compare: 90, marginPct: 0.5 },
      { date: '2026-10-02', value: 110, compare: 95, marginPct: null },
      { date: '2026-10-03', value: 120, compare: 100, marginPct: 0.6 },
    ]
    const chart = chartSeries(days, 'margin', 0.55, 0.08, String)
    expect(chart.data.map(({ value, compare, stub, latestLabel }) => [value, compare, stub, latestLabel])).toEqual([
      [0.5, 0.55, null, null], [null, 0.55, null, null], [0.6, 0.55, null, null],
    ])
    expect(chart.ticks).toEqual([0.5, 0.55, 0.6])
  })

  it('keeps margin marks and budget inside a padded plot domain while ticks stay clean', () => {
    const days = [
      { date: '2026-10-01', value: 100, compare: 90, marginPct: 0.5 },
      { date: '2026-10-02', value: 110, compare: 95, marginPct: 0.6 },
    ]
    const chart = chartSeries(days, 'margin', 0.55, 0.08, String)
    expect(chart.ticks).toEqual([0.5, 0.55, 0.6])
    expect(chart.yMin).toBeLessThan(0.5)
    expect(chart.yMax).toBeGreaterThan(0.6)
  })

  it('keeps COGS fill and budget marker inside the bullet track', () => {
    expect(bulletGeometry(0.35, 0.3)).toEqual({ fill: 35, marker: 30 })
    expect(bulletGeometry(1.2, -0.1)).toEqual({ fill: 100, marker: 0 })
  })
})
