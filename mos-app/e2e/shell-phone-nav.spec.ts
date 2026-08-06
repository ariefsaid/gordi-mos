import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/login'
import { ADMIN, VIEWER } from './fixtures/users'

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
    await expect(more.getByRole('link', { name: 'Events' })).toBeVisible()
    await expect(more.getByRole('link', { name: 'Money' })).toBeVisible()
    // OD-WAY-51 supersedes OD-68's "modules are hidden from an org-wide admin's More" rule.
    // mobile-drawer.tsx Zone 2 now lists every viewer-scoped module regardless of promotion, and
    // bottom-tab-bar.tsx's own comment documents the reversal directly: "The line here used to say
    // 'module routes stay reachable via ⌘K / direct URL'. That was false ... It is deleted rather
    // than replaced — under OD-WAY-51 no justification is needed, because nothing is being
    // hidden." Navigation now mirrors what the route admits: Ecommerce/Roastery are live in More.
    await expect(more.getByRole('link', { name: 'Ecommerce' })).toBeVisible()
    await expect(more.getByRole('link', { name: 'Roastery' })).toBeVisible()
    await expect(more.getByRole('link', { name: 'Admin Settings' })).toBeVisible()
    await expect(more.getByRole('link', { name: 'Personal Profile' })).toBeVisible()
  })

  test('AC-021b (OD-68): a café-affiliated viewer GETS the Café tab (their work is promoted)', async ({ page }) => {
    await loginAs(page, VIEWER.email, VIEWER.password) // Cahya — Cafe Ops Lead
    const nav = page.getByRole('navigation', { name: 'Primary' })
    await expect(nav.getByRole('link', { name: 'Café' })).toBeVisible()
  })

  test('AC-022: non-finance/admin viewers never see Money in the phone nav or More menu', async ({ page }) => {
    await loginAs(page, VIEWER.email, VIEWER.password)

    const nav = page.getByRole('navigation', { name: 'Primary' })
    await expect(nav.getByRole('link', { name: 'Money' })).toHaveCount(0)

    await nav.getByRole('button', { name: 'More' }).click()
    const more = page.getByRole('dialog', { name: 'More' })
    await expect(more.getByRole('link', { name: 'Money' })).toHaveCount(0)
  })
})
