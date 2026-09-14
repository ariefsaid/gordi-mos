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
 *   GUARD-R3      the current saved-view section keeps a real (≥8px) gap before its content
 *                 — uupm ux-guidelines "minimum 8px gap between adjacent targets"
 *   GUARD-TAP     interactive controls ≥44px on phone/coarse viewports (P1-4 fix), and —
 *                 on the auth cards (#403) — the full 44×44 census plus the 8px separation
 *                 between adjacent targets that DESIGN.md pairs the floor with
 *                 — uupm ux-guidelines "Touch Target Size: minimum 44×44px" (High)
 *   GUARD-SEARCH   the dish search keeps its usable measure (≥160px) and composes WITH the
 *                 category filter on one row when that control is rendered — #378
 *
 * Structural twins (jsdom, always-on): guard-r1-split-parity.css.test.ts,
 * guard-one-solid-primary.test.tsx, guard-r3-toolbar-label-gap.css.test.ts,
 * tap-targets.css.test.ts, guard-r2-naked-numbers.test.tsx, guard-r4-permission-notes.test.tsx.
 * The rendered-geometry lane itself is .github/workflows/geometry.yml.
 * Requires the live local stack (supabase on 44321) + the global-setup seed.
 */
import { test, expect } from './fixtures/task-browser'
import type { Locator, Page } from '@playwright/test'
import { loginAs } from './helpers/login'
import { createTaskViaUI } from './helpers/tasks'
import { assertTapFloor, AUTH_CONTROLS, TAP_FLOOR, TAP_GAP } from './helpers/tap-floor'
import { MANAGER, ORPHAN, VIEWER } from './fixtures/users'
import { ensureStream } from './helpers/cafe-stream'
import { TASKS_SPLIT_MIN_WIDTH } from '../src/shell/use-is-split-width'

// The e7 collection grammar owns mouse activation on a task title: a CLICK renames in place
// (task-row.tsx onTitleClick), and Enter on the focused title is the open-the-record door. Both
// the table row and the phone card expose that title as the row's opener link.
async function openTaskRecord(page: Page, title: string) {
  const opener = page.getByRole('link', { name: new RegExp(title) }).first()
  await opener.focus()
  await opener.press('Enter')
}

async function box(locator: Locator) {
  const b = await locator.boundingBox()
  expect(b, `expected a rendered box for ${String(locator)}`).not.toBeNull()
  return b!
}

// ── Desktop regime (default Desktop Chrome viewport, 1440×900 ≥ the derived
//    TASKS_SPLIT_MIN_WIDTH split threshold, DD-WAY-53) ────────────────────────────

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
    // GUARD-R1 shared-track geometry — the oracle is the fix's proof, never weaken it: the drawer
    // is addressed by ROLE + ACCESSIBLE NAME, never by a class/data-attribute chain. (#375 was a
    // measurement bug, not a geometry bug: OverlayHostSlot wraps the panel in a display:contents
    // span, so the old `.split > aside.drawer` CHILD selector matched nothing after the reopen.
    // Measuring the located drawer fixes that without giving up the semantic locator.)
    // GAP-6 / OD-REDESIGN-91 #11: creation lands on the collection; reopen for drawer geometry.
    await page.goto('work/tasks')
    await page.waitForURL(/\/work\/tasks$/)
    await page.getByRole('button', { name: 'All', exact: true }).click()
    await openTaskRecord(page, title)
    await page.waitForURL(/\/work\/tasks\?.*record=[0-9a-f-]{36}$/)
    const drawer = page.getByRole('complementary', { name: /task detail/i })
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

  test('GUARD-R8: split exists only where decision columns fit; narrow rows open the page', async ({ page }) => {
    const columns = ['Task', 'Status', 'PIC', 'Supervisor', 'Due']
    // TASKS_SPLIT_MIN_WIDTH is the derived floor itself; 1440 is DESIGN.md's desktop
    // reference width. Both are AT OR ABOVE the threshold, so both must render the split.
    for (const width of [TASKS_SPLIT_MIN_WIDTH, 1440]) {
      await page.setViewportSize({ width, height: 800 })
      await page.goto('work/tasks')
      await page.waitForURL(/\/work\/tasks$/)
      const row = page.locator('tr.task-row').first()
      await expect(row).toBeVisible()
      // Activate via td.td-supervisor, a plain cell with no nested interactive element: the
      // <tr>'s own onClick (unconditional onOpen) is the only handler left to catch the bubble.
      // Three other doors were tried and rejected on the REAL stack (task-row.tsx): the title
      // cell's innerText joins name + meta with a newline, so getByText(title, {exact:true})
      // never matches it (round-3); the PIC cell (nth-child(3)) carries an inline edit trigger
      // that stopPropagation()s, so a positional click there never opens the row (round-3); and
      // `.task-row-link` — the title's own <Link> — calls beginEdit() instead of onOpen() for
      // any row the viewer can rename (onTitleClick, task-row.tsx), so it silently enters inline
      // rename instead of opening the drawer on the E2E fixture's own accountable-viewer row
      // (round-5 finding: the class exists as instructed, but its click handler is "select to
      // edit", not "open" — proven by running this guard against the live stack, not assumed).
      await row.locator('td.td-supervisor').click()
      const drawer = page.getByRole('complementary', { name: /task detail/i })
      await expect(drawer).toBeVisible()

      const rects = []
      for (const column of columns) {
        const header = page.locator('.tasks-table thead th').filter({ hasText: column }).first()
        const widthText = await header.evaluate((element) => ({
          rect: element.getBoundingClientRect().toJSON(),
          content: element.scrollWidth,
        }))
        rects.push({ column, ...widthText })
        // Sub-pixel layout rounding: half a pixel is not a squeezed column.
        expect(Math.round(widthText.rect.width), `${column} must fit its content at ${width}px`).toBeGreaterThanOrEqual(widthText.content)
      }
      const scrollWidths = await page.locator('.tasks-scroll').evaluate((element) => ({
        scrollWidth: element.scrollWidth, clientWidth: element.clientWidth,
      }))
      console.log(JSON.stringify({ width, rects, scrollWidths }))
      expect(scrollWidths.scrollWidth, `task card must not overflow at ${width}px`).toBe(scrollWidths.clientWidth)
    }

    for (const width of [1152, 1280]) {
      await page.setViewportSize({ width, height: 800 })
      await page.goto('work/tasks')
      await page.waitForURL(/\/work\/tasks$/)
      const narrowRow = page.locator('tr.task-row').first()
      await expect(narrowRow).toBeVisible()
      const narrowScrollWidths = await page.locator('.tasks-scroll').evaluate((element) => ({
        scrollWidth: element.scrollWidth, clientWidth: element.clientWidth,
      }))
      console.log(JSON.stringify({ width, scrollWidths: narrowScrollWidths }))
      expect(narrowScrollWidths.scrollWidth).toBe(narrowScrollWidths.clientWidth)
      await narrowRow.locator('td.td-supervisor').click()
      await expect(page.locator('.record-doc')).toBeVisible()
      await expect(page.getByRole('complementary', { name: /task detail/i })).toHaveCount(0)
      // The role-aware queue view is preserved while the narrow row promotes to the canonical
      // record page, so the page path may carry the active `view` query.
      await expect(page).toHaveURL(/\/work\/tasks\/[0-9a-f-]{36}(?:\?.*)?$/)
    }
  })

  test('GUARD-PRIMARY: the Tasks page shows at most ONE solid-primary button — in every toolbar state', async ({ page }) => {
    const toolbar = page.getByTestId('record-collection-toolbar')
    await expect(toolbar).toBeVisible()
    await expect(toolbar.getByRole('button', { name: 'All', exact: true })).toBeVisible()

    const assertOnePagePrimary = async (state: string) => {
      const labels = await page.locator('.btn-primary:visible').evaluateAll((elements) =>
        elements.map((element) => (element.textContent ?? '').trim().replace(/\s+/g, ' ')),
      )
      expect(labels.length, `${state}: visible solid primaries ${JSON.stringify(labels)}`).toBeLessThanOrEqual(1)
    }

    // Rest state: the one page CTA is the only filled primary.
    await assertOnePagePrimary('rest state')

    const saveTrigger = page.getByRole('button', { name: /^save view$/i })
    await expect(saveTrigger).toBeVisible()
    await expect(saveTrigger).not.toHaveClass(/btn-primary/)
    await saveTrigger.click()
    await expect(page.getByRole('group', { name: /save current view/i })).toBeVisible()
    // This is a page-wide law: the transient Save action must not compete with PageHead's Create
    // action. If both remain solid here, the product surface needs to hide or de-emphasize the
    // PageHead action while the save form is open; the rendered guard must stay strict.
    await assertOnePagePrimary('Save view form open')
  })

  test('GUARD-R3: the saved-view label keeps a measured ≥8px gap from the first chip', async ({ page }) => {
    const toolbar = page.getByTestId('record-collection-toolbar')
    await expect(toolbar).toBeVisible()
    const label = await box(toolbar.locator('.collection-toolbar__views-label'))
    const firstChip = await box(toolbar.locator('.collection-toolbar__view').first())
    const gap = firstChip.x - (label.x + label.width)
    expect(gap, 'saved-view label→content seam must be a real gap, not a fused blob').toBeGreaterThanOrEqual(8)
  })
})

