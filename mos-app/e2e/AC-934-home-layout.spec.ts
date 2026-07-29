/**
 * AC-934 (e2e, curated) — the Home layout preference, end to end.
 *
 * "Given a signed-in person on Home, when they change the Home layout in /profile and return to
 *  Home, then Home renders in the newly chosen layout."
 *
 * This is the ONE journey in this slice that no lower layer can prove: the setting lives on one
 * page, the arrangement renders on another, and the thing carrying the choice between them is real
 * browser storage. A unit test can assert each end; only this can assert that a person walking from
 * Home → Personal Profile → back to Home gets what they picked — and still has it after a reload,
 * which is the difference between "a preference" and "a toggle that forgets" (FR-921/924, NFR-922).
 */
import { test, expect, type Page } from '@playwright/test'
import { loginAs } from './helpers/login'
import { VIEWER } from './fixtures/users'

/** The arrangement Home is currently in, read the way the viewer reads it — by its shape. */
async function homeArrangement(page: Page): Promise<'focused' | 'overview' | 'list'> {
  const frame = page.locator('.home-frame')
  await expect(frame).toBeVisible()
  if (await frame.getByRole('tablist', { name: /home regions/i }).count()) return 'focused'
  if (await frame.locator('.home-layout > .home-bento').count()) return 'overview'
  if (await frame.locator('.home-layout > .stream-group').count()) return 'list'
  throw new Error('Home rendered no recognisable arrangement')
}

/** Pick an arrangement the way a person does: the radio itself is visually hidden behind a
 *  wireframe-thumbnail card, so the thing they click is the option's LABEL. The oracle stays the
 *  accessible one — the radio ends up checked. */
async function pickLayout(page: Page, name: string) {
  const radio = page.getByRole('radio', { name: new RegExp(`^${name}`) })
  await page.locator('label').filter({ has: radio }).click()
  await expect(radio).toBeChecked()
}

test.describe('AC-934: a person changes their Home layout and Home obeys', () => {
  test('AC-934: picking List in Personal Profile changes Home — and the choice survives a reload', async ({ page }) => {
    await loginAs(page, VIEWER.email, VIEWER.password)

    // Given: a signed-in person on Home, in the Focused default (FR-922).
    await expect(page.locator('.home-frame')).toBeVisible()
    expect(await homeArrangement(page)).toBe('focused')

    // When: they walk to their Personal Profile the way the app offers it (the rail), and pick a
    // different arrangement. No direct URL — the journey includes finding the setting.
    await page.getByRole('link', { name: /personal profile/i }).click()
    await page.waitForURL(/\/profile$/)
    await pickLayout(page, 'List')

    // …and return to Home.
    await page.getByRole('link', { name: 'Home', exact: true }).first().click()
    await page.waitForURL((url) => url.pathname.replace(/\/$/, '').endsWith('/mos'))

    // Then: Home renders in the newly chosen layout — one continuous list of named regions,
    // no tab strip, and the Signals feed still standing beside it (FR-928).
    expect(await homeArrangement(page)).toBe('list')
    await expect(page.getByRole('region', { name: 'Needs you now' })).toBeVisible()
    await expect(page.locator('.home-frame').getByRole('tablist')).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Signals' })).toBeVisible()

    // …and it is a PREFERENCE, not a session toggle: a reload finds it still there.
    await page.reload()
    expect(await homeArrangement(page)).toBe('list')

    // Restore the persona's default so this spec leaves no state for the next one.
    await page.getByRole('link', { name: /personal profile/i }).click()
    await page.waitForURL(/\/profile$/)
    await pickLayout(page, 'Focused')
  })
})
