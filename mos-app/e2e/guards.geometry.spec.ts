/**
 * MECHANICAL GUARDS — geometry layer (the rendered-pixel twins of the structural suite).
 *
 * Every check here pins a defect class the OWNER caught after 5 audit rounds missed it —
 * measured on the real app, real stack, real CSS, so the class can never again depend on
 * a human eye:
 *   GUARD-R1      split-view height parity (tasks table + drawer share one bottom edge)
 *                 — taste §7 "Align & Space Perfectly" (.claude/skills/taste/SKILL.md)
 *   GUARD-PRIMARY at most ONE visible solid-primary button on the Tasks surface
 *                 — impeccable distill "Clear hierarchy: ONE primary action"
 *   GUARD-R3      the saved-view label sits a real (≥8px) gap from the chip strip
 *                 — uupm ux-guidelines "minimum 8px gap between adjacent targets"
 *   GUARD-TAP     interactive controls ≥44px on phone/coarse viewports (P1-4 fix)
 *                 — uupm ux-guidelines "Touch Target Size: minimum 44×44px" (High)
 *   GUARD-SEARCH   the dish search keeps its usable measure (≥160px) and composes WITH the
 *                 category filter on one row (Café · Log + Plan, desktop + phone) — #378
 *
 * Structural twins (jsdom, always-on): guard-r1-split-parity.css.test.ts,
 * guard-one-solid-primary.test.tsx, guard-r3-toolbar-label-gap.css.test.ts,
 * tap-targets.css.test.ts, guard-r2-naked-numbers.test.tsx, guard-r4-permission-notes.test.tsx.
 * Requires the live local stack (supabase on 44321) + the global-setup seed.
 */
import { test, expect, type Locator, type Page } from '@playwright/test'
import { loginAs } from './helpers/login'
import { createTaskViaUI } from './helpers/tasks'
import { MANAGER, VIEWER } from './fixtures/users'

async function box(locator: Locator) {
  const b = await locator.boundingBox()
  expect(b, `expected a rendered box for ${String(locator)}`).not.toBeNull()
  return b!
}

// ── Desktop regime (default Desktop Chrome viewport, 1280×720 ≥ the 1100px split) ──────

test.describe('desktop geometry guards', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, VIEWER.email, VIEWER.password)
    await page.goto('work/tasks')
    await page.waitForURL(/\/work\/tasks$/)
  })

  test('GUARD-R1: at split width the tasks table and the open drawer share ONE height (bottoms aligned)', async ({ page }) => {
    // Open a real task in the drawer (own task → independent of shared seed state).
    const title = `Guard R1 parity ${Date.now()}`
    await createTaskViaUI(page, title)
    // GAP-6 / OD-REDESIGN-91 #11: creation lands on the collection; reopen for drawer geometry.
    await page.goto('work/tasks')
    await page.waitForURL(/\/work\/tasks$/)
    await page.getByRole('button', { name: 'All', exact: true }).click()
    await page.getByText(title).first().click()
    await page.waitForURL(/\/work\/tasks\?.*record=[0-9a-f-]{36}$/)
    const drawer = page.locator('.split [data-overlay-host="true"][data-overlay-owner="tasks"].drawer')
    await expect(drawer).toHaveCount(1)
    await expect(drawer).toBeVisible()
    await expect(drawer.getByRole('heading', { name: title })).toBeVisible() // record content settled
    await expect(page.getByRole('region', { name: 'Tasks' })).toBeVisible()

    // The owner's catch: two mismatched boxes. One shared grid track ⇒ tops AND bottoms align.
    // Poll (not a single-frame snapshot): the drawer content loads/animates in after the URL
    // settles; the guard's oracle is the SETTLED geometry. A real parity regression never
    // converges, so the poll still fails deterministically.
    const parityDelta = async () => {
      const table = await box(page.locator('.split > .assembly'))
      const aside = await box(drawer)
      return Math.max(
        Math.abs(table.y - aside.y),
        Math.abs((table.y + table.height) - (aside.y + aside.height)),
      )
    }
    await expect.poll(parityDelta, {
      message: 'table and drawer must settle onto one shared track (tops+bottoms ≤2px apart)',
      timeout: 10_000,
    }).toBeLessThanOrEqual(2)
  })

  test('GUARD-PRIMARY: the Tasks page shows at most ONE solid-primary button — in every toolbar state', async ({ page }) => {
    await expect(page.getByTestId('record-collection-toolbar')).toBeVisible()

    // Rest state: the one page CTA is the only filled primary.
    expect(await page.locator('.btn-primary:visible').count()).toBeLessThanOrEqual(1)

    // The incident state: disclosing "View & filters" must not add a filled primary —
    // the Save-view trigger stays a ghost button.
    await page.getByRole('button', { name: /view & filters/i }).click()
    const saveTrigger = page.getByRole('button', { name: /save view/i })
    await expect(saveTrigger).toBeVisible()
    await expect(saveTrigger).not.toHaveClass(/btn-primary/)
    expect(await page.locator('.btn-primary:visible').count()).toBeLessThanOrEqual(1)
  })

  test('GUARD-R3: the saved-view label keeps a measured ≥8px gap from the first chip', async ({ page }) => {
    const label = await box(page.locator('.collection-toolbar__views-label'))
    const firstChip = await box(page.locator('.collection-toolbar__view').first())
    const gap = firstChip.x - (label.x + label.width)
    expect(gap, 'label→chip seam must be a real gap, not a fused blob').toBeGreaterThanOrEqual(8)
  })
})