// ── Tasks toolbar geometry — OD-WAY-89 / DESIGN.md §7 ────────────────────────────────
// Desktop owns exactly two exposed rows. Phones place this same toolbar behind one outer
// View & filters door, so no desktop Filters door or stacked configuration panel is allowed.
test.describe('tasks collection toolbar geometry', () => {
  test('desktop exposes two one-line rows with the e7 control classes', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await loginAs(page, VIEWER.email, VIEWER.password)
    await page.goto('work/tasks')
    await page.waitForURL(/\/work\/tasks$/)

    const toolbar = page.getByTestId('record-collection-toolbar')
    await expect(toolbar).toBeVisible()
    const rows = toolbar.locator('[data-testid="collection-toolbar-row"]')
    await expect(rows).toHaveCount(2)
    await expect(toolbar.getByRole('button', { name: 'All', exact: true })).toBeVisible()
    await expect(toolbar.getByRole('searchbox', { name: /search tasks/i })).toBeVisible()
    await expect(toolbar.getByRole('combobox', { name: /^group$/i })).toBeVisible()
    await expect(toolbar.getByRole('combobox', { name: /business unit/i })).toBeVisible()
    await expect(toolbar.getByRole('button', { name: /^status$/i })).toBeVisible()
    await expect(toolbar.getByRole('combobox', { name: /^person$/i })).toBeVisible()
    await expect(toolbar.getByRole('combobox', { name: /^sort$/i })).toBeVisible()
    await expect(toolbar.getByRole('button', { name: /^fields$/i })).toBeVisible()
    await expect(toolbar.getByRole('button', { name: /^save view$/i })).toBeVisible()
    await expect(toolbar.getByRole('button', { name: /^filters$/i })).toHaveCount(0)

    for (const row of await rows.all()) {
      const geometry = await row.evaluate((element) => {
        const rowRect = element.getBoundingClientRect()
        const controls = element.querySelectorAll(
          '.collection-toolbar__view, .collection-toolbar__search, .collection-toolbar__select, .collection-toolbar__fields > .btn, .collection-toolbar__save-zone > .btn, .overdue-filter-btn',
        )
        return {
          row: { x: rowRect.x, right: rowRect.right },
          controls: Array.from(controls).map((control) => {
          const rect = control.getBoundingClientRect()
          return {
            centerY: rect.top + rect.height / 2,
            x: rect.x,
            right: rect.right,
            scrollHeight: control.scrollHeight,
            clientHeight: control.clientHeight,
            scrollWidth: control.scrollWidth,
            clientWidth: control.clientWidth,
          }
          }),
        }
      })
      expect(geometry.controls.length, 'every toolbar row control must be rendered').toBeGreaterThan(0)
      const centers = geometry.controls.map(({ centerY }) => centerY)
      expect(Math.max(...centers) - Math.min(...centers), 'each row must share one vertical center').toBeLessThanOrEqual(2)
      expect(
        geometry.controls.every(({ x, right }) => x >= geometry.row.x - 0.5 && right <= geometry.row.right + 0.5),
        'toolbar controls must stay inside their row',
      ).toBe(true)
      expect(
        geometry.controls.every(({ scrollHeight, clientHeight, scrollWidth, clientWidth }) =>
          scrollHeight <= clientHeight + 1 && scrollWidth <= clientWidth + 1,
        ),
        'toolbar controls must contain their text',
      ).toBe(true)
    }

    const census = await toolbar.evaluate((element) => ({
      chips: element.querySelectorAll('.collection-toolbar__view').length,
      dropdowns: element.querySelectorAll('.collection-toolbar__search, .collection-toolbar__select').length,
      ghosts: element.querySelectorAll('.collection-toolbar__options .btn').length,
      pills: element.querySelectorAll('.overdue-filter-btn').length,
      checkboxes: element.querySelectorAll('input[type="checkbox"]').length,
    }))
    expect(census.chips).toBe(4)
    expect(census.dropdowns).toBe(6)
    expect(census.ghosts).toBe(2)
    expect(census.pills).toBeLessThanOrEqual(1)
    expect(census.checkboxes).toBe(0)

    const pageScroll = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }))
    expect(pageScroll.scrollWidth).toBe(pageScroll.innerWidth)
  })

  test('desktop Fields chooser preserves optional columns and the Task width floor', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await loginAs(page, VIEWER.email, VIEWER.password)
    await page.goto('work/tasks')
    await page.waitForURL(/\/work\/tasks$/)
    const toolbar = page.getByTestId('record-collection-toolbar')
    await expect(toolbar).toBeVisible()
    await expect(page.locator('tr.task-row').first()).toBeVisible()

    await toolbar.getByRole('button', { name: /^fields$/i }).click()
    for (const field of ['Business unit', 'Project/Process', 'Objective', 'Last activity']) {
      await toolbar.getByRole('checkbox', { name: field, exact: true }).check()
    }
    await toolbar.getByRole('button', { name: /^fields$/i }).click()

    const taskWidth = await page.locator('tr.task-row td.td-main').first().evaluate((cell) => cell.getBoundingClientRect().width)
    expect(taskWidth, 'Task keeps its 160px floor with every optional field on').toBeGreaterThanOrEqual(160)
    const pageScroll = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }))
    expect(pageScroll.scrollWidth).toBe(pageScroll.innerWidth)
  })
})

