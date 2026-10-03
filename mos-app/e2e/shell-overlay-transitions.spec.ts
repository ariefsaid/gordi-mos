// Shell overlay lifecycle across destinations, and Deputy placement after those transitions.
// Every journey is read-only: it opens, closes and navigates, and never edits a record.
import { test, expect, type Locator, type Page } from '@playwright/test'
import { loginAs } from './helpers/login'
import { DEMO_PASSWORD } from '../src/pages/demo-personas'
import { stripE2eBasePath } from './helpers/app-path'

const DIRECTOR = 'dewi.dev@example.test'
const DESKTOP = { width: 1440, height: 900 }
const PHONE = { width: 390, height: 844 }

const recordPanel = (page: Page) => page.locator('[data-overlay-host]')
const deputy = (page: Page) => page.locator('[data-overlay-companion]')
const deputyButton = (page: Page) => page.getByRole('button', { name: 'Open deputy', exact: true })
const rail = (page: Page) => page.getByRole('navigation', { name: 'Primary' })

async function openFirstRecord(page: Page, collection: 'objectives' | 'projects'): Promise<{ id: string; name: string }> {
  await page.goto(`work/${collection}`)
  const row = page.locator('.catalog-collection__row-link').first()
  await expect(row).toBeVisible()
  const href = (await row.getAttribute('href')) ?? ''
  const id = href.split('/').pop() ?? ''
  const name = (await row.getAttribute('aria-label')) ?? ''
  await row.click()
  await expect(page).toHaveURL(new RegExp(`record=${id}`))
  await expect(recordPanel(page)).toBeVisible()
  // OD-RECORD-1: the panel hosts the record's named region (aria-label = record name),
  // not the retired .record-viewer shell.
  await expect(recordPanel(page).getByRole('region', { name, exact: true })).toBeVisible()
  return { id, name }
}

async function openFirstTaskRecord(page: Page): Promise<Locator> {
  await page.goto('work/tasks')
  const taskLink = page.locator('tr.task-row').first().getByRole('link').first()
  await expect(taskLink).toBeVisible()
  await taskLink.click()
  await expect(page).toHaveURL(/record=/)
  await expect(recordPanel(page)).toBeVisible()
  await expect(recordPanel(page).getByRole('region').first()).toBeVisible()
  return taskLink
}

async function expectNoStaleRecord(page: Page, heading: string, recordName?: string) {
  await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible()
  await expect(recordPanel(page)).toHaveCount(0)
  // The navigated-away record's named region must be gone with the panel.
  if (recordName) await expect(page.getByRole('region', { name: recordName, exact: true })).toHaveCount(0)
}

/** The collection URL with no record in it (view state such as ?layout= may ride along). */
const collectionUrl = (collection: string) => new RegExp(`/work/${collection}(\\?(?!.*record=)[^#]*)?$`)

async function box(locator: Locator) {
  const b = await locator.boundingBox()
  expect(b).not.toBeNull()
  return b!
}

/** Deputy is on screen in its intended host: right-anchored fixed panel on desktop, full-screen
 * modal on phone; the header stays visible. Standalone on desktop it docks, so the main region
 * gives up exactly the panel's width (drawer.css data-panel-docked='deputy'); with a record it
 * anchors below the record identity header, and on phone it is a modal above the mounted record. */
