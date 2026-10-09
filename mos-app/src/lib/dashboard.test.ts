// dashboard.test.ts — Money's reporting-window math.
import { describe, it, expect } from 'vitest'
import type { SalesMarginDailyRow } from '@/lib/db/reporting-margin'
import { bomCoveragePct, resolveWindow } from '@/lib/dashboard'

const LATEST = '2026-06-30'

describe('resolveWindow', () => {
  it('AC-013: 7 days resolve to [latestDate-6, latestDate]', () => {
    expect(resolveWindow({ kind: 'preset', days: 7 }, LATEST)).toEqual({ start: '2026-06-24', end: LATEST })
  })

  it('AC-013: 30 days resolve to [latestDate-29, latestDate]', () => {
    expect(resolveWindow({ kind: 'preset', days: 30 }, LATEST)).toEqual({ start: '2026-06-01', end: LATEST })
  })
})

describe('bomCoveragePct', () => {
  const row = (margin_date: string, bom_coverage_pct: number | null) =>
    ({ margin_date, bom_coverage_pct }) as SalesMarginDailyRow

  it('averages the days inside the window and skips days without coverage', () => {
    const rows = [row('2026-06-29', 0.8), row('2026-06-30', 1), row('2026-06-28', null), row('2026-06-01', 0)]
    expect(bomCoveragePct(rows, '2026-06-28', LATEST)).toBeCloseTo(0.9, 10)
  })

  it('is null when no day in the window carries coverage', () => {
    expect(bomCoveragePct([row('2026-06-30', null)], '2026-06-24', LATEST)).toBeNull()
  })
})
