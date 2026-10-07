import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/login'
import { ADMIN } from './fixtures/users'
import { isShipGated } from './helpers/ship-gate'
import { stubAccountLocale } from './helpers/account-locale'

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
    // Personal Profile is an identity action in the UserChip row, not a destination row in the
    // drawer. Open the signed-in identity menu before asserting its link.
    await more.getByRole('button', { name: 'E2E Admin' }).click()
    await expect(more.getByRole('menuitem', { name: 'Personal Profile' })).toBeVisible()
    // issue 444 — Events, Money, Ecommerce and Roastery were each asserted VISIBLE here. All four
    // are ship-gated, and the gate is above roles, so the viewer holding every role gets no link
    // to any of them on the one nav surface a phone has.
    for (const [label, path] of Object.entries(GATED_BY_LABEL)) {
      if (!isShipGated(path)) continue
      await expect(more.getByRole('link', { name: label, exact: true })).toHaveCount(0)
    }
    await more.getByRole('menuitem', { name: 'Personal Profile' }).click()
    await expect(page).toHaveURL(/\/profile$/)
    await expect(page.getByRole('heading', { name: 'Personal Profile', exact: true })).toBeVisible()
    await expect(more).toBeHidden()
  })
  // Café tab for a café-affiliated viewer and Money absence from the bar and More, per persona:
  // owned by shell-navigation-parity.spec.ts (R1).
})

// One actor: the Café member has the full five-tab bar, the tightest fit for Indonesian labels.
for (const actor of [
  { label: 'member', email: 'e2e.bar.member@example.test', password: 'e2e-password-123', cafe: true },
]) {
  test(`R1 Indonesian ${actor.label}: Inbox and one-line phone tabs at 390`, async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await loginAs(page, actor.email, actor.password)
    await stubAccountLocale(page, 'id')
    await page.reload()
    const nav = page.getByRole('navigation', { name: 'Primary' })
    await expect(nav.locator('.bottom-tab-label')).toHaveCount(actor.cafe ? 5 : 4)
    await expect(nav.locator('.bottom-tab-label').filter({ hasText: /^Inbox$/ })).toHaveCount(1)
    for (const label of await nav.locator('.bottom-tab-label').all()) {
      const geometry = await label.evaluate(el => ({ height: el.getBoundingClientRect().height, line: parseFloat(getComputedStyle(el).lineHeight), width: el.clientWidth, scroll: el.scrollWidth, font: parseFloat(getComputedStyle(el).fontSize) }))
      expect(geometry.height).toBeLessThanOrEqual(geometry.line + 1)
      expect(geometry.scroll).toBeLessThanOrEqual(geometry.width)
      expect(geometry.font).toBe(11)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    await page.screenshot({ path: info.outputPath('id-phone-tabs.png'), animations: 'disabled' })
  })
}
