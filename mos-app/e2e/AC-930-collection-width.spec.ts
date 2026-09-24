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
// #930-cb-r1 (F-2) — with a record open, Tasks' Title column must stay readable, not just
// non-zero. 240px is the floor named in the correction: enough for a realistic task title
// ("Replace grinder burrs (Cafe 2)") on one line without reading as a single truncated word.
const TASK_TITLE_FLOOR_PX = 240

type Collection = {
  name: 'Tasks' | 'Signals' | 'Projects & Processes' | 'Objectives'
  path: string
  /** Opens the first row's record (inline split panel at desktop widths). */
  openFirstRecord: (page: Page) => Promise<void>
  /** A phone card-list root, present once the collection has rendered. */
  phoneCardSelector: string
}

const COLLECTIONS: Collection[] = [
  {
    name: 'Tasks',
    path: 'work/tasks',
    openFirstRecord: async (page) => { await page.locator('.task-row-link').first().click() },
    phoneCardSelector: '.task-card-link, .task-row--create',
  },
  {
    name: 'Signals',
    // Signals defaults to the Feed presentation, whose rows are canonical-page <Link>s, not the
    // inline split panel this suite measures — force Table (?layout=table), whose rows call
    // onOpenRecord like every other collection here.
    path: 'work/signals?layout=table',
    openFirstRecord: async (page) => { await page.locator('.signal-table-message').first().click() },
    phoneCardSelector: '.record-collection-view',
  },
  {
    name: 'Projects & Processes',
    path: 'work/projects',
    openFirstRecord: async (page) => { await page.locator('.catalog-collection__row-link').first().click() },
    phoneCardSelector: '.catalog-collection__row-link',
  },
  {
    name: 'Objectives',
    path: 'work/objectives',
    openFirstRecord: async (page) => { await page.locator('.catalog-collection__row-link').first().click() },
    phoneCardSelector: '.catalog-collection__row-link',
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
            // A single-line decision-column row's cell renders at --row-min-h (52px) — `height`
            // on a <td> is a floor, not a cap, so a wrapped 2-line value (e.g. the stacked
            // "Overdue" / "<date>" state) grows the cell past it. 56px gives a few px of
            // sub-pixel/line-height slack above the normal single-line box.
            expect(statusBox.height, `row ${i} status cell must stay one line`).toBeLessThanOrEqual(56)
            expect(dueBox.height, `row ${i} due cell must stay one line`).toBeLessThanOrEqual(56)
          }
          return sawOverdue
        }

        const sawOverdueAtRest = await assertSingleLineDueAndStatus()
        await page.locator('.task-row-link').first().click()
        await expect(page.locator('aside.drawer.drawer-split')).toBeVisible()
        const sawOverdueOpen = await assertSingleLineDueAndStatus()
        // Not a hard requirement (seed data may hold no overdue task right now), but surfaced so
        // a run that never actually exercised the stacked "Overdue · <date>" state is visible in
        // the report rather than silently passing on rows that never needed the wider floor.
        test.info().annotations.push({
          type: 'coverage',
          description: `saw an overdue row at rest=${sawOverdueAtRest}, with a record open=${sawOverdueOpen}`,
        })
      })

      test(`Tasks' Title column keeps a readable floor with a record open (${width}px)`, async ({ page }) => {
        // #930-cb-r1 (F-2 regression): the record panel narrowing the list must not starve the
        // identity column — the list drops PIC/Supervisor first (TasksWorkspace.css) so Title
        // keeps room, at every desktop width from the split threshold up.
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

  test('Objectives\' Projects & Processes column shows its relation sentence without an ellipsis clip (F-9)', async ({ page }) => {
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
        // #930-cb-r1 (F-9): sized to content (200px + wrap), not clipped to a fixed 140px —
        // scrollWidth over clientWidth on a nowrap+ellipsis box is exactly what an ellipsis clip
        // looks like; this cell now wraps instead, so its own scroll box never exceeds it.
        expect(geometry.scrollWidth, `row ${i} Projects & Processes cell must not clip at ${width}px`).toBeLessThanOrEqual(geometry.clientWidth + 1)
      }
      test.info().annotations.push({ type: 'coverage', description: `${width}px: saw relation text=${sawRelationText}` })
    }
  })

  test('phone (390px): no horizontal overflow and cards render for all four collections', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await loginAs(page, MANAGER.email, MANAGER.password)
    for (const collection of COLLECTIONS) {
      await page.goto(collection.path)
      await expect(page.locator(collection.phoneCardSelector).first()).toBeVisible()
      await assertNoOverflow(page)
    }
  })
})
