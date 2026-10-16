// Shell overlay lifecycle across destinations, and Deputy placement after those transitions.
// Every journey is read-only: it opens, closes and navigates, and never edits a record.
import { test, expect, type Locator, type Page } from '@playwright/test'
import { loginAs } from './helpers/login'
import { DEMO_PASSWORD } from '../src/pages/demo-personas'
import { stripE2eBasePath } from './helpers/app-path'

const DIRECTOR = 'dewi.dev@example.test'
// A record opens beside its list only on a wide content track.
const DESKTOP = { width: 1920, height: 1080 }
const PHONE = { width: 390, height: 844 }

const recordPanel = (page: Page) => page.locator('[data-overlay-host]')
const deputy = (page: Page) => page.locator('[data-overlay-companion]')
const deputyButton = (page: Page) => page.getByRole('button', { name: 'Open deputy', exact: true })
// The sidebar, or the rail beside its Work pages panel, whichever the viewer's modules give.
const rail = (page: Page) => page.locator('nav:not([aria-label="Breadcrumb"])')

/** One navigation entry from wherever the viewer stands, through the command palette's Go to list. */
async function goToViaPalette(page: Page, destination: string) {
  await page.getByRole('button', { name: /^Search/ }).click()
  const palette = page.getByRole('dialog', { name: 'Command menu', exact: true })
  await palette.getByRole('combobox').fill(destination)
  await palette.getByRole('group', { name: 'Go to', exact: true }).getByRole('option', { name: new RegExp(`^${destination}`) }).first().click()
}

async function openFirstRecord(page: Page, collection: 'objectives' | 'projects'): Promise<{ id: string; name: string }> {
  await page.goto(`work/${collection}`)
  const row = page.locator(`main a[href*="/work/${collection}/"]`).first()
  await expect(row).toBeVisible()
  const href = (await row.getAttribute('href')) ?? ''
  const id = href.split('/').pop() ?? ''
  const name = (await row.getAttribute('aria-label')) ?? ((await row.innerText()).split('\n')[0] ?? '').trim()
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
  const taskLink = page.getByRole('row').filter({ has: page.locator('a[href*="/work/tasks/"]') }).first().getByRole('link').first()
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

test.describe('shell overlay transitions', () => {
  test('Back restores only the record its URL names; Close returns focus to the row', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await loginAs(page, DIRECTOR, DEMO_PASSWORD)

    const { id, name: objectiveName } = await openFirstRecord(page, 'objectives')
    await rail(page).getByRole('link', { name: 'Projects & Processes', exact: true }).click()
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
    await expect(page.locator(`main a[href$="/${id}"]`).first()).toBeFocused()

    // A second rail trip after the close must not resurrect anything either.
    await rail(page).getByRole('link', { name: 'Projects & Processes', exact: true }).click()
    await expectNoStaleRecord(page, 'Projects & Processes', objectiveName)
  })

  test('a record left behind stays gone through a tour of other destinations', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await loginAs(page, DIRECTOR, DEMO_PASSWORD)

    const { name: objectiveName } = await openFirstRecord(page, 'objectives')
    for (const name of [/^Signals/, /^Tasks/, /^Home$/, /^Café$/]) {
      await rail(page).getByRole('link', { name }).first().click()
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
      await expect(recordPanel(page)).toHaveCount(0)
    }
    await rail(page).getByRole('link', { name: 'Work', exact: true }).first().click()
    await rail(page).getByRole('link', { name: 'Objectives', exact: true }).click()
    await expect(page).toHaveURL(collectionUrl('objectives'))
    await expectNoStaleRecord(page, 'Objectives', objectiveName)
  })

  test('a Task panel is not restored on return unless its URL names it', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await loginAs(page, DIRECTOR, DEMO_PASSWORD)

    await page.goto('work/tasks')
    await page.getByRole('row').filter({ has: page.locator('a[href*="/work/tasks/"]') }).first().getByRole('link').first().click()
    await expect(page).toHaveURL(/record=/)
    await expect(recordPanel(page)).toBeVisible()
    await rail(page).getByRole('link', { name: /^Signals/ }).first().click()
    await expect(recordPanel(page)).toHaveCount(0)
    await rail(page).getByRole('link', { name: /^Tasks/ }).first().click()
    await expect(page).toHaveURL(collectionUrl('tasks'))
    await expect(page.getByRole('row').filter({ has: page.locator('a[href*="/work/tasks/"]') }).first()).toBeVisible()
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

    await goToViaPalette(page, 'Tasks')
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

  test('Deputy opens after leaving a record for Home, and after reload', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await loginAs(page, DIRECTOR, DEMO_PASSWORD)

    await openFirstRecord(page, 'objectives')
    await rail(page).getByRole('link', { name: 'Home', exact: true }).click()
    await expect(recordPanel(page)).toHaveCount(0)

    await deputyButton(page).click()
    await expect(deputy(page)).toBeVisible()
    await expect(deputy(page)).toHaveClass(/overlay-companion-host--standalone/)

    await page.reload()
    await expect(deputy(page)).toBeVisible()
    await expect(recordPanel(page)).toHaveCount(0)

    await expect.poll(() => page.evaluate(() => {
      const panel = document.querySelector('[data-overlay-companion]')
      return !!panel?.contains(document.activeElement)
    })).toBe(false)

    await deputy(page).focus()
    await page.keyboard.press('Escape')
    await expect(deputy(page)).toHaveCount(0)
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

  test('phone: Deputy closes while its Task record stays mounted', async ({ page }) => {
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

  // A phone Work record opening as a page with one Back is owned by work-record-opening.spec.ts.
  test('phone: Deputy remains a modal and reloads with focus outside it', async ({ page }) => {
    await page.setViewportSize(PHONE)
    await loginAs(page, DIRECTOR, DEMO_PASSWORD)
    await page.goto('')
    await expect.poll(() => stripE2eBasePath(new URL(page.url()).pathname)).toBe('/')

    await deputyButton(page).click()
    await expect(deputy(page)).toBeVisible()
    await expect(deputy(page)).toHaveAttribute('aria-modal', 'true')
    await expect(deputy(page)).not.toHaveClass(/with-record|over-record/)
    expect(await deputy(page).evaluate((el) => el.contains(document.activeElement))).toBe(true)

    await page.keyboard.press('Escape')
    await expect(deputy(page)).toHaveCount(0)
    await expect(deputyButton(page)).toBeFocused()

    await deputyButton(page).click()
    await page.reload()
    await expect(deputy(page)).toBeVisible()
    await expect(deputy(page)).toHaveAttribute('aria-modal', 'true')
    await expect.poll(() => page.evaluate(() => {
      const panel = document.querySelector('[data-overlay-companion]')
      return !!panel?.contains(document.activeElement)
    })).toBe(false)
  })
})
