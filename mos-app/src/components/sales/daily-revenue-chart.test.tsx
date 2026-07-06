// DailyRevenueChart tests — the sales-specific composition inside ChartFrame
// (design-plan §2.2). Inline SVG stacked bars/day by channel — no charting dependency.
// Two hues only: primary (POS), violet (B2B) — categorical, non-interactive.

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DailyRevenueChart } from './daily-revenue-chart'
import type { DailySeriesPoint } from '@/lib/sales-dashboard'

const SERIES: DailySeriesPoint[] = [
  { date: '2026-06-29', byChannel: { POS: 8_000_000 }, total: 8_000_000 },
  { date: '2026-06-30', byChannel: { POS: 12_300_000, B2B: 4_500_000 }, total: 16_800_000 },
]

describe('DailyRevenueChart', () => {
  it('renders one bar-group per day in the series', () => {
    const { container } = render(<DailyRevenueChart series={SERIES} />)
    expect(container.querySelectorAll('[data-chart-day]')).toHaveLength(2)
  })

  it('renders a stacked segment per channel present that day', () => {
    const { container } = render(<DailyRevenueChart series={SERIES} />)
    const day2 = container.querySelector('[data-chart-day="2026-06-30"]')!
    expect(day2.querySelectorAll('[data-chart-segment]')).toHaveLength(2)
  })

  it('is an inline SVG (no charting dependency)', () => {
    const { container } = render(<DailyRevenueChart series={SERIES} />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('renders an empty container gracefully for an empty series (frame owns the empty message)', () => {
    const { container } = render(<DailyRevenueChart series={[]} />)
    expect(container.querySelectorAll('[data-chart-day]')).toHaveLength(0)
  })

  it('is decorative (aria-hidden) — the ChartFrame tableFallback carries the a11y equivalent', () => {
    render(<DailyRevenueChart series={SERIES} />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})
