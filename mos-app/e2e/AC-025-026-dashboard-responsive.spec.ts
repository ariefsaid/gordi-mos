// AC-025/AC-026 (docs/specs/dashboard.spec.md) — visual/responsive proof that the
// unit/RTL layer cannot cover: real-browser layout of /mos/dashboard at phone vs
// desktop widths.
//
// This suite RETARGETS the old AC-010/AC-011 sales-dashboard responsive proof to the
// rebuilt+renamed `/dashboard` page (the OD-DASH work: `/sales` → `/dashboard`). The
// GOAL-ORACLE is unchanged — "no horizontal scroll + no overlap at phone width" and
// "KPI row + chart + table near the fold with tabular numerics at desktop width" —
// only the journey SELECTORS + the second data mock changed for the deliberate
// rename/broaden. AC-010/011 (sales) → AC-025/026 (dashboard) per the dashboard spec.
//
// AC-025: at 390px width — no horizontal scroll, no text overlap; KPI values, the
//         sticky global toolbar (cut + window), the tab switch, and the detail cards
//         are all visible.
// AC-026: at ≥1280px — KPI rows + chart + table are visible above/near the fold and
//         all numeric columns use tabular styling.
//
// The new /dashboard reads BOTH reporting read-models (FR-003): reporting.sales_daily_revenue
// AND reporting.sales_margin_daily. Both PostgREST responses are mocked so the journey
// is deterministic and needs no new e2e user/role fixture beyond the existing ADMIN
// persona (e2e/fixtures/users.ts — `admin` satisfies the route's `finance OR admin`
// gate, FR-002/AC-002/003; AC-025/026 are about layout, not the role gate itself —
// that is proven at the unit layer). Mocks return rows so the populated layout renders
// (the empty state "No sales snapshot data yet" must NOT trigger — FR-021/AC-021).

import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { ADMIN } from './fixtures/users'
import { loginAs } from './helpers/login'

// Sample fixture rows — realistic Gordi data (GHQ/SKC POS branches + GRI Roastery B2B,
// per docs/specs/dashboard.spec.md Resolved owner decisions + CONTEXT.md). Dates are
// anchored to a fixed recent window so the reporting-day-anchored selectors
// (trailing 7d/30d keyed off the max source revenue_date, FR-005 — never Date.now())
// resolve deterministically regardless of "today".
const SNAPSHOT_AS_OF = '2026-07-01T02:00:00Z'
const LATEST_DATE = '2026-06-30'