// ── Phone/coarse regime (375×812 — the ≤767.98px tap-target floor, P1-4) ───────────────

const TAP_SAMPLE = [
  'a.btn', 'button.btn', // the one button hierarchy
  'a.chip', 'button.chip', // chip-links (e.g. record name cells)
  '.bottom-tab', // phone primary nav
  '.collection-mobile-options-trigger', // the phone "View & filters" door
].join(', ')

async function assertTapTargets(page: Page, surface: string) {
  const controls = page.locator(TAP_SAMPLE).locator('visible=true')
  const count = await controls.count()
  expect(count, `${surface}: expected sampled interactive controls to exist`).toBeGreaterThan(0)
  const offenders: string[] = []
  for (let i = 0; i < count; i += 1) {
    const el = controls.nth(i)
    const b = await el.boundingBox()
    if (!b) continue
    // 43.5 tolerates sub-pixel rounding of the 44px floor; anything lower is a real regression.
    if (b.height < 43.5) {
      const text = (await el.innerText().catch(() => '')).slice(0, 40).replace(/\s+/g, ' ')
      offenders.push(`${surface} "${text}" → ${Math.round(b.height)}px tall`)
    }
  }
  expect(offenders, `${surface}: every sampled control must be ≥44px tall on phone`).toEqual([])
}

test.describe('phone tap-target guards (GUARD-TAP)', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true })

  test.beforeEach(async ({ page }) => {
    await loginAs(page, VIEWER.email, VIEWER.password)
  })

  test('GUARD-TAP: Tasks phone controls are ≥44px', async ({ page }) => {
    await page.goto('work/tasks')
    await expect(page.getByTestId('page-head')).toBeVisible()
    await assertTapTargets(page, 'Tasks')
  })

  test('GUARD-TAP: Home phone controls are ≥44px', async ({ page }) => {
    await page.goto('')
    await expect(page.getByTestId('page-head')).toBeVisible()
    await assertTapTargets(page, 'Home')
  })

  test('GUARD-TAP: Signals phone controls are ≥44px', async ({ page }) => {
    await page.goto('work/signals')
    await expect(page.getByTestId('page-head')).toBeVisible()
    await assertTapTargets(page, 'Signals')
  })
})