// ── Phone/coarse regime (375×812 — the ≤767.98px tap-target floor, P1-4) ───────────────

const TAP_SAMPLE = [
  'a.btn', 'button.btn', // the one button hierarchy
  'a.chip', 'button.chip', // chip-links (e.g. record name cells)
  '.collection-toolbar__view', '.view-tabs__tab', '.home-tab', // collection/Home scope tabs
  '.bottom-tab', // phone primary nav
  '.mobile-task-options-trigger', // the single Tasks phone "View & filters" door
].join(', ')

test.describe('phone tap-target guards (GUARD-TAP)', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true })

  test.beforeEach(async ({ page }) => {
    await loginAs(page, VIEWER.email, VIEWER.password)
  })

  test('GUARD-730: phone record header stays ≤56px, truncates its leaf before controls, and keeps Back ≥44px at 390', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('work/tasks')
    const title = `Guard 730 ${'x'.repeat(51)}`
    const detailUrl = await createTaskViaUI(page, title)
    await page.goto(detailUrl.slice(1))
    await page.waitForURL(/\/work\/tasks\/[0-9a-f-]{36}$/)

    const leafLocator = page.locator('.top-bar__breadcrumb-leaf')
    await expect(leafLocator).toHaveText(title)
    const header = await box(page.locator('[data-anatomy="header"]'))
    const nav = await box(page.locator('.top-bar__breadcrumb'))
    const leaf = await box(leafLocator)
    const firstControl = await box(page.locator('[data-anatomy="header"] button').first())
    const back = await box(page.getByRole('link', { name: /back to/i }))
    expect(header.height, 'phone record header must stay one 56px row').toBeLessThanOrEqual(56)
    expect(nav.height, 'phone breadcrumb must stay on one line').toBeLessThanOrEqual(24)
    expect(leaf.x + leaf.width, 'breadcrumb leaf must end before the first header control').toBeLessThanOrEqual(firstControl.x - 8)
    expect(back.height, 'record Back must meet the phone tap floor').toBeGreaterThanOrEqual(44)
  })

  test('GUARD-TAP: Tasks phone controls are ≥44px', async ({ page }) => {
    await page.goto('work/tasks')
    await expect(page.getByTestId('page-head')).toBeVisible()
    await assertTapFloor(page, TAP_SAMPLE, 'Tasks')
  })

  test('GUARD-TAP: Home phone controls are ≥44px', async ({ page }) => {
    await page.goto('')
    await expect(page.getByTestId('page-head')).toBeVisible()
    await assertTapFloor(page, TAP_SAMPLE, 'Home')
  })

  test('GUARD-TAP: Signals phone controls are ≥44px', async ({ page }) => {
    await page.goto('work/signals')
    await expect(page.getByTestId('page-head')).toBeVisible()
    await assertTapFloor(page, TAP_SAMPLE, 'Signals')
  })

  // #667: named phone controls are sampled at the 390px audit width, not hidden behind the
  // broad surface census. These selectors identify the hit-area wrappers, while visual glyphs
  // may remain at the compact desktop size.
  test('GUARD-TAP #667: named MVP controls meet the 44px floor at 390', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })

    await page.goto('')
    await expect(page.getByTestId('page-head')).toBeVisible()
    await assertTapFloor(page, '.help-tip-anchor button:visible, .stream-band-link:visible', 'Home #667', { axes: 'both', noOverflow: true })

    await page.goto('work/signals')
    await expect(page.getByTestId('page-head')).toBeVisible()
    // The row opener by ROLE + ACCESSIBLE NAME, as GUARD-R1 above: the first `[role="button"]`
    // in the document is the shell's own Search control, so a class/role sample opens the
    // command menu instead of a signal and the record panel below is never on screen.
    await page.getByRole('button', { name: /^Open signal:/ }).first().click()
    await expect(page.getByRole('button', { name: 'Ask Deputy' })).toBeVisible()
    await assertTapFloor(page, '.record-panel-btn.tap-floor', 'Signals record #667', { axes: 'both' })

    await page.route('**/rest/v1/user_views*', async (route) => {
      if (route.request().method() !== 'GET') return route.continue()
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'guard fixture' }) })
    })
    await page.goto('work/tasks')
    await expect(page.getByTestId('page-head')).toBeVisible()
    // OD-WAY-89: phone shows work first and has one View & filters door. The shared collection
    // toolbar is absent until that door opens; Fields stays absent because phone renders cards.
    const viewAndFilters = page.getByRole('button', { name: /^view & filters/i })
    await expect(viewAndFilters).toBeVisible()
    await expect(viewAndFilters).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByTestId('record-collection-toolbar')).toHaveCount(0)
    await assertTapFloor(page, '.mobile-task-options-trigger', 'Tasks View & filters #667', { axes: 'both', noOverflow: true })
    await viewAndFilters.click()

    const tasksToolbar = page.getByTestId('record-collection-toolbar')
    await expect(tasksToolbar).toBeVisible()
    await expect(tasksToolbar.getByRole('button', { name: /try again/i })).toBeVisible()
    await assertTapFloor(page, '.collection-toolbar__saved-error .btn', 'Tasks saved-view Retry #667', { axes: 'both', noOverflow: true })
    await expect(tasksToolbar.locator('.collection-toolbar__view')).toHaveCount(4)
    await expect(tasksToolbar.getByRole('searchbox', { name: /search tasks/i })).toBeVisible()
    await expect(tasksToolbar.locator('.collection-toolbar__select')).toHaveCount(5)
    await expect(tasksToolbar.getByRole('button', { name: /^fields$/i })).toHaveCount(0)
    await expect(tasksToolbar.getByRole('button', { name: /^save view$/i })).toBeVisible()
    await assertTapFloor(
      page,
      '.mobile-task-options-panel .collection-toolbar__view, .mobile-task-options-panel .collection-toolbar__search, .mobile-task-options-panel .collection-toolbar__select button, .mobile-task-options-panel .collection-toolbar__save-zone > button, .mobile-task-options-panel .tasks-attention-picker > button',
      'Tasks View & filters panel #667',
      { axes: 'both', noOverflow: true },
    )

    const attentionTrigger = tasksToolbar.getByRole('combobox', { name: /tasks need attention/i })
    await expect(attentionTrigger).toBeVisible()

    await attentionTrigger.click()
    const attentionMenu = page.locator('.picker__menu[aria-label*="tasks need attention"]')
    await expect(attentionMenu).toBeVisible()
    const attentionOptions = attentionMenu.getByRole('option')
    expect(await attentionOptions.count(), 'Tasks filter panel #667: Attention options must be present').toBe(2)
    await assertTapFloor(page, '.picker__menu[aria-label*="tasks need attention"] .picker__option', 'Tasks attention options #667', { axes: 'both', noOverflow: true })
    await page.keyboard.press('Escape')

    const saveViewTrigger = tasksToolbar.getByRole('button', { name: /^save view$/i })
    expect(await saveViewTrigger.count(), 'Tasks toolbar #667: Save view action must be present').toBe(1)
    await saveViewTrigger.click()
    const saveViewForm = page.getByRole('group', { name: /save current view/i })
    await expect(saveViewForm).toBeVisible()
    const viewName = saveViewForm.getByRole('textbox', { name: /view name/i })
    const saveButton = saveViewForm.getByRole('button', { name: /^save$/i })
    const cancelButton = saveViewForm.getByRole('button', { name: /^cancel$/i })
    expect(await viewName.count(), 'Tasks save-view form #667: view-name input must be present').toBe(1)
    expect(await saveButton.count(), 'Tasks save-view form #667: Save control must be present').toBe(1)
    expect(await cancelButton.count(), 'Tasks save-view form #667: Cancel control must be present').toBe(1)
    await assertTapFloor(page, '.collection-toolbar__save input, .collection-toolbar__save .btn', 'Tasks save-view form #667', { axes: 'both', noOverflow: true })
    await cancelButton.click()
    await page.keyboard.press('Escape')
    // #671 retired the create FORM: create is an inline draft row with its title focused, and at
    // phone width the one create door is the actions FAB. The title field it focuses is the
    // create surface's tap target now, so the floor is measured there.
    await page.getByRole('button', { name: /open actions/i }).click()
    await page.getByRole('option', { name: 'Create task', exact: true }).click()
    await expect(page.getByRole('textbox', { name: 'Edit task title' })).toBeVisible()
    await assertTapFloor(page, '.task-title-input.tap-floor', 'Tasks create title #667', { axes: 'both', noOverflow: true })
    await page.keyboard.press('Escape')
    const title = `Tap floor guard ${Date.now()}`
    await createTaskViaUI(page, title)
    await page.goto('work/tasks')
    await openTaskRecord(page, title)
    await expect(page.getByRole('button', { name: /edit/i }).first()).toBeVisible()
    await assertTapFloor(page, '.record-field__edit.tap-floor, .record-panel-btn.tap-floor', 'Tasks record chrome #667', { axes: 'both', noOverflow: true })

    // The group toggle is measured on Plan: Review lists only logs submitted TODAY, so on a fresh
    // stack it renders its empty state and the toggle this guard exists to measure is never on it.
    await page.goto('cafe/plan')
    await ensureStream(page)
    await expect(page.getByTestId('page-head')).toBeVisible()
    await expect(page.locator('.dt-card').first()).toBeVisible() // rows settled — the toggles ride the groups
    await assertTapFloor(page, '.dt-cards-group-toggle.tap-floor, .dt-group-toggle.tap-floor', 'Café Plan #667', { axes: 'both', noOverflow: true })
  })
})