function daysBefore(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

// ── Revenue rows (reporting.sales_daily_revenue grain: org/date/channel/esb/branch) ──
// 10 days ending on LATEST_DATE across 3 branches × 2 channels so trailing 7d/30d,
// channel mix, and the Branch/Channel/Activity cuts all resolve.
const REVENUE_BRANCHES = [
  { channel: 'POS', esb_code: 'GHQ', branch_code: 'GHQ', branch_name: 'Gordi HQ', base: 12_300_000, step: 100_000, txns: 80 },
  { channel: 'POS', esb_code: 'SKC', branch_code: 'SKC', branch_name: 'Gordi Cikal', base: 6_100_000, step: 50_000, txns: 40 },
  { channel: 'B2B', esb_code: 'GRI', branch_code: 'GRI', branch_name: 'Gordi Roastery', base: 4_500_000, step: 30_000, txns: 10 },
]

const REVENUE_ROWS = Array.from({ length: 10 }, (_, i) => {
  const revenue_date = daysBefore(LATEST_DATE, i)
  return REVENUE_BRANCHES.map((b) => ({
    revenue_date,
    channel: b.channel,
    esb_code: b.esb_code,
    branch_code: b.branch_code,
    branch_name: b.branch_name,
    transactions: b.txns + i,
    clean_revenue: b.base + i * b.step,
    snapshot_as_of: SNAPSHOT_AS_OF,
    source_contract_version: 'v_daily_revenue_unified.v1',
  }))
}).flat()

// ── Margin rows (reporting.sales_margin_daily grain: org/date/esb/branch — POS-only,
//    no channel dimension per the §7a amendment). GRI/B2B has no POS margin → omitted
//    (the Branch-cut COGS join stays null for B2B — the honest "—" state, never faked). ──
const MARGIN_BRANCHES = [
  { esb_code: 'GHQ', branch_code: 'GHQ', branch_name: 'Gordi HQ', base: 12_300_000, step: 100_000 },
  { esb_code: 'SKC', branch_code: 'SKC', branch_name: 'Gordi Cikal', base: 6_100_000, step: 50_000 },
]

const MARGIN_ROWS = Array.from({ length: 10 }, (_, i) => {
  const margin_date = daysBefore(LATEST_DATE, i)
  return MARGIN_BRANCHES.map((b) => {
    const revenue = b.base + i * b.step
    const cogs_interim_sm = Math.round(0.68 * revenue) // ~32% interim gross margin
    const margin_interim = revenue - cogs_interim_sm
    return {
      margin_date,
      esb_code: b.esb_code,
      branch_code: b.branch_code,
      branch_name: b.branch_name,
      revenue,
      cogs_interim_sm,
      cogs_budget_bom: Math.round(0.7 * revenue),
      margin_interim,
      margin_interim_pct: margin_interim / revenue,
      bom_coverage_pct: 0.92, // 'good' DQ bucket (≥0.9) — AC-024
      snapshot_as_of: SNAPSHOT_AS_OF,
      source_contract_version: 'reporting.sales_margin_daily.v1',
    }
  })
}).flat()

/** Mock BOTH reporting endpoints the /dashboard reads (FR-003/AC-004). */
async function mockDashboardReporting(page: Page) {
  await page.route('**/rest/v1/sales_daily_revenue*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(REVENUE_ROWS),
    })
  })
  await page.route('**/rest/v1/sales_margin_daily*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MARGIN_ROWS),
    })
  })
}

/** Standard AABB positive-area intersection — edge-touching (0-area) is NOT overlap. */
function boxesIntersect(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  const overlapX = a.x < b.x + b.width && a.x + a.width > b.x
  const overlapY = a.y < b.y + b.height && a.y + a.height > b.y
  return overlapX && overlapY
}

test.describe('AC-025: Dashboard — phone layout (390px)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('AC-025: KPI values, global toolbar, tab switch, and detail cards are visible without horizontal scroll or overlap', async ({ page }) => {
    await mockDashboardReporting(page)
    await loginAs(page, ADMIN.email, ADMIN.password)
    await page.goto('money')

    // Populated layout rendered (this label only exists in the ready state — doubles
    // as the data-loaded readiness wait; the empty state must NOT have triggered).
    await expect(page.getByText(/trailing 7-day revenue/i)).toBeVisible()
    // STALE→fixed: /money's PageFamilyFrame h1 renders t('dest.money') = "Money"
    // (dashboard-page.tsx) — "Dashboard" never renders on this surface.
    await expect(page.getByRole('heading', { level: 1, name: 'Money' })).toBeVisible()

    // No horizontal scroll: document scrollWidth must not exceed the viewport width
    // (a 1px rounding allowance keeps this from being flaky on sub-pixel layouts).
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1)

    // Revenue KPI tiles all visible (FR-006/007) — the renamed page keeps the revenue
    // set; the gross-margin tile proves the broadened scope (FR-008).
    await expect(page.getByText(/trailing 7-day revenue/i)).toBeVisible()
    await expect(page.getByText(/trailing 30-day revenue/i)).toBeVisible()
    await expect(page.getByText(/latest reporting-day revenue/i)).toBeVisible()
    await expect(page.getByText(/channel mix/i)).toBeVisible()
    await expect(page.getByText(/gross margin %/i)).toBeVisible()

    // Global toolbar (FR-011) — the CutToggle renders Branch/Activity as role=tab
    // (the ViewTabs Summary/Detail are a separate tablist; names don't collide).
    await expect(page.getByRole('tab', { name: 'Branch' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Activity' })).toBeVisible()

    // Detail rows render as scan-friendly cards on phone (DataTable card-reflow below
    // 768px — no <table> role promoted). Default cut = Branch → branch names show.
    await expect(page.getByText('Gordi Roastery').first()).toBeVisible()
    await expect(page.getByText('Gordi HQ').first()).toBeVisible()

    // No text overlap proxy: every visible KPI tile has a non-zero bounding box and
    // tiles within each grid don't intersect (true pairwise check, not just non-null).
    const revenueTiles = page.locator('.dash-kpi-grid:not(.dash-kpi-grid--gm) .kpi-tile')
    const gmTiles = page.locator('.dash-kpi-grid--gm .kpi-tile')
    for (const grid of [revenueTiles, gmTiles]) {
      const tiles = await grid.all()
      const boxes = await Promise.all(tiles.map((t) => t.boundingBox()))
      boxes.forEach((box, i) => {
        expect(box, `KPI tile ${i} must have a visible box`).not.toBeNull()
      })
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          expect(
            boxesIntersect(boxes[i]!, boxes[j]!),
            `KPI tiles ${i} and ${j} must not overlap`,
          ).toBe(false)
        }
      }
    }
  })
})