// ── Café toolbar guards (GUARD-SEARCH, #378) ──────────────────────────────────────────
// The design audit caught the dish search collapsed to 40.75×36 (Plan) / 49×36 (Log) at
// 1440 while the category wrapped away — the primary filter on both capture surfaces was
// unusable. jsdom computes no layout and a class-name assertion proves nothing about the
// flex algorithm, so the oracle is the RENDERED box, in this guard family.
// Composition oracle: search and category share ONE row with the category AFTER the search
// — the filters compose with each other, never orphaned below the scope band. The category
// control is measured via its toolbar slot (`.ktb-category`, which hugs the visible 32px
// desktop / 44px phone mk-select box): getByRole('combobox') resolves to the NATIVE select
// field, inset ~6px inside that box, so its top is 8.6px below the search's even when the
// controls are perfectly centered on one row. Same-rowness is judged on CENTER LINES —
// height-agnostic (36px search beside 32/44px select centers-align by flex align-items).

const SEARCH_FLOOR = 159.5 // 160px usable-measure floor, 0.5px sub-pixel tolerance (GUARD-TAP idiom)

async function assertSearchComposed(page: Page, surface: string) {
  const search = await box(page.locator('.ktb-search'))
  const category = await box(page.locator('.ktb-category'))
  expect(search.width, `${surface}: the dish search keeps its usable measure (≥160px)`).toBeGreaterThanOrEqual(SEARCH_FLOOR)
  expect(
    Math.abs((search.y + search.height / 2) - (category.y + category.height / 2)),
    `${surface}: search and category compose on ONE row`,
  ).toBeLessThanOrEqual(2)
  expect(
    category.x,
    `${surface}: the category sits after the search, not orphaned`,
  ).toBeGreaterThan(search.x + search.width - 1)
}

test.describe('café toolbar desktop geometry guards (GUARD-SEARCH, #378)', () => {
  test.use({ viewport: { width: 1440, height: 900 } }) // the audit width

  test.beforeEach(async ({ page }) => {
    await loginAs(page, MANAGER.email, MANAGER.password) // Plan's editor is ops_lead/admin-gated
  })

  test('GUARD-SEARCH: Café · Log at 1440 — usable search composed with the category', async ({ page }) => {
    await page.goto('cafe/log')
    await expect(page.locator('.ktb-search')).toBeVisible()
    await expect(page.getByRole('combobox', { name: /^category$/i })).toBeVisible()
    await assertSearchComposed(page, 'Café · Log @1440')
  })

  test('GUARD-SEARCH: Café · Plan at 1440 — usable search composed with the category', async ({ page }) => {
    await page.goto('cafe/plan')
    await expect(page.locator('.ktb-search')).toBeVisible()
    await expect(page.getByRole('combobox', { name: /^category$/i })).toBeVisible()
    await assertSearchComposed(page, 'Café · Plan @1440')
  })
})

test.describe('café toolbar phone geometry guards (GUARD-SEARCH, #378)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true }) // the ≤390px phone measure

  test.beforeEach(async ({ page }) => {
    await loginAs(page, MANAGER.email, MANAGER.password)
  })

  test('GUARD-SEARCH: Café · Log at 390 — phone composition not regressed by the fix', async ({ page }) => {
    await page.goto('cafe/log')
    const search = await box(page.locator('.ktb-search'))
    await assertSearchComposed(page, 'Café · Log @390')
    expect(search.height, 'Café · Log @390: phone search keeps the 44px touch floor').toBeGreaterThanOrEqual(43.5)
    // #378 review: same-row checks can pass while the category runs off-viewport — assert it cannot.
    const logOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    expect(logOverflow, 'Café · Log @390: the toolbar never pushes the document wider than the viewport').toBe(false)
  })

  test('GUARD-SEARCH: Café · Plan at 390 — phone composition not regressed by the fix', async ({ page }) => {
    await page.goto('cafe/plan')
    const search = await box(page.locator('.ktb-search'))
    await assertSearchComposed(page, 'Café · Plan @390')
    expect(search.height, 'Café · Plan @390: phone search keeps the 44px touch floor').toBeGreaterThanOrEqual(43.5)
    const planOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    expect(planOverflow, 'Café · Plan @390: the toolbar never pushes the document wider than the viewport').toBe(false)
  })
})
