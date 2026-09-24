/**
 * #930 — the four Work collections (Tasks, Signals, Projects & Processes, Objectives) share one
 * wide operating measure and one record-panel width, whether or not a record is open.
 *
 * Real-browser measurement on purpose: jsdom cannot compute a grid track's resolved width, a
 * `clamp()` percentage, or whether a cell's text actually wrapped. Read-only — no create/edit/
 * archive, so it is safe against the shared local DB under scripts/with-db-lock.sh.
 */
import { test, expect, type Page } from '@playwright/test'
import { loginAs } from './helpers/login'
import { MANAGER } from './fixtures/users'
import { TASKS_RECORD_PANEL_FLOOR_PX } from '../src/shell/use-is-split-width'

const RECORD_PANEL_CAP_PX = 640
// Enough for a realistic task title on one line, not a single truncated word.
const TASK_TITLE_FLOOR_PX = 240
// The identity column's own upper bound (TasksWorkspace.css / catalog-collection.css /
// signal-table-presentation.css).
const IDENTITY_COLUMN_CAP_PX = 640

type Collection = {
  name: 'Tasks' | 'Signals' | 'Projects & Processes' | 'Objectives'
  path: string
  /** Opens the first row's record (inline split panel at desktop widths). */
  openFirstRecord: (page: Page) => Promise<void>
  /** A phone card-list root, present once the collection has rendered. */
  phoneCardSelector: string
  /** The identity/title cell of the first row — the one column meant to absorb spare width. */
  identityCellSelector: string
}

const COLLECTIONS: Collection[] = [
  {
    name: 'Tasks',
    path: 'work/tasks',
    openFirstRecord: async (page) => { await page.locator('.task-row-link').first().click() },
    phoneCardSelector: '.task-card-link, .task-row--create',
    identityCellSelector: 'td.td-main',
  },
  {
    name: 'Signals',
    // Signals defaults to the Feed presentation, whose rows are canonical-page <Link>s, not the
    // inline split panel this suite measures — force Table (?layout=table), whose rows call
    // onOpenRecord like every other collection here.
    path: 'work/signals?layout=table',
    openFirstRecord: async (page) => { await page.locator('.signal-table-message').first().click() },
    phoneCardSelector: '.record-collection-view',
    identityCellSelector: '.signal-table-title-cell',
  },
  {
    name: 'Projects & Processes',
    path: 'work/projects',
    openFirstRecord: async (page) => { await page.locator('.catalog-collection__row-link').first().click() },
    phoneCardSelector: '.catalog-collection__row-link',
    identityCellSelector: '.catalog-collection__identity',
  },
  {
    name: 'Objectives',
    path: 'work/objectives',
    openFirstRecord: async (page) => { await page.locator('.catalog-collection__row-link').first().click() },
    phoneCardSelector: '.catalog-collection__row-link',
    identityCellSelector: '.catalog-collection__identity',
  },
]

async function contentFrameWidth(page: Page): Promise<number> {
  const box = await page.locator('.page-frame__content').first().boundingBox()
  expect(box, '.page-frame__content must render').not.toBeNull()
  return box!.width
}

async function assertNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
}

async function panelWidth(page: Page): Promise<number> {
  const panel = page.locator('aside.drawer.drawer-split').first()
  await expect(panel).toBeVisible()
  const box = await panel.boundingBox()
  expect(box, 'the record panel must render a box').not.toBeNull()
  return box!.width
}

/** `.record-collection-view` clips overflow, so a column budget that doesn't fit clips silently
 *  instead of scrolling the page. `scrollWidth` reports full content size regardless, so
 *  comparing it to `clientWidth` catches the clip either way. `.tasks-scroll` is Tasks' own
 *  narrow-shell fallback, checked the same way. */
const CONTENT_WIDTH_ROOTS = ['.record-collection-view', '.tasks-scroll']

async function overflowReport(page: Page) {
  return page.evaluate((selectors: string[]) => {
    const roots = selectors.flatMap((selector) => Array.from(document.querySelectorAll<HTMLElement>(selector)))
      .map((el) => ({ selector: el.className, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }))
    return {
      page: { scrollWidth: document.documentElement.scrollWidth, clientWidth: window.innerWidth },
      roots,
    }
  }, CONTENT_WIDTH_ROOTS)
}

function assertNoOverflowReport(report: Awaited<ReturnType<typeof overflowReport>>, label: string) {
  expect(report.page.scrollWidth, `${label}: page must not scroll horizontally`).toBeLessThanOrEqual(report.page.clientWidth + 1)
  for (const root of report.roots) {
    expect(root.scrollWidth, `${label}: .${root.selector} content must fit its box (no clipped/overflowing column)`).toBeLessThanOrEqual(root.clientWidth + 1)
  }
}

