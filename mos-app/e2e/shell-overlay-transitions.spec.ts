// Shell overlay lifecycle across destinations, and Deputy placement after those transitions.
// Every journey is read-only: it opens, closes and navigates, and never edits a record.
import { test, expect, type Locator, type Page } from '@playwright/test'
import { loginAs } from './helpers/login'
import { DEMO_PASSWORD } from '../src/pages/demo-personas'

const DIRECTOR = 'dewi.dev@example.test'
const DESKTOP = { width: 1440, height: 900 }
const PHONE = { width: 390, height: 844 }

const recordPanel = (page: Page) => page.locator('[data-overlay-host]')
const deputy = (page: Page) => page.locator('[data-overlay-companion]')
const deputyButton = (page: Page) => page.getByRole('button', { name: 'Open deputy', exact: true })
const rail = (page: Page) => page.getByRole('navigation', { name: 'Primary' })

async function openFirstRecord(page: Page, collection: 'objectives' | 'projects'): Promise<string> {
  await page.goto(`work/${collection}`)
  const row = page.locator('.catalog-collection__row-link').first()
  await expect(row).toBeVisible()
  const href = (await row.getAttribute('href')) ?? ''
  const id = href.split('/').pop() ?? ''
  await row.click()
  await expect(page).toHaveURL(new RegExp(`record=${id}`))
  await expect(recordPanel(page)).toBeVisible()
  await expect(recordPanel(page).locator('.record-viewer')).toBeVisible()
  return id
}

async function expectNoStaleRecord(page: Page, heading: string) {
  await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible()
  await expect(recordPanel(page)).toHaveCount(0)
  await expect(page.locator('.record-viewer')).toHaveCount(0)
}

/** The collection URL with no record in it (view state such as ?layout= may ride along). */
const collectionUrl = (collection: string) => new RegExp(`/work/${collection}(\\?(?!.*record=)[^#]*)?$`)

async function box(locator: Locator) {
  const b = await locator.boundingBox()
  expect(b).not.toBeNull()
  return b!
}

/** Deputy is on screen in its intended host: right-anchored fixed panel on desktop, full-screen
 * modal on phone; the header stays visible and the page underneath does not move. */
async function expectDeputyPlaced(page: Page, viewport: { width: number; height: number }, mainBefore: { x: number; y: number; width: number; height: number }) {
  const panel = deputy(page)
  await expect(panel).toBeVisible()
  const b = await box(panel)
  expect(b.x).toBeGreaterThanOrEqual(0)
  expect(b.y).toBeGreaterThanOrEqual(0)
  expect(b.x + b.width).toBeLessThanOrEqual(viewport.width + 0.5)
  expect(b.y + b.height).toBeLessThanOrEqual(viewport.height + 0.5)
  const main = await box(page.locator('#main-content'))
  expect(main).toEqual(mainBefore)
  if (viewport.width >= 920) {
    expect(await panel.evaluate((el) => getComputedStyle(el).position)).toBe('fixed')
    // Alone it docks to the right edge; beside a record it sits left of the record panel.
    if (await panel.evaluate((el) => el.classList.contains('overlay-companion-host--standalone'))) {
      expect(Math.abs(b.x + b.width - viewport.width)).toBeLessThanOrEqual(1)
    }
    const header = await box(page.locator('header').first())
    expect(header.y).toBe(0)
    expect(b.y).toBeGreaterThanOrEqual(header.y + header.height - 0.5)
    await expect(deputyButton(page)).toBeVisible()
  } else {
    await expect(panel).toHaveAttribute('aria-modal', 'true')
    expect(b.width).toBeGreaterThanOrEqual(viewport.width - 1)
  }
}

