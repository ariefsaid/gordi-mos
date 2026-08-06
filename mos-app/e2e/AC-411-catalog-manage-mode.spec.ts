// AC-411 (nav-five-destinations, e2e): the catalog is Work's manage-mode. An admin navigates
// Work → Objectives and lands on /work/objectives with the down-trace (child work_lines + task
// counts) visible; a direct visit to the retired /objectives redirects to the relocated route.
// FR-420/421/422/423.
//
// The cascade hop this journey used to make is gone — the cascade is vocabulary, never a route
// (CONTEXT.md; OD-WAY-32, #179), so manage-mode is reached from its own capability-gated rail item.
//
// Encodes the user's real journey + asserts the goal (manage is reachable in-place, with trace).
// The app conforms to this test. Fixtures seeded by global-setup.
import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/login'
import { ADMIN } from './fixtures/users'

test.describe('AC-411: catalog is Work\'s manage-mode', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('admin: Work → Objectives → /work/objectives with down-trace', async ({ page }) => {
    await loginAs(page, ADMIN.email, ADMIN.password)

    // Work → Objectives (phone opens the drawer for secondary nav). The link is no longer
    // capability-gated: OD-V4-1 opened the READ to every authenticated viewer (#188 rail, #189
    // route). ADMIN is used here for the down-trace fixtures, not for admission.
    //
    // STALE: the v4 shell has no header hamburger. Task 1 (top-bar.test.tsx, "v4 shell Task 1: no
    // header hamburger") made the bottom-tab bar's "More" button (aria-label t('nav.more'),
    // bottom-tab-bar.tsx) the drawer's SOLE opener — "Open navigation" does not exist on any
    // viewport. The drawer it opens is still `role="dialog"` (mobile-drawer.tsx), so only the
    // opener locator changes.
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: /more/i }).click()
    await page.getByRole('dialog').getByRole('link', { name: 'Objectives' }).click()
    await expect(page).toHaveURL(/\/work\/objectives$/)
    await expect(page.getByRole('heading', { name: 'Objectives', level: 1 })).toBeVisible()

    // Down-trace (FR-422): assert the trace CONTENT, not just presence — the seeded objective's
    // trace must show a real task count (e.g. "3 tasks · <work_line>"), proving the derived up/down
    // link actually resolved, not an empty element.
    const trace = page.getByTestId('catalog-trace').first()
    await expect(trace).toBeVisible({ timeout: 10_000 })
    await expect(trace).toHaveText(/\d+\s+task/i)
  })

  test('a direct visit to the retired /objectives redirects to the relocated catalog', async ({ page }) => {
    await loginAs(page, ADMIN.email, ADMIN.password)

    await page.goto('objectives')
    await expect(page).toHaveURL(/\/work\/objectives$/)
    await expect(page.getByRole('heading', { name: 'Objectives', level: 1 })).toBeVisible()
  })
})
