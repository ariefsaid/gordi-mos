import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/login'
import { ADMIN, VIEWER } from './fixtures/users'
import { isShipGated } from './helpers/ship-gate'

// Label -> the path behind it, so the assertions below ask the gate rather than re-listing it.
const GATED_BY_LABEL: Record<string, string> = {
  Events: '/work/events',
  Money: '/money',
  Ecommerce: '/ecommerce',
  Roastery: '/roastery',
}

test.describe('shell phone nav', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('AC-021 (OD-68): an org-wide admin sees Home, Work, Inbox, More — NO module tab (café is not their work); More reaches non-primary destinations', async ({ page }) => {
    await loginAs(page, ADMIN.email, ADMIN.password)

    const nav = page.getByRole('navigation', { name: 'Primary' })
    await expect(nav).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Home' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Work' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Inbox' })).toBeVisible()
    await expect(nav.getByRole('button', { name: 'More' })).toBeVisible()
    // OD-68: an org-wide role gets no promoted module tab — Café is absent from the bottom nav.
    await expect(nav.getByRole('link', { name: 'Café' })).not.toBeVisible()

    await nav.getByRole('button', { name: 'More' }).click()
    const more = page.getByRole('dialog', { name: 'More' })
    // OD-WAY-51 supersedes OD-68's "modules are hidden from an org-wide admin's More" rule:
    // mobile-drawer.tsx Zone 2 lists every module the ROUTE admits, regardless of promotion. What
    // ships on day one is Cafe (issue 444 gates Ecommerce and Roastery as post-MVP).
    await expect(more.getByRole('link', { name: 'Admin Settings' })).toBeVisible()
    await expect(more.getByRole('link', { name: 'Personal Profile' })).toBeVisible()
    // issue 444 — Events, Money, Ecommerce and Roastery were each asserted VISIBLE here. All four
    // are ship-gated, and the gate is above roles, so the viewer holding every role gets no link
    // to any of them on the one nav surface a phone has.
    for (const [label, path] of Object.entries(GATED_BY_LABEL)) {
      if (!isShipGated(path)) continue
      await expect(more.getByRole('link', { name: label, exact: true })).toHaveCount(0)
    }
  })

  test('AC-021b (OD-68): a café-affiliated viewer GETS the Café tab (their work is promoted)', async ({ page }) => {
    await loginAs(page, VIEWER.email, VIEWER.password) // Cahya — Cafe Ops Lead
    const nav = page.getByRole('navigation', { name: 'Primary' })
    await expect(nav.getByRole('link', { name: 'Café' })).toBeVisible()
  })

  // issue 444 widened this from "non-finance/admin" to EVERY viewer — see the admin case above,
  // which now covers the same ground for the role that used to see Money. Kept for the phone-bar
  // half of the claim, which the admin case does not make.
  test('AC-022: viewers never see Money in the phone nav or More menu', async ({ page }) => {
    await loginAs(page, VIEWER.email, VIEWER.password)

    const nav = page.getByRole('navigation', { name: 'Primary' })
    await expect(nav.getByRole('link', { name: 'Money' })).toHaveCount(0)

    await nav.getByRole('button', { name: 'More' }).click()
    const more = page.getByRole('dialog', { name: 'More' })
    await expect(more.getByRole('link', { name: 'Money' })).toHaveCount(0)
  })
})
