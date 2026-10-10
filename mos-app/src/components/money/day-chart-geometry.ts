// The day chart's geometry and plot data, shared by drawing and pointer handling.

import type { BranchDay } from '@/lib/money-branch-page'

/** The plot's horizontal geometry: the y-axis band on the left, a small gutter on the right. */
export const Y_AXIS_WIDTH = 68
export const PLOT_MARGIN = { top: 8, right: 4, bottom: 0, left: 0 }

/** The day index under `x` (px from the chart's left edge) in a chart `width` px wide holding
 *  `count` equal day bands, or null outside the plot. */
export function dayAt(x: number, width: number, count: number): number | null {
  const left = PLOT_MARGIN.left + Y_AXIS_WIDTH
  const plot = width - left - PLOT_MARGIN.right
  if (count === 0 || plot <= 0 || x < left || x >= left + plot) return null
  return Math.min(count - 1, Math.floor(((x - left) / plot) * count))
}

export function cleanTicks(min: number, max: number, target = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) return []
  if (max === min) {
    const step = 10 ** (Math.floor(Math.log10(Math.abs(max) || 1)) - 1)
    min = Math.floor(min / step) * step
    max = min + step
  }
  const raw = (max - min) / target
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map((n) => n * magnitude).find((n) => n >= raw)!
  const low = Math.floor(min / step) * step
  const high = Math.ceil(max / step) * step
  return Array.from({ length: Math.round((high - low) / step) + 1 }, (_, i) => Number((low + i * step).toPrecision(12)))
}

export function chartSeries(days: readonly BranchDay[], mode: 'revenue' | 'margin', budget: number | null, stubShare: number, formatLatest: (value: number) => string) {
  const values = days.map((day) => mode === 'margin' ? day.marginPct ?? null : day.value)
  const comparisons = days.map((day) => mode === 'margin' ? budget : day.compare)
  const chartValues = [...values, ...comparisons].filter((value): value is number => value !== null)
  const [low, high] = chartValues.length ? [Math.min(...chartValues), Math.max(...chartValues)] : [0, 1]
  const ticks = cleanTicks(mode === 'margin' ? low : 0, chartValues.length ? high : 1)
  const tickStep = ticks.length > 1 ? ticks[1] - ticks[0] : 1
  const domainPadding = mode === 'margin' && chartValues.length ? tickStep / 2 : 0
  const yMin = mode === 'margin' && chartValues.length ? low - domainPadding : 0
  const yMax = mode === 'margin' && chartValues.length ? high + domainPadding : ticks.at(-1) ?? 1
  const data = days.map((day, index) => {
    const value = values[index]
    return { ...day, value, compare: comparisons[index], stub: mode === 'revenue' && value === null ? yMax * stubShare : null, latestLabel: mode === 'revenue' && index === days.length - 1 && value !== null ? formatLatest(value) : null }
  })
  return { data, ticks, yMin, yMax }
}

export function bulletGeometry(value: number, budget: number) {
  const percent = (n: number) => Math.max(0, Math.min(100, n * 100))
  return { fill: percent(value), marker: percent(budget) }
}