test.describe('Work collections share one wide measure and one record-panel width (#930)', () => {
  for (const width of [1440, 1920] as const) {
    test.describe(`${width}px desktop`, () => {
      test(`all four collections render the SAME content-frame width at rest (${width}px)`, async ({ page }) => {
        await page.setViewportSize({ width, height: width === 1440 ? 900 : 1080 })
        await loginAs(page, MANAGER.email, MANAGER.password)
        const widths: number[] = []
        for (const collection of COLLECTIONS) {
          await page.goto(collection.path)
          await expect(page.locator('.page-frame__content')).toBeVisible()
          await assertNoOverflow(page)
          widths.push(await contentFrameWidth(page))
        }
        for (const [index, w] of widths.entries()) {
          expect(w, `${COLLECTIONS[index].name} content frame at rest`).toBeGreaterThan(0)
          expect(Math.abs(w - widths[0]), `${COLLECTIONS[index].name} vs ${COLLECTIONS[0].name}`).toBeLessThanOrEqual(2)
        }
      })

      test(`all four collections keep that SAME content-frame width and the shared panel width with a record open (${width}px)`, async ({ page }) => {
        await page.setViewportSize({ width, height: width === 1440 ? 900 : 1080 })
        await loginAs(page, MANAGER.email, MANAGER.password)
        const frameWidths: number[] = []
        const panelWidths: number[] = []
        for (const collection of COLLECTIONS) {
          await page.goto(collection.path)
          await expect(page.locator('.page-frame__content')).toBeVisible()
          const restFrame = await contentFrameWidth(page)
          await collection.openFirstRecord(page)
          const openPanel = panelWidth(page)
          const panel = await openPanel
          const openFrame = await contentFrameWidth(page)
          await assertNoOverflow(page)
          // #930 rule 1 — the frame does not resize when a record opens.
          expect(Math.abs(openFrame - restFrame), `${collection.name}: frame width must not change when a record opens`).toBeLessThanOrEqual(2)
          frameWidths.push(openFrame)
          panelWidths.push(panel)
        }
        for (const [index, w] of frameWidths.entries()) {
          expect(Math.abs(w - frameWidths[0]), `${COLLECTIONS[index].name} vs ${COLLECTIONS[0].name} (record open)`).toBeLessThanOrEqual(2)
        }
        for (const [index, p] of panelWidths.entries()) {
          // --record-panel-w: clamp(440px, 40%, 640px) — every collection's panel must land in
          // that band, and (since all four share one frame width) within a few px of each other.
          expect(p, `${COLLECTIONS[index].name} panel floor`).toBeGreaterThanOrEqual(TASKS_RECORD_PANEL_FLOOR_PX - 2)
          expect(p, `${COLLECTIONS[index].name} panel cap`).toBeLessThanOrEqual(RECORD_PANEL_CAP_PX + 2)
          expect(Math.abs(p - panelWidths[0]), `${COLLECTIONS[index].name} vs ${COLLECTIONS[0].name} panel width`).toBeLessThanOrEqual(4)
        }
      })

      test(`Tasks' Due/Status cells never wrap to two lines, open or closed (${width}px)`, async ({ page }) => {
        await page.setViewportSize({ width, height: width === 1440 ? 900 : 1080 })
        await loginAs(page, MANAGER.email, MANAGER.password)
        await page.goto('work/tasks')
        await expect(page.locator('.tasks-table').first()).toBeVisible()

        async function assertSingleLineDueAndStatus() {
          const rows = page.locator('tr.task-row')
          const count = await rows.count()
          let sawOverdue = false
          for (let i = 0; i < Math.min(count, 20); i += 1) {
            const row = rows.nth(i)
            const statusBox = await row.locator('td.td-status').boundingBox()
            const dueBox = await row.locator('td.td-due').boundingBox()
            if (!statusBox || !dueBox) continue
            if (await row.locator('.due-overdue').count()) sawOverdue = true
            // `height` on a <td> is a floor, not a cap, so a wrapped value grows the cell past
            // the single-line row height; 56px allows sub-pixel slack above it.
            expect(statusBox.height, `row ${i} status cell must stay one line`).toBeLessThanOrEqual(56)
            expect(dueBox.height, `row ${i} due cell must stay one line`).toBeLessThanOrEqual(56)
          }
          return sawOverdue
        }

        const sawOverdueAtRest = await assertSingleLineDueAndStatus()
        await page.locator('.task-row-link').first().click()
        await expect(page.locator('aside.drawer.drawer-split')).toBeVisible()
        const sawOverdueOpen = await assertSingleLineDueAndStatus()
        // Surfaced so a run that never exercised the stacked overdue state is visible, not a
        // silent pass.
        test.info().annotations.push({
          type: 'coverage',
          description: `saw an overdue row at rest=${sawOverdueAtRest}, with a record open=${sawOverdueOpen}`,
        })
      })

      test(`Tasks' Title column keeps a readable floor with a record open (${width}px)`, async ({ page }) => {
        // The record panel narrowing the list must not starve the identity column — the list
        // drops PIC/Supervisor first (TasksWorkspace.css) so Title keeps room, at every desktop
        // width from the split threshold up.
        await page.setViewportSize({ width, height: width === 1440 ? 900 : 1080 })
        await loginAs(page, MANAGER.email, MANAGER.password)
        await page.goto('work/tasks')
        await page.locator('.task-row-link').first().click()
        await expect(page.locator('aside.drawer.drawer-split')).toBeVisible()
        const titleBox = await page.locator('td.td-main').first().boundingBox()
        expect(titleBox, 'the Task title cell must render a box').not.toBeNull()
        expect(titleBox!.width, `Title column width at ${width}px with a record open`).toBeGreaterThanOrEqual(TASK_TITLE_FLOOR_PX)
        // The dropped columns are the mechanism, not just a side effect — assert they are hidden
        // (CSS display:none — still in the DOM for a11y/test stability, never on screen).
        await expect(page.locator('td.td-owner').first()).toBeHidden()
        await expect(page.locator('td.td-supervisor').first()).toBeHidden()
      })
    })
  }

  test('Objectives\' Projects & Processes column shows its relation sentence without an ellipsis clip', async ({ page }) => {
    for (const width of [1440, 1920] as const) {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 1080 })
      await loginAs(page, MANAGER.email, MANAGER.password)
      await page.goto('work/objectives')
      await expect(page.locator('.catalog-collection__row-link').first()).toBeVisible()
      const cells = page.locator('.catalog-collection__cell--cadence .catalog-collection__cell-value')
      const count = await cells.count()
      let sawRelationText = false
      for (let i = 0; i < count; i += 1) {
        const cell = cells.nth(i)
        const text = (await cell.textContent())?.trim() ?? ''
        if (!text || text === '–') continue // "–" — no linked work, nothing to measure
        sawRelationText = true
        const geometry = await cell.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }))
        // Sized to content and allowed to wrap, not clipped to a narrow fixed width —
        // scrollWidth over clientWidth on a nowrap+ellipsis box is exactly what an ellipsis clip
        // looks like; this cell wraps instead, so its own scroll box never exceeds it.
        expect(geometry.scrollWidth, `row ${i} Projects & Processes cell must not clip at ${width}px`).toBeLessThanOrEqual(geometry.clientWidth + 1)
      }
      test.info().annotations.push({ type: 'coverage', description: `${width}px: saw relation text=${sawRelationText}` })
    }
  })

  // A fixed column budget sized for one reference width can still overflow at another; sweep
  // the desktop band and catch it with real layout, not arithmetic.
  for (const width of [1100, 1200, 1300, 1366, 1440] as const) {
    test(`no horizontal overflow at ${width}px, at rest and with a record open`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await loginAs(page, MANAGER.email, MANAGER.password)
      for (const collection of COLLECTIONS) {
        await page.goto(collection.path)
        await expect(page.locator('.page-frame__content')).toBeVisible()
        assertNoOverflowReport(await overflowReport(page), `${collection.name} at rest, ${width}px`)

        await collection.openFirstRecord(page)
        // Below TASKS_SPLIT_MIN_WIDTH, Tasks escalates to the full page instead of the inline
        // split; `.record-page-back` is that page's own chrome.
        await expect(page.locator('aside.drawer.drawer-split, [role="dialog"], .record-page-back').first()).toBeVisible()
        assertNoOverflowReport(await overflowReport(page), `${collection.name} with a record open, ${width}px`)
      }
    })
  }

  test('phone (390px): no horizontal overflow and cards render for all four collections', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await loginAs(page, MANAGER.email, MANAGER.password)
    for (const collection of COLLECTIONS) {
      await page.goto(collection.path)
      await expect(page.locator(collection.phoneCardSelector).first()).toBeVisible()
      await assertNoOverflow(page)
    }
  })

  // The identity column has a MAXIMUM, not "as wide as the frame allows" — its rendered width
  // should stop moving once a viewport is wide enough to reach the cap.
  test('the identity column stops growing well before 2300px, at rest, for all four collections', async ({ page }) => {
    await loginAs(page, MANAGER.email, MANAGER.password)
    const widths = [1440, 1920, 2300] as const
    for (const collection of COLLECTIONS) {
      const byWidth: number[] = []
      for (const width of widths) {
        await page.setViewportSize({ width, height: 1200 })
        await page.goto(collection.path)
        const box = await page.locator(collection.identityCellSelector).first().boundingBox()
        expect(box, `${collection.name} identity cell must render a box at ${width}px`).not.toBeNull()
        byWidth.push(box!.width)
      }
      const [w1440, w1920, w2300] = byWidth
      // Generous 1440→1920 (a track can jump straight to its cap once there's enough free
      // space); tight 1920→2300, where the column must have stopped moving entirely.
      expect(w1920, `${collection.name} identity width must not keep growing past 1920px`).toBeLessThanOrEqual(w1440 + 400)
      expect(w1920, `${collection.name} identity width must have reached its cap by 1920px`).toBeLessThanOrEqual(IDENTITY_COLUMN_CAP_PX + 10)
      expect(w2300, `${collection.name} identity width at 2300px vs 1920px (both should be capped)`).toBeLessThanOrEqual(w1920 + 20)
    }
  })

  test('Tasks PIC column shows a full first name, not an ellipsis clip, at 1440/1920/2300', async ({ page }) => {
    await loginAs(page, MANAGER.email, MANAGER.password)
    for (const width of [1440, 1920, 2300] as const) {
      await page.setViewportSize({ width, height: 1200 })
      await page.goto('work/tasks')
      await expect(page.locator('.tasks-table').first()).toBeVisible()
      const names = page.locator('td.td-owner .own-name')
      const count = await names.count()
      for (let i = 0; i < count; i += 1) {
        const geometry = await names.nth(i).evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, text: el.textContent }))
        expect(geometry.scrollWidth, `row ${i} PIC "${geometry.text}" must not clip at ${width}px`).toBeLessThanOrEqual(geometry.clientWidth + 1)
      }
    }
  })

  test('Home keeps its own (narrower) Signal panel and its list stays readable beside it', async ({ page }) => {
    // Home is not one of the four Work collections --record-panel-w sizes; its Signal panel
    // must keep its own, narrower width rather than inheriting the shared token.
    await page.setViewportSize({ width: 1440, height: 900 })
    await loginAs(page, MANAGER.email, MANAGER.password)
    await page.goto('/')
    const opener = page.getByRole('button', { name: /^Open signal:/ }).first()
    await expect(opener).toBeVisible({ timeout: 15_000 })
    await opener.click()
    const panel = page.locator('aside.drawer').first()
    await expect(panel).toBeVisible()
    const panelBox = await panel.boundingBox()
    expect(panelBox, 'the Home record panel must render a box').not.toBeNull()
    expect(panelBox!.width, 'Home panel must keep its own ~480px width, not --record-panel-w').toBeLessThanOrEqual(500)
    await assertNoOverflow(page)
  })

  test('Signals drops Team before Attention with a record open (Attention stays, Team gives way)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await loginAs(page, MANAGER.email, MANAGER.password)
    await page.goto('work/signals?layout=table')
    await page.locator('.signal-table-message').first().click()
    await expect(page.locator('aside.drawer.drawer-split')).toBeVisible()
    await expect(page.locator('.signal-collection-table thead th').nth(1)).toBeHidden() // Team
    await expect(page.locator('.signal-collection-table thead th').nth(2)).toBeVisible() // Attention
  })

  test('Tasks "+ Create task" stays aligned with the table\'s content measure at 2300px', async ({ page }) => {
    await page.setViewportSize({ width: 2300, height: 1200 })
    await loginAs(page, MANAGER.email, MANAGER.password)
    await page.goto('work/tasks')
    const createButton = page.getByRole('button', { name: /create task/i })
    const table = page.locator('.tasks-table').first()
    await expect(createButton).toBeVisible()
    await expect(table).toBeVisible()
    const [buttonBox, splitBox] = await Promise.all([
      createButton.boundingBox(),
      page.locator('.split').first().boundingBox(),
    ])
    expect(buttonBox, 'the Create task button must render a box').not.toBeNull()
    expect(splitBox, 'the .split content region must render a box').not.toBeNull()
    expect(buttonBox!.x + buttonBox!.width, 'Create task must not overhang the content measure').toBeLessThanOrEqual(splitBox!.x + splitBox!.width + 2)
    await assertNoOverflow(page)
  })
})