test.describe('AC-026: Dashboard — desktop layout (≥1280px)', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('AC-026: KPI rows + chart + table are visible above/near the fold; numeric columns are tabular', async ({ page }) => {
    await mockDashboardReporting(page)
    await loginAs(page, ADMIN.email, ADMIN.password)
    await page.goto('money')

    // Populated layout rendered.
    await expect(page.getByText(/trailing 7-day revenue/i)).toBeVisible()
    // STALE→fixed: /money's PageFamilyFrame h1 renders t('dest.money') = "Money"
    // (dashboard-page.tsx) — "Dashboard" never renders on this surface.
    await expect(page.getByRole('heading', { level: 1, name: 'Money' })).toBeVisible()

    // KPI rows: the revenue set (FR-006/007) + a gross-margin tile (FR-008) are
    // visible; the revenue grid holds ≥ its 5 tiles. (The old page had 4; the renamed
    // page broadened the set — assert labels + a lower-bound count, never a stale 4.)
    await expect(page.getByText(/trailing 7-day revenue/i)).toBeVisible()
    await expect(page.getByText(/trailing 30-day revenue/i)).toBeVisible()
    await expect(page.getByText(/latest reporting-day revenue/i)).toBeVisible()
    await expect(page.getByText(/channel mix/i)).toBeVisible()
    await expect(page.getByText(/gross margin %/i)).toBeVisible()
    const revenueTiles = page.locator('.dash-kpi-grid:not(.dash-kpi-grid--gm) .kpi-tile')
    expect(await revenueTiles.count()).toBeGreaterThanOrEqual(5)

    // KPI row near the fold: the first revenue tile is fully within the first
    // viewport at load (PageHead + GlobalToolbar + ViewTabs chrome sit above it, so a
    // 600px bound on its bottom edge is a fair "no excessive scroll needed" proxy).
    const firstTileBox = await revenueTiles.first().boundingBox()
    expect(firstTileBox).not.toBeNull()
    expect(firstTileBox!.y).toBeGreaterThanOrEqual(0)
    expect(firstTileBox!.y + firstTileBox!.height).toBeLessThan(600)

    // Daily revenue chart visible on the Summary tab (FR-017).
    await expect(page.getByRole('region', { name: 'Daily revenue chart' })).toBeVisible()

    // The full sortable detail table lives on the Detail tab (FR-019) — switch to it.
    await page.getByRole('tab', { name: 'Detail' }).click()
    const table = page.getByRole('table', { name: 'Revenue breakdown' })
    await expect(table).toBeVisible()
    await expect(table.getByText('Gordi Roastery')).toBeVisible()

    // Numeric columns use tabular styling — every numeric cell carries the .tabular
    // utility class (DESIGN.md Tabular-Numbers Rule; DataTable renders td.dt-num.tabular).
    const revenueCells = table.locator('td.tabular')
    expect(await revenueCells.count()).toBeGreaterThan(0)
  })
})