test.describe('shell overlay transitions', () => {
  test('Objective panel does not follow the rail into Projects & Processes, and the reverse', async ({ page }, info) => {
    await page.setViewportSize(DESKTOP)
    await loginAs(page, DIRECTOR, DEMO_PASSWORD)

    await openFirstRecord(page, 'objectives')
    await rail(page).getByRole('link', { name: 'Projects & Processes' }).click()
    await expect(page).toHaveURL(collectionUrl('projects'))
    await expectNoStaleRecord(page, 'Projects & Processes')
    await page.screenshot({ path: info.outputPath('objective-to-projects-1440.png'), animations: 'disabled', fullPage: true })

    await openFirstRecord(page, 'projects')
    await rail(page).getByRole('link', { name: 'Objectives' }).click()
    await expect(page).toHaveURL(collectionUrl('objectives'))
    await expectNoStaleRecord(page, 'Objectives')
    await page.screenshot({ path: info.outputPath('process-to-objectives-1440.png'), animations: 'disabled', fullPage: true })
  })

  test('Back restores only the record its URL names; Close returns focus to the row', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await loginAs(page, DIRECTOR, DEMO_PASSWORD)

    const id = await openFirstRecord(page, 'objectives')
    await rail(page).getByRole('link', { name: 'Projects & Processes' }).click()
    await expectNoStaleRecord(page, 'Projects & Processes')

    await page.goBack()
    await expect(page).toHaveURL(new RegExp(`/work/objectives\\?.*record=${id}`))
    await expect(recordPanel(page)).toBeVisible()
    await expect(recordPanel(page)).toHaveAttribute('data-overlay-entry', `objective:${id}`)

    // One more Back leaves the record: the collection URL without a record shows no panel.
    await page.goBack()
    await expect(page).toHaveURL(collectionUrl('objectives'))
    await expectNoStaleRecord(page, 'Objectives')
    await page.goForward()
    await expect(recordPanel(page)).toHaveAttribute('data-overlay-entry', `objective:${id}`)

    await recordPanel(page).getByRole('button', { name: 'Close', exact: true }).click()
    await expect(recordPanel(page)).toHaveCount(0)
    await expect(page).toHaveURL(collectionUrl('objectives'))
    await expect(page.locator(`.catalog-collection__row-link[href$="/${id}"]`)).toBeFocused()

    // A second rail trip after the close must not resurrect anything either.
    await rail(page).getByRole('link', { name: 'Projects & Processes' }).click()
    await expectNoStaleRecord(page, 'Projects & Processes')
  })

  test('returning to the first collection through the rail shows no leftover record', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await loginAs(page, DIRECTOR, DEMO_PASSWORD)

    await openFirstRecord(page, 'objectives')
    await rail(page).getByRole('link', { name: 'Projects & Processes' }).click()
    await expectNoStaleRecord(page, 'Projects & Processes')
    await rail(page).getByRole('link', { name: 'Objectives' }).click()
    await expect(page).toHaveURL(collectionUrl('objectives'))
    await expectNoStaleRecord(page, 'Objectives')
    await page.goBack()
    await expect(page).toHaveURL(collectionUrl('projects'))
    await expectNoStaleRecord(page, 'Projects & Processes')
  })

  test('a record left behind stays gone through a tour of other destinations', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await loginAs(page, DIRECTOR, DEMO_PASSWORD)

    await openFirstRecord(page, 'objectives')
    for (const name of [/^Signals/, /^Tasks/, /^Home/, /^Inbox/, /^Café/]) {
      await rail(page).getByRole('link', { name }).first().click()
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
      await expect(recordPanel(page)).toHaveCount(0)
    }
    await rail(page).getByRole('link', { name: 'Objectives' }).click()
    await expect(page).toHaveURL(collectionUrl('objectives'))
    await expectNoStaleRecord(page, 'Objectives')
  })

  test('a Task panel is not restored on return unless its URL names it', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await loginAs(page, DIRECTOR, DEMO_PASSWORD)

    await page.goto('work/tasks')
    await page.locator('tr.task-row').first().getByRole('link').first().click()
    await expect(page).toHaveURL(/record=/)
    await expect(recordPanel(page)).toBeVisible()
    await rail(page).getByRole('link', { name: /^Signals/ }).first().click()
    await expect(recordPanel(page)).toHaveCount(0)
    await rail(page).getByRole('link', { name: /^Tasks/ }).first().click()
    await expect(page).toHaveURL(collectionUrl('tasks'))
    await expect(page.locator('tr.task-row').first()).toBeVisible()
    await expect(recordPanel(page)).toHaveCount(0)
  })

  test('a Home Signal comes back with its history entry on Back, and leaves again on Forward', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await loginAs(page, DIRECTOR, DEMO_PASSWORD)

    const row = page.locator('main [data-signal-id][role="button"]').first()
    await expect(row).toBeVisible()
    const id = await row.getAttribute('data-signal-id')
    await row.click()
    const panel = page.locator('[data-overlay-host][data-overlay-owner="signals"]')
    await expect(panel).toHaveAttribute('data-overlay-entry', `signal:${id}`)

    await rail(page).getByRole('link', { name: /^Tasks/ }).first().click()
    await expect(page).toHaveURL(/\/work\/tasks/)
    await expect(recordPanel(page)).toHaveCount(0)

    await page.goBack()
    await expect(page).toHaveURL(/\/mos\/?$/)
    await expect(panel).toHaveAttribute('data-overlay-entry', `signal:${id}`)

    await page.goForward()
    await expect(page).toHaveURL(/\/work\/tasks/)
    await expect(recordPanel(page)).toHaveCount(0)

    await page.goBack()
    await expect(panel).toHaveAttribute('data-overlay-entry', `signal:${id}`)
  })

  for (const width of [1280, 1440, 1920, 2300]) {
    test(`Deputy beside a record never overlaps it at ${width}px`, async ({ page }, info) => {
      const viewport = { width, height: 900 }
      await page.setViewportSize(viewport)
      await loginAs(page, DIRECTOR, DEMO_PASSWORD)
      for (const collection of ['objectives', 'projects'] as const) {
        await openFirstRecord(page, collection)
        await deputyButton(page).click()
        await expect(deputy(page)).toHaveClass(/overlay-companion-host--with-record/)
        const d = await box(deputy(page))
        const r = await box(recordPanel(page))
        for (const b of [d, r]) {
          expect(b.x).toBeGreaterThanOrEqual(0)
          expect(b.x + b.width).toBeLessThanOrEqual(width + 0.5)
        }
        expect(d.width).toBeGreaterThanOrEqual(280)
        expect(d.x + d.width).toBeLessThanOrEqual(r.x)
        const header = await box(page.locator('header').first())
        expect(header.y).toBe(0)
        await expect(deputyButton(page)).toBeVisible()
        await page.screenshot({ path: info.outputPath(`deputy-beside-${collection}-${width}.png`), animations: 'disabled' })
        await page.keyboard.press('Escape')
        await expect(deputy(page)).toHaveCount(0)
      }
    })
  }

  for (const width of [1024, 1440, 1920]) {
    test(`Deputy keeps the header in view at ${width}px, with and without a record`, async ({ page }, info) => {
      const viewport = { width, height: width === 1920 ? 1080 : width === 1024 ? 768 : 900 }
      await page.setViewportSize(viewport)
      await loginAs(page, DIRECTOR, DEMO_PASSWORD)
      await page.goto('work/objectives')
      await expect(page.locator('.catalog-collection__row-link').first()).toBeVisible()
      const mainBefore = await box(page.locator('#main-content'))
      await deputyButton(page).click()
      await expectDeputyPlaced(page, viewport, mainBefore)
      expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0)
      await page.screenshot({ path: info.outputPath(`deputy-${width}.png`), animations: 'disabled' })

      await page.locator('.catalog-collection__row-link').first().click()
      await expect(recordPanel(page)).toBeVisible()
      await expect(deputy(page)).toHaveClass(/overlay-companion-host--with-record/)
      await expectDeputyPlaced(page, viewport, mainBefore)
      expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0)
      await page.screenshot({ path: info.outputPath(`deputy-with-record-${width}.png`), animations: 'disabled' })
    })
  }

  test('Deputy opens in its right-side host after leaving a record for Home, and after reload', async ({ page }, info) => {
    await page.setViewportSize(DESKTOP)
    await loginAs(page, DIRECTOR, DEMO_PASSWORD)

    await openFirstRecord(page, 'objectives')
    await rail(page).getByRole('link', { name: 'Home' }).click()
    await expect(recordPanel(page)).toHaveCount(0)
    const mainBefore = await box(page.locator('#main-content'))

    await deputyButton(page).click()
    await expectDeputyPlaced(page, DESKTOP, mainBefore)
    await expect(deputy(page)).toHaveClass(/overlay-companion-host--standalone/)
    await page.screenshot({ path: info.outputPath('deputy-after-record-home-1440.png'), animations: 'disabled' })

    await page.reload()
    await expect(deputy(page)).toBeVisible()
    await expectDeputyPlaced(page, DESKTOP, mainBefore)
    await expect(recordPanel(page)).toHaveCount(0)
    await page.screenshot({ path: info.outputPath('deputy-after-reload-1440.png'), animations: 'disabled' })

    await deputy(page).focus()
    await page.keyboard.press('Escape')
    await expect(deputy(page)).toHaveCount(0)
  })

  test('Deputy beside an open record stays on screen and clear of the record controls', async ({ page }, info) => {
    await page.setViewportSize(DESKTOP)
    await loginAs(page, DIRECTOR, DEMO_PASSWORD)

    await openFirstRecord(page, 'objectives')
    const closeRecord = recordPanel(page).getByRole('button', { name: 'Close', exact: true })
    const mainBefore = await box(page.locator('#main-content'))
    await deputyButton(page).click()
    await expectDeputyPlaced(page, DESKTOP, mainBefore)
    const d = await box(deputy(page))
    const c = await box(closeRecord)
    const overlaps = d.x < c.x + c.width && c.x < d.x + d.width && d.y < c.y + c.height && c.y < d.y + d.height
    expect(overlaps).toBe(false)
    await expect(recordPanel(page)).toBeVisible()
    await page.screenshot({ path: info.outputPath('deputy-with-record-1440.png'), animations: 'disabled' })
  })

  test('phone: Deputy is a modal that takes focus, closes on Escape and returns focus', async ({ page }, info) => {
    await page.setViewportSize(PHONE)
    await loginAs(page, DIRECTOR, DEMO_PASSWORD)

    // A record visited and closed through Back first: the session must not linger into Home.
    await page.goto('work/objectives')
    const row = page.locator('.catalog-collection__row-link').first()
    await row.click()
    await expect(recordPanel(page)).toBeVisible()
    await recordPanel(page).getByRole('button', { name: 'Close', exact: true }).click()
    await expect(recordPanel(page)).toHaveCount(0)
    await expect(row).toBeFocused()
    await rail(page).getByRole('link', { name: 'Home' }).click()
    await expect(page).toHaveURL(/\/mos\/?$/)

    const mainBefore = await box(page.locator('#main-content'))
    await deputyButton(page).click()
    await expectDeputyPlaced(page, PHONE, mainBefore)
    await expect(deputy(page)).not.toHaveClass(/with-record|over-record/)
    expect(await deputy(page).evaluate((el) => el.contains(document.activeElement))).toBe(true)
    await page.screenshot({ path: info.outputPath('deputy-phone-390.png'), animations: 'disabled' })

    await page.keyboard.press('Escape')
    await expect(deputy(page)).toHaveCount(0)
    await expect(deputyButton(page)).toBeFocused()

    await deputyButton(page).click()
    await page.reload()
    await expectDeputyPlaced(page, PHONE, mainBefore)
    await page.screenshot({ path: info.outputPath('deputy-phone-reload-390.png'), animations: 'disabled' })
  })
})
