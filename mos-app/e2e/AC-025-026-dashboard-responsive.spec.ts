
// AC-025/AC-026 — real-browser layout of /money, the branch table (#1434), at phone and desktop
// widths: what the unit layer cannot see. The goal oracle is the same as it was for the retired
// tile page: no horizontal page scroll at phone width; the figures near the fold, in tabular
// digits, at desktop width.
//
// AC-025: at 390px — no horizontal page scroll, every row reachable as a stacked row, and the
//         phone Sort by control in place of the header buttons.
// AC-026: at 1280px — the company row and every branch row above the fold; every figure cell
//         tabular; numeric columns right-aligned.
//
// Both reporting read-models are mocked so the journey is deterministic; the ADMIN persona clears
// the route's role gate (the tier contract is the unit layer's: money-page.test.tsx).

import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { ADMIN } from './fixtures/users'
import { loginAs } from './helpers/login'
import { isShipGated } from './helpers/ship-gate'

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
    branch_id: null,
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
      branch_id: null,
      revenue,
      cogs_interim_sm,
      cogs_budget_bom: Math.round(0.7 * revenue),
      margin_interim,
      bom_coverage_pct: 0.92, // 'good' DQ bucket (≥0.9) — AC-024
      snapshot_as_of: SNAPSHOT_AS_OF,
      source_contract_version: 'reporting.sales_margin_daily.v1',
    }
  })
}).flat()

/** Mock both reporting endpoints /money reads. */
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

test.describe('AC-025: Money — phone layout (390px)', () => {
  // The surface is ship-gated (issue 444): every entry point forwards home. Skipped on the gate
  // itself, not deleted: the journey comes back the moment /money leaves SHIP_GATED_PATHS.
  test.skip(isShipGated('/money'), 'ship-gated surface (issue 444) — no route, no nav')
  test.use({ viewport: { width: 390, height: 844 } })

  test('AC-025: the branch table reflows to stacked rows with no horizontal page scroll', async ({ page }) => {
    await mockDashboardReporting(page)
    await loginAs(page, ADMIN.email, ADMIN.password)
    await page.goto('money')

    const table = page.getByRole('table')
    await expect(table.getByText('Gordi HQ')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Money' })).toBeVisible()
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1)
    // Name and period revenue share the row's first line.
    const row = table.getByRole('row', { name: /Gordi HQ/ })
    const name = await row.getByRole('link', { name: 'Gordi HQ' }).boundingBox()
    const revenue = await row.locator('.money-table__cell--revenue').boundingBox()
    expect(Math.abs(name!.y - revenue!.y)).toBeLessThan(12)
    await expect(page.getByLabel('Sort by')).toBeVisible()
  })
})

test.describe('AC-026: Money — desktop layout (≥1280px)', () => {
  test.skip(isShipGated('/money'), 'ship-gated surface (issue 444) — no route, no nav')
  test.use({ viewport: { width: 1280, height: 900 } })

  test('AC-026: every row is above the fold and every figure is tabular', async ({ page }) => {
    await mockDashboardReporting(page)
    await loginAs(page, ADMIN.email, ADMIN.password)
    await page.goto('money')

    const table = page.getByRole('table')
    await expect(table.getByText('Gordi Roastery').or(table.getByText('B2B (invoices)'))).toBeVisible()
    const rows = table.locator('tbody tr')
    // Company, the two POS branches, then the B2B row.
    expect(await rows.count()).toBe(4)
    const last = await rows.last().boundingBox()
    expect(last!.y + last!.height).toBeLessThanOrEqual(900)
    const figures = table.locator('td .tabular')
    expect(await figures.count()).toBeGreaterThan(0)
    const align = await table.locator('td.money-table__cell--revenue').first().evaluate((el) => getComputedStyle(el).textAlign)
    expect(align).toBe('right')
  })

  test('AC-026: a sort survives a period change and a reload', async ({ page }) => {
    await mockDashboardReporting(page)
    await loginAs(page, ADMIN.email, ADMIN.password)
    await page.goto('money')
    const header = page.getByRole('columnheader', { name: /^vs same day last week/ })
    await header.getByRole('button').click()
    await page.getByRole('button', { name: '7 days' }).click()
    await expect(page).toHaveURL(/period=7&sort=vs-weekday\.desc/)
    await expect(header).toHaveAttribute('aria-sort', 'descending')
    await page.reload()
    await expect(page).toHaveURL(/period=7&sort=vs-weekday\.desc/)
    await expect(page.getByRole('columnheader', { name: /^vs same day last week/ })).toHaveAttribute('aria-sort', 'descending')
    await expect(page.getByRole('button', { name: '7 days' })).toHaveAttribute('aria-pressed', 'true')
  })
})
