// AC-410 (nav-five-destinations, e2e): the five-destination phone shell. A finance/admin viewer
// sees five bottom tabs (Home/Work/Operate/Plan/Inbox) with no Catalog; a member (no finance/admin)
// sees four — Plan is hidden (no dead-end, FR-410). Active destination carries aria-current=page.
//
// Encodes the user's real journey + asserts the goal (the IA regroup is visible + role-correct on
// phone). The app conforms to this test. Fixtures are seeded by global-setup (e2e/fixtures/users).
import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/login'
import { VIEWER, ADMIN } from './fixtures/users'

// PARKED by the app-shell chrome port (#188), with a reason and a successor — not silently left
// red. The five-destination IA this journey encodes (Home/Work/Operate/Plan/Inbox, five bottom
// tabs) was RETIRED by the ported chrome: the phone bottom bar is now Home · Work · the viewer's
// own module · Inbox · More, so an admin sees three links and a More disclosure, not five links.
//
// It is parked rather than rewritten here because the rewrite cannot be honest yet. The ported
// destinations point at /work/tasks, /cafe and /inbox, and the route table that makes those
// resolve is the NEXT ticket (#189). A journey authored against routes that 404 would be red for
// a reason that has nothing to do with what it asserts. Its successor — together with AC-022's
// 390px shell walk — belongs in the PR that lands the routes.
//
// e2e does not gate a PR onto `dev` (integration.yml runs verify + the pgTAP fast lane there, no
// browser), so this is parked debt with an owner, not a hidden gate failure.
test.describe.fixme('AC-410: five-destination phone shell', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('admin sees five tabs (Home/Work/Operate/Plan/Inbox); no Catalog group', async ({ page }) => {
    await loginAs(page, ADMIN.email, ADMIN.password)

    // MobileDrawer is null when closed, so the bottom-tab bar is the sole Primary nav.
    const nav = page.getByRole('navigation', { name: 'Primary' })
    await expect(nav).toBeVisible()
    await expect(nav.getByRole('link')).toHaveCount(5)
    for (const name of [/Home/, /Work/, /Operate/, /Plan/, /Inbox/]) {
      await expect(nav.getByRole('link', { name })).toBeVisible()
    }
  })

  test('member (no finance/admin) sees four tabs — Plan is hidden (no dead-end, FR-410)', async ({ page }) => {
    // VIEWER (Cahya) holds Cafe Ops Lead + Sales Lead — NOT finance/admin → Plan is gated off.
    await loginAs(page, VIEWER.email, VIEWER.password)

    const nav = page.getByRole('navigation', { name: 'Primary' })
    await expect(nav).toBeVisible()
    await expect(nav.getByRole('link')).toHaveCount(4)
    await expect(nav.getByRole('link', { name: /Plan/ })).toHaveCount(0)
    // Home/Work/Operate/Inbox remain reachable.
    await expect(nav.getByRole('link', { name: /Home/ })).toBeVisible()
    await expect(nav.getByRole('link', { name: /Inbox/ })).toBeVisible()
  })

  test('the active destination tab carries aria-current=page', async ({ page }) => {
    await loginAs(page, ADMIN.email, ADMIN.password)
    const nav = page.getByRole('navigation', { name: 'Primary' })

    await nav.getByRole('link', { name: /Work/ }).click()
    await expect(page).toHaveURL(/\/tasks$/)
    await expect(nav.getByRole('link', { name: /Work/ })).toHaveAttribute('aria-current', 'page')
  })
})