// ── The auth cards (GUARD-TAP, #403 — v4 port-sweep slice of #290) ─────────────────────
// The auth cards author their controls inline at the 32px desktop density with no primitive
// underneath, so the phone floor never reached them. Unlike the sampled surfaces above this is
// a CENSUS (every visible control in the card, not a selector sample) measured on BOTH axes,
// because DESIGN.md's phone rule is 44×44 — the demo persona chips proved a control can be 44
// tall and still only 37 wide. Structural twin (jsdom, always-on, and the only lane that gates
// a PR→dev merge): src/components/ui/tap-targets.css.test.ts.
// The fifth auth surface — the set-password form — is only reachable through the mailpit
// recovery round-trip, so it is measured inside AC-005 rather than in a second copy of that
// journey (CLAUDE.md § Test pyramid: one test at the lowest sufficient layer).
test.describe('auth-card tap-target guards (GUARD-TAP, #403)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true }) // the ≤390px phone measure

  const AUTH_OPTS = { axes: 'both', minGap: TAP_GAP, noOverflow: true } as const

  test('GUARD-TAP: sign-in form controls are ≥44×44 at 390', async ({ page }) => {
    await page.goto('login')
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    await assertTapFloor(page, AUTH_CONTROLS, 'Sign-in', AUTH_OPTS)
  })

  test('GUARD-TAP: reset-confirm "Back to sign in" is ≥44×44 at 390', async ({ page }) => {
    await page.goto('login')
    await page.getByLabel('Email').fill(VIEWER.email)
    await page.getByRole('button', { name: /forgot password/i }).click()
    await expect(page.getByText(/a reset link is on its way/i)).toBeVisible({ timeout: 10_000 })
    await assertTapFloor(page, AUTH_CONTROLS, 'Reset-confirm', AUTH_OPTS)
  })

  test('GUARD-TAP: recovery link-invalid "Back to sign in" <a> is ≥44×44 at 390', async ({ page }) => {
    await page.goto('recovery')
    await expect(page.getByRole('link', { name: /back to sign in/i })).toBeVisible({ timeout: 10_000 })
    await assertTapFloor(page, AUTH_CONTROLS, 'Recovery (no link)', AUTH_OPTS)
  })

  test('GUARD-TAP: the orphan blocked screen inherits the same floor at 390', async ({ page }) => {
    await loginAs(page, ORPHAN.email, ORPHAN.password)
    await expect(page.getByText(/your account isn't set up yet/i)).toBeVisible({ timeout: 10_000 })
    await assertTapFloor(page, AUTH_CONTROLS, 'Orphan', AUTH_OPTS)
  })
})

// ── Café toolbar guards (GUARD-SEARCH, #378) ──────────────────────────────────────────
// The design audit caught the dish search collapsed to 40.75×36 (Plan) / 49×36 (Log) at
// 1440 while the category wrapped away — the primary filter on both capture surfaces was
// unusable. jsdom computes no layout and a class-name assertion proves nothing about the
// flex algorithm, so the oracle is the RENDERED box, in this guard family.
// Composition oracle: when the category exists, search and category share ONE row with the
// category AFTER the search — the filters compose with each other, never orphaned below the
// scope band. The category control is measured via its toolbar slot (`.ktb-category`, which
// hugs the visible select box): getByRole('combobox') resolves to the native field inset inside
// that slot. Same-rowness is judged on CENTER LINES, so it stays height-agnostic. Café's current
// phone IA intentionally omits the category control; the phone guard still owns the search floor
// and only applies the composition check when a category is rendered.

const SEARCH_FLOOR = 159.5 // 160px usable-measure floor, 0.5px sub-pixel tolerance (TAP_FLOOR idiom)

async function assertSearchComposed(page: Page, surface: string, { categoryOptional = false } = {}) {
  const search = await box(page.locator('.ktb-search'))
  expect(search.width, `${surface}: the dish search keeps its usable measure (≥160px)`).toBeGreaterThanOrEqual(SEARCH_FLOOR)
  const categoryLocator = page.locator('.ktb-category')
  if (categoryOptional && await categoryLocator.count() === 0) return
  await expect(categoryLocator).toHaveCount(1)
  const category = await box(categoryLocator)
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
    await ensureStream(page)
    await expect(page.locator('.ktb-search')).toBeVisible()
    await expect(page.getByRole('combobox', { name: /^category$/i })).toBeVisible()
    await assertSearchComposed(page, 'Café · Log @1440')
  })

  test('GUARD-SEARCH: Café · Plan at 1440 — usable search composed with the category', async ({ page }) => {
    await page.goto('cafe/plan')
    await ensureStream(page)
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
    await ensureStream(page)
    await expect(page.locator('.ktb-category'), 'Café · Log @390: Category is desktop-only').toHaveCount(0)
    const search = await box(page.locator('.ktb-search'))
    await assertSearchComposed(page, 'Café · Log @390', { categoryOptional: true })
    expect(search.height, 'Café · Log @390: phone search keeps the 44px touch floor').toBeGreaterThanOrEqual(TAP_FLOOR)
    // #378 review: same-row checks can pass while the category runs off-viewport — assert it cannot.
    const logOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    expect(logOverflow, 'Café · Log @390: the toolbar never pushes the document wider than the viewport').toBe(false)
  })

  test('GUARD-SEARCH: Café · Plan at 390 — phone composition not regressed by the fix', async ({ page }) => {
    await page.goto('cafe/plan')
    await ensureStream(page)
    await expect(page.locator('.ktb-category'), 'Café · Plan @390: Category is desktop-only').toHaveCount(0)
    const search = await box(page.locator('.ktb-search'))
    await assertSearchComposed(page, 'Café · Plan @390', { categoryOptional: true })
    expect(search.height, 'Café · Plan @390: phone search keeps the 44px touch floor').toBeGreaterThanOrEqual(TAP_FLOOR)
    const planOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    expect(planOverflow, 'Café · Plan @390: the toolbar never pushes the document wider than the viewport').toBe(false)
  })
})

