import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/login'
import { ADMIN } from './fixtures/users'
import { isShipGated } from './helpers/ship-gate'
import { stubAccountLocale } from './helpers/account-locale'

// Label -> the path behind it, so the assertions below ask the gate rather than re-listing it.
const GATED_BY_LABEL: Record<string, string> = {
  Events: '/work/events',
  Ecommerce: '/ecommerce',
  Roastery: '/roastery',
}

test.describe('shell phone nav', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('AC-021 (OD-68): an org-wide admin sees Home, Work, More — NO module tab (café is not their work); More reaches the other destinations; Inbox is the bell', async ({ page }) => {
    await loginAs(page, ADMIN.email, ADMIN.password)

    const nav = page.getByRole('navigation', { name: 'Primary' })
    await expect(nav).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Home' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Work' })).toBeVisible()
    await expect(nav.getByRole('button', { name: 'More' })).toBeVisible()
    // Inbox is the top-bar bell and a More destination, not a tab.
    await expect(nav.getByRole('link', { name: 'Inbox' })).toHaveCount(0)
    // OD-68: an org-wide role gets no promoted module tab — Café is absent from the bottom nav.
    await expect(nav.getByRole('link', { name: 'Café' })).not.toBeVisible()

    await expect(page.getByRole('banner').getByRole('link', { name: /^Inbox/ })).toBeVisible()

    await nav.getByRole('button', { name: 'More' }).click()
    const more = page.getByRole('dialog', { name: 'More' })
    // OD-WAY-51 supersedes OD-68's "modules are hidden from an org-wide admin's More" rule:
    // the drawer lists every module the ROUTE admits, regardless of promotion. What ships on day
    // one is Cafe (issue 444 gates Ecommerce and Roastery as post-MVP).
    // Inbox is the top-bar bell on a phone too, never a More row.
    await expect(more.getByRole('link', { name: 'Inbox', exact: true })).toHaveCount(0)
    await expect(more.getByRole('link', { name: 'Admin settings', exact: true })).toBeVisible()
    // Events, Ecommerce and Roastery remain ship-gated for everyone.
    for (const [label, path] of Object.entries(GATED_BY_LABEL)) {
      if (!isShipGated(path)) continue
      await expect(more.getByRole('link', { name: label, exact: true })).toHaveCount(0)
    }
    // Without the revenue-view role the admin reaches Money only through the budget/pricing pages,
    // which exist only when that flag is on.
    await expect(more.getByRole('link', { name: 'Money', exact: true })).toHaveCount(process.env.VITE_SHOW_PLAN_BUDGET === 'true' ? 1 : 0)
    // Personal profile opens from the account menu at the foot of More.
    await more.getByRole('button', { name: new RegExp(ADMIN.displayName, 'i') }).and(page.locator('[aria-haspopup="menu"]')).click()
    await page.getByRole('menuitem', { name: 'Personal profile', exact: true }).click()
    await expect(page).toHaveURL(/\/profile$/)
    await expect(page.getByRole('heading', { name: 'Personal profile', exact: true })).toBeVisible()
    await expect(more).toBeHidden()

    // Home owns its own phone action bar; Inbox leaves the shared quick-action launcher available.
    await page.goto('inbox')
    await page.getByRole('button', { name: 'Actions', exact: true }).click()
    const launcher = page.getByRole('dialog', { name: 'Command menu' })
    await expect(launcher.getByRole('option', { name: 'Create task', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
  })
  // Café tab for a café-affiliated viewer and Money absence from the bar and More, per persona:
  // owned by shell-navigation-parity.spec.ts (R1).
})

// One actor: the Café member has the fullest bar (Home, Work, Café, More) in Indonesian.
for (const actor of [
  { label: 'member', email: 'e2e.bar.member@example.test', password: 'e2e-password-123' },
]) {
  test(`R1 Indonesian ${actor.label}: the phone tabs are named in Indonesian and fit at 390`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await loginAs(page, actor.email, actor.password)
    await stubAccountLocale(page, 'id')
    await page.reload()
    const nav = page.getByRole('navigation', { name: 'Utama' })
    await expect(nav.getByRole('link')).toHaveText(['Beranda', 'Kerja', 'Café'])
    await expect(nav.getByRole('button', { name: 'Lainnya' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  })
}
