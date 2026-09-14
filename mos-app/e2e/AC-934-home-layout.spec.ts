/**
 * AC-934 (e2e, curated) — the Home layout preference survives the page boundary.
 *
 * Given a signed-in person on Home, when they change the Home layout in Personal Profile and
 * return to Home, Home renders the chosen arrangement and keeps it after a reload.
 */
import { test, expect, type Page } from '@playwright/test'
import { loginAs } from './helpers/login'
import { VIEWER } from './fixtures/users'

async function homeArrangement(page: Page): Promise<'focused' | 'overview' | 'list'> {
  const frame = page.locator('.home-frame')
  await expect(frame).toBeVisible()
  if (await frame.getByRole('tablist', { name: /home regions/i }).count()) return 'focused'
  if (await frame.locator('.home-layout .home-bento').count()) return 'overview'
  if (await frame.locator('.home-layout .stream-group').count()) return 'list'
  throw new Error('Home rendered no recognisable arrangement')
}

async function pickLayout(page: Page, name: string) {
  const radio = page.getByRole('radio', { name: new RegExp(`^${name}`) })
  await page.locator('label').filter({ has: radio }).click()
  await expect(radio).toBeChecked()
}

async function clearViewerLayout(page: Page) {
  await page.evaluate((personId) => {
    window.localStorage.removeItem(`gordi.home.layout.${personId}`)
  }, VIEWER.personId)
}

async function viewerLayoutInStorage(page: Page) {
  return page.evaluate((personId) => (
    window.localStorage.getItem(`gordi.home.layout.${personId}`)
  ), VIEWER.personId)
}

test.describe('AC-934: a person changes their Home layout and Home obeys', () => {
  test('AC-934: picking List in Personal Profile changes Home and survives a reload', async ({ page }) => {
    await loginAs(page, VIEWER.email, VIEWER.password)

    // Isolate only this demo person's preference so the journey proves the Focused default without
    // changing any other browser state the shell may use.
    await clearViewerLayout(page)
    await page.reload()
    await expect(page.locator('.home-frame')).toBeVisible()
    expect(await homeArrangement(page)).toBe('focused')

    await page.getByRole('button', { name: /Cahya Cafe/i }).click()
    await page.getByRole('menuitem', { name: /personal profile/i }).click()
    await page.waitForURL(/\/profile$/)
    await pickLayout(page, 'List')
    expect(await viewerLayoutInStorage(page)).toBe('list')

    await page.getByRole('link', { name: 'Home', exact: true }).first().click()
    await page.waitForURL((url) => url.pathname.replace(/\/$/, '').endsWith('/mos'))

    expect(await homeArrangement(page)).toBe('list')
    await expect(page.getByRole('region', { name: 'Needs you now' })).toBeVisible()
    await expect(page.locator('.home-frame').getByRole('tablist')).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Signals' })).toBeVisible()

    await page.reload()
    expect(await homeArrangement(page)).toBe('list')

    // Restore the shared demo persona's default for the rest of the e2e matrix.
    await page.getByRole('button', { name: /Cahya Cafe/i }).click()
    await page.getByRole('menuitem', { name: /personal profile/i }).click()
    await page.waitForURL(/\/profile$/)
    await pickLayout(page, 'Focused')
  })
})
