// A Signal record is reachable by its URL: a pasted collection link with ?record=<id> and the
// panel's "Open full page" both land on, and stay on, the canonical full page. Read-only journeys.
import { test, expect, type Page } from '@playwright/test'
import { loginAs } from './helpers/login'
import { DEMO_PASSWORD } from '../src/pages/demo-personas'

const DIRECTOR = 'dewi.dev@example.test'
const recordPage = (id: string) => new RegExp(`/work/signals/${id}(\\?[^#]*)?$`)
const collection = /\/work\/signals(\?(?!.*record=)[^#]*)?$/

async function firstSignal(page: Page): Promise<string> {
  await page.goto('work/signals?layout=feed')
  const row = page.locator('main [data-signal-id][role="button"]').first()
  await expect(row).toBeVisible()
  return (await row.getAttribute('data-signal-id'))!
}

/** The canonical page shows the record and keeps showing it once every navigation has settled. */
async function expectFullPageStays(page: Page, id: string) {
  await expect(page).toHaveURL(recordPage(id))
  await expect(page.locator('[data-signal-region="facts"]')).toBeVisible()
  await page.waitForTimeout(1500)
  await expect(page).toHaveURL(recordPage(id))
  await expect(page.locator('[data-signal-region="facts"]')).toBeVisible()
  await expect(page.locator('[data-overlay-host]')).toHaveCount(0)
}

for (const width of [1440, 390]) {
  test.describe(`Signal record URLs at ${width}px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
      await loginAs(page, DIRECTOR, DEMO_PASSWORD)
    })

    test('a pasted collection link naming a record opens that record on its full page', async ({ page }, info) => {
      const id = await firstSignal(page)
      await page.goto(`work/signals?layout=feed&record=${id}`)
      await expectFullPageStays(page, id)
      await page.screenshot({ path: info.outputPath(`signal-direct-url-${width}.png`), animations: 'disabled' })
    })

    test('Open full page from the panel stays on the full page, and Back returns to the collection', async ({ page }, info) => {
      const id = await firstSignal(page)
      await page.locator(`main [data-signal-id="${id}"][role="button"]`).click()
      const panel = page.locator('[data-overlay-host][data-overlay-owner="signals"]')
      await expect(panel).toBeVisible()
      await panel.getByRole('button', { name: 'More Signal actions', exact: true }).click()
      await page.getByRole('menuitem', { name: 'Open full page', exact: true }).click()
      await expectFullPageStays(page, id)
      await page.screenshot({ path: info.outputPath(`signal-open-full-page-${width}.png`), animations: 'disabled' })

      await page.goBack()
      await expect(page).toHaveURL(collection)
      await expect(page.locator('main [data-signal-id][role="button"]').first()).toBeVisible()
      await expect(page.locator('[data-overlay-host]')).toHaveCount(0)
    })

    if (width === 1440) {
      test('the panel chrome Open full page button also stays on the full page', async ({ page }) => {
        const id = await firstSignal(page)
        await page.locator(`main [data-signal-id="${id}"][role="button"]`).click()
        const panel = page.locator('[data-overlay-host][data-overlay-owner="signals"]')
        await expect(panel).toBeVisible()
        await panel.locator('.record-panel-chrome').getByRole('button', { name: 'Open full page', exact: true }).click()
        await expectFullPageStays(page, id)
        await page.goBack()
        await expect(page).toHaveURL(collection)
      })
    }
  })
}
