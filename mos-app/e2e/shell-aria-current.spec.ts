import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/login'
import { ADMIN } from './fixtures/users'
import { isShipGated } from './helpers/ship-gate'

async function pageCurrentCount(page: import('@playwright/test').Page) {
  return page.evaluate(() => document.querySelectorAll('[aria-current="page"]').length)
}

test.describe('shell aria-current', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN.email, ADMIN.password)
  })

  // AC-007 (exactly one aria-current="page" per route) is owned by proof-02-route-parity.spec.ts,
  // which walks every canonical route at desktop and phone width.

  test.describe('phone', () => {
    test.use({ viewport: { width: 390, height: 844 } })

    test('AC-008: on phone, primary destinations mark their tab and non-primary destinations mark More', async ({ page }) => {
      // The admin's fixed primaries are Home/Work/Inbox. Café is a MODULE tab promoted for a
      // café-affiliated viewer (admission: shell-navigation-parity.spec.ts) or, for anyone else,
      // while they stand on a Café page (covered at the end of this test).
      const primaryCases = [
        { path: '', label: 'Home' },
        { path: 'work/tasks', label: 'Work' },
        { path: 'inbox', label: 'Inbox' },
      ]
      // Scoped to the bottom-tab bar (nav "Primary"): the top-bar bell/breadcrumb also renders an
      // "Inbox" link (top-bar.tsx), so an unscoped getByRole('link', {name:'Inbox'}) is a strict-
      // mode violation with two matches — only the Primary nav's own tab is this assertion's target.
      const primaryNav = page.getByRole('navigation', { name: 'Primary' })
      for (const routeCase of primaryCases) {
        await page.goto(routeCase.path)
        await expect.poll(() => pageCurrentCount(page)).toBe(1)
        await expect(primaryNav.getByRole('link', { name: routeCase.label, exact: true })).toHaveAttribute('aria-current', 'page')
      }

      // breadcrumb.tsx Rule 5 (I7) / bottom-tab-bar.tsx (v4 shell rebuild, Task 3): "More is a
      // door, not a location" — it carries aria-haspopup/aria-expanded, never aria-current. A
      // non-primary destination's aria-current lands on the breadcrumb LEAF (the bold last crumb)
      // instead, since the bottom-tab-bar doesn't cover it. This supersedes the old "non-primary
      // destinations mark More" rule. The poll above already proves exactly one aria-current="page"
      // exists per route; here we additionally prove it's on the breadcrumb, not on More.
      // 'money' was here until issue 444 gated it — a gated path forwards to Home, which IS a
      // primary tab, so it can no longer stand for "a destination the bottom bar does not cover".
      const nonPrimaryCases = ['profile'].filter((path) => !isShipGated(`/${path}`))
      for (const path of nonPrimaryCases) {
        await page.goto(path)
        await expect.poll(() => pageCurrentCount(page)).toBe(1)
        await expect(page.getByRole('button', { name: 'More' })).not.toHaveAttribute('aria-current', 'page')
        await expect(
          page.getByRole('navigation', { name: 'Breadcrumb' }).locator('[aria-current="page"]'),
        ).toHaveCount(1)
      }

      // destinations.tsx phoneModuleForViewer: a viewer who works no module line still sees the
      // admitted module whose pages they are on as the bar's module tab, so that tab owns
      // aria-current and the breadcrumb leaf does not (breadcrumb.tsx leafCarriesCurrent).
      if (!isShipGated('/cafe/production')) {
        await page.goto('cafe/production')
        await expect.poll(() => pageCurrentCount(page)).toBe(1)
        await expect(primaryNav.getByRole('link', { name: 'Café', exact: true })).toHaveAttribute('aria-current', 'page')
        await expect(page.getByRole('button', { name: 'More' })).not.toHaveAttribute('aria-current', 'page')
        await expect(
          page.getByRole('navigation', { name: 'Breadcrumb' }).locator('[aria-current="page"]'),
        ).toHaveCount(0)
      }
    })


  })
})