// ── Café · Plan capture-first guards (#401) ────────────────────────────────────────────
// OD-WAY-74 #2 ("enforce") + DD-WAY-40: Plan is a capture surface — no KPI tile row may
// sit above the first dish row at any width, and at the ≤390px phone measure the first
// dish row must be INSIDE the fold: nothing above it (summary band, banners, toolbar)
// may push it below 844px. The pesanan face gets its own GUARD-SEARCH pass — v4
// measured ~231 horizon rows with no way to narrow (Nielsen Café·Plan 16/32).
const FOLD_390 = 844

test.describe('café plan capture-first guards (#401) — editor', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })
  test.beforeEach(async ({ page }) => {
    await loginAs(page, MANAGER.email, MANAGER.password) // editor is ops_lead/admin-gated
  })

  test('GUARD-FOLD: @390 the figures band is the summary rule and the first dish row is inside the fold', async ({ page }) => {
    await page.goto('cafe/plan')
    await ensureStream(page)
    await expect(page.locator('.msr')).toBeVisible()
    expect(await page.locator('.kks').count()).toBe(0) // never the retired tile strip
    await expect(page.locator('.dt-card').first()).toBeVisible()
    const firstRow = await box(page.locator('.dt-card').first())
    expect(firstRow.y + firstRow.height, '(#401) the first dish row must sit inside the 844px fold').toBeLessThanOrEqual(FOLD_390)
  })
})