async function expectDeputyPlaced(page: Page, viewport: { width: number; height: number }, mainBefore: { x: number; y: number; width: number; height: number }) {
  const panel = deputy(page)
  await expect(panel).toBeVisible()
  const b = await box(panel)
  expect(b.x).toBeGreaterThanOrEqual(0)
  expect(b.y).toBeGreaterThanOrEqual(0)
  expect(b.x + b.width).toBeLessThanOrEqual(viewport.width + 0.5)
  expect(b.y + b.height).toBeLessThanOrEqual(viewport.height + 0.5)
  const main = await box(page.locator('#main-content'))
  const docked = viewport.width >= 920
    && await panel.evaluate((el) => el.classList.contains('overlay-companion-host--standalone'))
  if (docked) {
    expect(main.x).toBe(mainBefore.x)
    expect(main.y).toBe(mainBefore.y)
    expect(main.height).toBe(mainBefore.height)
    expect(Math.abs(main.width - (mainBefore.width - b.width)), 'main gives up exactly the dock width').toBeLessThanOrEqual(1)
    expect(main.x + main.width).toBeLessThanOrEqual(b.x + 0.5)
  } else {
    expect(main).toEqual(mainBefore)
  }
  if (viewport.width >= 920) {
    expect(await panel.evaluate((el) => getComputedStyle(el).position)).toBe('fixed')
    // Alone it docks to the right edge; beside a record it occupies the record column.
    if (docked) {
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

    const { name: objectiveName } = await openFirstRecord(page, 'objectives')
    await rail(page).getByRole('link', { name: 'Projects & Processes' }).click()
    await expect(page).toHaveURL(collectionUrl('projects'))
    await expectNoStaleRecord(page, 'Projects & Processes', objectiveName)
    await page.screenshot({ path: info.outputPath('objective-to-projects-1440.png'), animations: 'disabled', fullPage: true })

    const { name: projectName } = await openFirstRecord(page, 'projects')
    await rail(page).getByRole('link', { name: 'Objectives' }).click()
    await expect(page).toHaveURL(collectionUrl('objectives'))
    await expectNoStaleRecord(page, 'Objectives', projectName)
    await page.screenshot({ path: info.outputPath('process-to-objectives-1440.png'), animations: 'disabled', fullPage: true })
  })

  test('Back restores only the record its URL names; Close returns focus to the row', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await loginAs(page, DIRECTOR, DEMO_PASSWORD)

    const { id, name: objectiveName } = await openFirstRecord(page, 'objectives')
    await rail(page).getByRole('link', { name: 'Projects & Processes' }).click()
    await expectNoStaleRecord(page, 'Projects & Processes', objectiveName)

    await page.goBack()
    await expect(page).toHaveURL(new RegExp(`/work/objectives\\?.*record=${id}`))
    await expect(recordPanel(page)).toBeVisible()
    await expect(recordPanel(page)).toHaveAttribute('data-overlay-entry', `objective:${id}`)

    // One more Back leaves the record: the collection URL without a record shows no panel.
    await page.goBack()
    await expect(page).toHaveURL(collectionUrl('objectives'))
    await expectNoStaleRecord(page, 'Objectives', objectiveName)
    await page.goForward()
    await expect(recordPanel(page)).toHaveAttribute('data-overlay-entry', `objective:${id}`)

    await recordPanel(page).getByRole('button', { name: 'Close', exact: true }).click()
    await expect(recordPanel(page)).toHaveCount(0)
    await expect(page).toHaveURL(collectionUrl('objectives'))
    await expect(page.locator(`.catalog-collection__row-link[href$="/${id}"]`)).toBeFocused()

    // A second rail trip after the close must not resurrect anything either.
    await rail(page).getByRole('link', { name: 'Projects & Processes' }).click()
    await expectNoStaleRecord(page, 'Projects & Processes', objectiveName)
  })

  test('returning to the first collection through the rail shows no leftover record', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await loginAs(page, DIRECTOR, DEMO_PASSWORD)

    const { name: objectiveName } = await openFirstRecord(page, 'objectives')
    await rail(page).getByRole('link', { name: 'Projects & Processes' }).click()
    await expectNoStaleRecord(page, 'Projects & Processes', objectiveName)
    await rail(page).getByRole('link', { name: 'Objectives' }).click()
    await expect(page).toHaveURL(collectionUrl('objectives'))
    await expectNoStaleRecord(page, 'Objectives', objectiveName)
    await page.goBack()
    await expect(page).toHaveURL(collectionUrl('projects'))
    await expectNoStaleRecord(page, 'Projects & Processes', objectiveName)
  })

  test('a record left behind stays gone through a tour of other destinations', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await loginAs(page, DIRECTOR, DEMO_PASSWORD)

    const { name: objectiveName } = await openFirstRecord(page, 'objectives')
    for (const name of [/^Signals/, /^Tasks/, /^Home/, /^Inbox/, /^Café/]) {
      await rail(page).getByRole('link', { name }).first().click()
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
      await expect(recordPanel(page)).toHaveCount(0)
    }
    await rail(page).getByRole('link', { name: 'Objectives' }).click()
    await expect(page).toHaveURL(collectionUrl('objectives'))
    await expectNoStaleRecord(page, 'Objectives', objectiveName)
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
    await expect.poll(() => stripE2eBasePath(new URL(page.url()).pathname)).toBe('/')
    await expect(panel).toHaveAttribute('data-overlay-entry', `signal:${id}`)

    await page.goForward()
    await expect(page).toHaveURL(/\/work\/tasks/)
    await expect(recordPanel(page)).toHaveCount(0)

    await page.goBack()
    await expect(panel).toHaveAttribute('data-overlay-entry', `signal:${id}`)
  })

  for (const width of [1280, 1440, 1920, 2300]) {
    test(`Deputy anchors inside the record column at ${width}px`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 })
      await loginAs(page, DIRECTOR, DEMO_PASSWORD)
      for (const collection of ['objectives', 'projects'] as const) {
        await openFirstRecord(page, collection)
        await deputyButton(page).click()
        await expect(deputy(page)).toHaveClass(/overlay-companion-host--with-record/)
        const d = await box(deputy(page))
        const r = await box(recordPanel(page))
        const identityHeader = await box(recordPanel(page).locator('[data-record-header="true"]'))
        expect(d.x).toBeGreaterThanOrEqual(r.x)
        expect(d.x + d.width).toBeLessThanOrEqual(r.x + r.width + 0.5)
        expect(Math.abs(d.x + d.width - (r.x + r.width))).toBeLessThanOrEqual(1)
        expect(d.y).toBeGreaterThanOrEqual(identityHeader.y + identityHeader.height)
        await page.screenshot({ path: info.outputPath(`deputy-record-column-${collection}-${width}.png`), animations: 'disabled' })
        await page.keyboard.press('Escape')
        await expect(deputy(page)).toHaveCount(0)
      }
    })
  }

  test('Task Status and Due stay unobscured beside the record and Deputy', async ({ page }, info) => {
    await page.setViewportSize(DESKTOP)
    await loginAs(page, DIRECTOR, DEMO_PASSWORD)
    await openFirstTaskRecord(page)
    await deputyButton(page).click()

    const d = await box(deputy(page))
    const row = page.locator('tr.task-row').nth(6)
    for (const cell of [row.locator('td').nth(1), row.locator('td').nth(4)]) {
      const c = await box(cell)
      const overlaps = d.x < c.x + c.width && c.x < d.x + d.width && d.y < c.y + c.height && c.y < d.y + d.height
      expect(overlaps).toBe(false)
    }
    await expect(page.getByRole('columnheader', { name: /status/i })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /due/i })).toBeVisible()
    await page.screenshot({ path: info.outputPath('deputy-task-status-due-1440.png'), animations: 'disabled' })
  })

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

    await expect.poll(() => page.evaluate(() => {
      const panel = document.querySelector('[data-overlay-companion]')
      return !!panel?.contains(document.activeElement)
    })).toBe(false)
    await page.screenshot({ path: info.outputPath('deputy-after-reload-1440.png'), animations: 'disabled' })

    await deputy(page).focus()
    await page.keyboard.press('Escape')
    await expect(deputy(page)).toHaveCount(0)
  })

  test('Deputy stays below the record identity/actions header', async ({ page }, info) => {
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

  test('desktop: menus, palette, Deputy and record unwind one Escape layer at a time', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await loginAs(page, DIRECTOR, DEMO_PASSWORD)
    const taskLink = await openFirstTaskRecord(page)

    // Open from the record so close returns focus to the record's own action.
    const more = recordPanel(page).getByRole('button', { name: 'More actions', exact: true })
    await more.click()
    const recordMenu = page.getByRole('menu')
    const copyLink = recordMenu.getByRole('menuitem', { name: 'Copy link', exact: true })
    const askDeputy = recordMenu.getByRole('menuitem', { name: 'Ask Deputy', exact: true })
    const archiveTask = recordMenu.getByRole('menuitem', { name: 'Archive task', exact: true })
    await expect(copyLink).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(askDeputy).toBeFocused()
    await page.keyboard.press('End')
    await expect(archiveTask).toBeFocused()
    await page.keyboard.press('Home')
    await expect(copyLink).toBeFocused()

    // The menu stays mounted beneath the palette; its document listener must not steal palette arrows.
    await page.keyboard.press('Meta+k')
    const palette = page.getByRole('dialog', { name: 'Command menu', exact: true })
    await expect(palette).toBeVisible()
    const paletteInput = palette.getByRole('combobox')
    await expect(paletteInput).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(paletteInput).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(palette).toHaveCount(0)
    await expect(recordMenu).toBeVisible()
    await expect(copyLink).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(recordMenu).toHaveCount(0)
    await expect(more).toBeFocused()
    await more.click()
    await page.getByRole('menuitem', { name: 'Ask Deputy', exact: true }).click()
    await expect(deputy(page)).toBeVisible()
    await expect.poll(() => page.evaluate(() => {
      const panel = document.querySelector('[data-overlay-companion]')
      return !!panel?.contains(document.activeElement)
    })).toBe(true)

    const composer = deputy(page).getByRole('textbox', { name: /ask the deputy/i })
    const send = deputy(page).getByRole('button', { name: 'Send', exact: true })
    await expect(composer).not.toHaveValue('')
    await expect(send).toBeEnabled()
    await composer.focus()
    await page.keyboard.press('Tab')
    await expect(send).toBeFocused()
    await page.keyboard.press('Tab')
    await expect.poll(() => page.evaluate(() => {
      const record = document.querySelector('[data-overlay-host="true"]')
      return !!record?.contains(document.activeElement) && document.activeElement !== document.body
    })).toBe(true)

    await page.keyboard.press('Escape')
    await expect(deputy(page)).toHaveCount(0)
    await expect(recordPanel(page)).toBeVisible()
    await expect.poll(() => page.evaluate(() => !!document.querySelector('[data-overlay-host]')?.contains(document.activeElement))).toBe(true)

    await page.keyboard.press('Escape')
    await expect(recordPanel(page)).toHaveCount(0)
    await expect(taskLink).toBeFocused()

    // Deputy opened from the shell sits above the record even though its opener is outside it.
    // After Deputy restores its focus, Escape still reaches the next registered layer: the record.
    await taskLink.click()
    await expect(recordPanel(page)).toBeVisible()
    await deputyButton(page).click()
    await expect(deputy(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(deputy(page)).toHaveCount(0)
    await expect(deputyButton(page)).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(recordPanel(page)).toHaveCount(0)
    await expect(taskLink).toBeFocused()

    await deputyButton(page).click()
    await expect.poll(() => page.evaluate(() => !!document.querySelector('[data-overlay-companion]')?.contains(document.activeElement))).toBe(true)
    await page.reload()
    await expect(deputy(page)).toBeVisible()
    await expect.poll(() => page.evaluate(() => !!document.querySelector('[data-overlay-companion]')?.contains(document.activeElement))).toBe(false)
  })

  test('phone: Deputy closes while its Task record stays mounted', async ({ page }, info) => {
    await page.setViewportSize(DESKTOP)
    await loginAs(page, DIRECTOR, DEMO_PASSWORD)
    await openFirstTaskRecord(page)
    await page.setViewportSize(PHONE)
    const taskRecord = page.getByRole('region', { name: 'Replace grinder burrs (Cafe 2)', exact: true })
    await expect(taskRecord).toBeVisible()

    await page.getByRole('button', { name: 'More actions', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Ask Deputy', exact: true }).click()
    await expect(deputy(page)).toHaveAttribute('aria-modal', 'true')
    await expect.poll(() => page.evaluate(() => !!document.querySelector('[data-overlay-companion]')?.contains(document.activeElement))).toBe(true)
    await page.screenshot({ path: info.outputPath('deputy-record-phone-390.png'), animations: 'disabled' })

    const composer = deputy(page).getByRole('textbox', { name: /ask the deputy/i })
    const send = deputy(page).getByRole('button', { name: 'Send', exact: true })
    await expect(composer).not.toHaveValue('')
    await expect(send).toBeEnabled()
    await composer.focus()
    await page.keyboard.press('Tab')
    await expect(send).toBeFocused()
    await page.keyboard.press('Tab')
    await expect.poll(() => page.evaluate(() => {
      const panel = document.querySelector('[data-overlay-companion]')
      return !!panel?.contains(document.activeElement) && document.activeElement !== document.body
    })).toBe(true)

    await page.keyboard.press('Escape')
    await expect(deputy(page)).toHaveCount(0)
    await expect(taskRecord).toBeVisible()
  })

  test('phone: a Work record opens as a full page with one Back; Deputy remains a modal', async ({ page }, info) => {
    await page.setViewportSize(PHONE)
    await loginAs(page, DIRECTOR, DEMO_PASSWORD)

    // A phone selection is a canonical page, not a full-screen Record Panel overlay.
    await page.goto('work/objectives')
    const row = page.locator('.catalog-collection__row-link').first()
    await expect(row).toBeVisible()
    const recordPath = new URL((await row.getAttribute('href'))!, page.url()).pathname
    const recordName = (await row.getAttribute('aria-label')) ?? ''
    await row.click()
    await expect(page).toHaveURL((url) => url.pathname === recordPath)
    await expect(page.getByRole('region', { name: recordName, exact: true })).toBeVisible()
    await expect(recordPanel(page)).toHaveCount(0)

    await page.getByRole('link', { name: 'Back to Objectives', exact: true }).click()
    await expect.poll(() => stripE2eBasePath(new URL(page.url()).pathname)).toBe('/work/objectives')
    await expect(page.locator('.catalog-collection__row-link').first()).toBeVisible()
    await expect(recordPanel(page)).toHaveCount(0)
    await rail(page).getByRole('link', { name: 'Home' }).click()
    await expect.poll(() => stripE2eBasePath(new URL(page.url()).pathname)).toBe('/')

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
    await expect.poll(() => page.evaluate(() => {
      const panel = document.querySelector('[data-overlay-companion]')
      return !!panel?.contains(document.activeElement)
    })).toBe(false)
    await page.screenshot({ path: info.outputPath('deputy-phone-reload-390.png'), animations: 'disabled' })
  })
})
