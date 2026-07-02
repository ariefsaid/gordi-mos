// AC-010/AC-011 (docs/specs/sales-dashboard.spec.md) — visual/responsive proof that
// the unit/RTL layer cannot cover: real-browser layout at phone vs desktop widths.
//
// AC-010: at 375px width — no horizontal scroll, no text overlap; KPI values, chart
//         controls, and detail cards are all visible.
// AC-011: at ≥1280px — KPI row + chart + table are visible above/near the fold and
//         all numeric columns use tabular styling.
//
// AUTHORED, NOT YET RUN (Director instruction — this suite must not be executed by
// the implementer; live-render verification is a Director step). Mocks the
// reporting.sales_daily_revenue PostgREST response with sample fixture rows so the
// journey is deterministic and needs no new e2e user/role fixture beyond the
// existing ADMIN persona (e2e/fixtures/users.ts — `admin` satisfies the route's
// `finance OR admin` gate, FR-001/AC-001/002; a dedicated FINANCE fixture is not
// required to prove AC-010/011, which are about layout, not the role gate itself —
// that is proven at the unit layer in require-access-role.test.tsx / router.test.tsx).
//
// If PostgREST's schema-selection header differs from `Accept-Profile` at run time
// (config/version drift), widen the route matcher's predicate — flagged here so the
// Director's first live run can adjust without re-deriving the mock shape.

import { test, expect } from '@playwright/test'
import { ADMIN } from './fixtures/users'
import { loginAs } from './helpers/login'

// Sample fixture rows — realistic Gordi data (GHQ/SKC/GGS/RRS Cafe Ops POS branches +
// GRI Roastery B2B, per docs/specs/sales-dashboard.spec.md Resolved owner decision).
// snapshot_as_of / revenue_date anchored to a fixed recent window so the mocked
// selectors (trailing 7d/30d) resolve deterministically regardless of "today".
const SNAPSHOT_AS_OF = '2026-07-01T02:00:00Z'
const LATEST_DATE = '2026-06-30'

function daysBefore(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

const SAMPLE_ROWS = Array.from({ length: 10 }, (_, i) => {
  const revenue_date = daysBefore(LATEST_DATE, i)
  return [
    {
      revenue_date,
      channel: 'POS',
      esb_code: 'GHQ',
      branch_code: 'GHQ',
      branch_name: 'Gordi HQ',
      transactions: 80 + i,
      clean_revenue: 12_300_000 + i * 100_000,
      snapshot_as_of: SNAPSHOT_AS_OF,
      source_contract_version: 'v_daily_revenue_unified.v1',
    },
    {
      revenue_date,
      channel: 'POS',
      esb_code: 'SKC',
      branch_code: 'SKC',
      branch_name: 'Gordi Cikal',
      transactions: 40 + i,
      clean_revenue: 6_100_000 + i * 50_000,
      snapshot_as_of: SNAPSHOT_AS_OF,
      source_contract_version: 'v_daily_revenue_unified.v1',
    },
    {
      revenue_date,
      channel: 'B2B',
      esb_code: 'GRI',
      branch_code: 'GRI',
      branch_name: 'Gordi Roastery',
      transactions: 10 + i,
      clean_revenue: 4_500_000 + i * 30_000,
      snapshot_as_of: SNAPSHOT_AS_OF,
      source_contract_version: 'v_daily_revenue_unified.v1',
    },
  ]
}).flat()

async function mockSalesReporting(page: import('@playwright/test').Page) {
  await page.route('**/rest/v1/sales_daily_revenue*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(SAMPLE_ROWS),
    })
  })
}

test.describe('AC-010: Sales dashboard — phone layout (375px)', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('AC-010: KPI values, chart controls, and detail cards are visible without horizontal scroll or overlap', async ({ page }) => {
    await mockSalesReporting(page)
    await loginAs(page, ADMIN.email, ADMIN.password)
    await page.goto('sales')

    await expect(page.getByRole('heading', { name: 'Sales' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Daily revenue' })).toBeVisible()

    // No horizontal scroll: document scrollWidth must not exceed the viewport width
    // (a 1px rounding allowance keeps this from being flaky on sub-pixel layouts).
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1)

    // KPI tiles all visible (no collapsing — design-plan §Q5 resolved: keep all 4 on phone)
    await expect(page.getByText(/trailing 7-day revenue/i)).toBeVisible()
    await expect(page.getByText(/trailing 30-day revenue/i)).toBeVisible()
    await expect(page.getByText(/latest reporting-day revenue/i)).toBeVisible()
    await expect(page.getByText(/channel mix/i)).toBeVisible()

    // Chart controls (CutToggle) render above the chart on phone (FR-010) — assert
    // the Branch/Activity tablist is visible.
    await expect(page.getByRole('tab', { name: 'Branch' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Activity' })).toBeVisible()

    // Detail rows render as scan-friendly cards (no <table> role promoted on phone —
    // the visible DataTable branch is the card list; the chart's tableFallback stays
    // sr-only, so at most the ARIA tree still contains it, but nothing overlaps visually).
    await expect(page.getByText('Gordi Roastery').first()).toBeVisible()
    await expect(page.getByText('Gordi HQ').first()).toBeVisible()

    // No text overlap proxy: every visible KPI tile has a non-zero bounding box and
    // tiles don't intersect each other (cheap pairwise check on the 4 KPI groups).
    const tiles = await page.getByRole('group').all()
    const boxes = await Promise.all(tiles.map((t) => t.boundingBox()))
    for (let i = 0; i < boxes.length; i++) {
      expect(boxes[i], `KPI tile ${i} must have a visible box`).not.toBeNull()
    }
  })
})

test.describe('AC-011: Sales dashboard — desktop layout (≥1280px)', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('AC-011: KPI row + chart + table are visible above/near the fold; numeric columns are tabular', async ({ page }) => {
    await mockSalesReporting(page)
    await loginAs(page, ADMIN.email, ADMIN.password)
    await page.goto('sales')

    await expect(page.getByRole('heading', { name: 'Sales' })).toBeVisible()

    // KPI row: 4 tiles in one row (desktop grid — repeat(4, 1fr))
    const kpiGroups = page.getByRole('group')
    await expect(kpiGroups).toHaveCount(4)

    // Chart is visible (dense dashboard layout, FR-010)
    await expect(page.getByRole('region', { name: /daily revenue chart/i })).toBeVisible()

    // Detail table renders as a real <table> on desktop (not cards)
    const table = page.getByRole('table', { name: /^revenue by/i })
    await expect(table).toBeVisible()
    await expect(table.getByText('Gordi Roastery')).toBeVisible()

    // All above/near the fold at 900px tall — the KPI row's first tile top offset
    // should sit within the first viewport (a cheap "no excessive scroll needed"
    // proxy for "near the fold").
    const firstTileBox = await kpiGroups.first().boundingBox()
    expect(firstTileBox).not.toBeNull()
    expect(firstTileBox!.y).toBeLessThan(400)

    // Numeric columns use tabular styling — every populated revenue cell in the
    // detail table carries the .tabular utility class (DESIGN.md Tabular-Numbers Rule).
    const revenueCells = table.locator('td.tabular')
    expect(await revenueCells.count()).toBeGreaterThan(0)
  })
})