test.describe('café plan capture-first guards (#401) — pesanan (member)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })
  test.beforeEach(async ({ page }) => {
    await loginAs(page, VIEWER.email, VIEWER.password) // member → the read-only horizon
  })

  test('GUARD-SEARCH+GUARD-FOLD: @390 the member toolbar composes and the first dish row is inside the fold', async ({ page }) => {
    await page.goto('cafe/plan')
    await ensureStream(page)
    await expect(page.locator('.ktb-search')).toBeVisible()
    await expect(page.locator('.ktb-category'), 'Café · Plan member @390: Category is desktop-only').toHaveCount(0)
    await assertSearchComposed(page, 'Café · Plan pesanan @390', { categoryOptional: true })
    await expect(page.locator('.dt-card').first()).toBeVisible()
    const firstRow = await box(page.locator('.dt-card').first())
    expect(firstRow.y + firstRow.height).toBeLessThanOrEqual(FOLD_390)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    expect(overflow, '(#401) the toolbar never pushes the document wider than the viewport').toBe(false)
  })

  test('GUARD-SEARCH: @1440 the member toolbar keeps the usable search measure', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('cafe/plan')
    await ensureStream(page)
    await expect(page.locator('.ktb-search')).toBeVisible()
    await assertSearchComposed(page, 'Café · Plan pesanan @1440')
  })
})
