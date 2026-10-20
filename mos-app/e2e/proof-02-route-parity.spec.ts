import { test, expect, type Page } from '@playwright/test'
import { ADMIN, MANAGER, VIEWER } from './fixtures/users'
import { loginAs } from './helpers/login'
import { TAP_FLOOR } from './helpers/tap-floor'
import { chooseSelectOption } from './helpers/select'
import { stripE2eBasePath } from './helpers/app-path'
import { isShipGated } from './helpers/ship-gate'
import { ROUTE_PARITY_CATALOG, type RouteParityId } from '../src/shell/route-parity'

// This catalog is the production route manifest's parity policy. The route census compares it
// with the live router, while this browser proof checks the rendered ownership at every width.
const ROUTE_CATALOG = ROUTE_PARITY_CATALOG

const VISIBLE_ROOT_ROUTES = ROUTE_CATALOG.filter((route) => route.kind === 'visible-root').map((route) => route.path)
const ADMIN_VISIBLE_ROOT_ROUTES = VISIBLE_ROOT_ROUTES.filter((route) => route !== '/money')
const CANONICAL_ROUTES = ROUTE_CATALOG.map((route) => route.path)
const FINANCE = { email: 'fitri.dev@example.test', password: VIEWER.password }

// The section each Admin settings route owns. The phone section switcher and the sidebar's Admin
// pages both mark the place, so these routes are checked by their section instead of the
// single-aria-current count.
const ADMIN_SETTINGS_TABS: Record<string, string> = {
  '/admin/people': 'People',
  '/admin/teams': 'Teams',
  '/admin/access': 'Access levels',
  '/admin/modules': 'Modules',
  '/admin/agents': 'Agent apps',
}

function routePath(id: RouteParityId): string {
  const entry = ROUTE_CATALOG.find((route) => route.id === id)
  if (!entry) throw new Error(`Missing route parity entry: ${id}`)
  return entry.path
}

const CROSS_SECTION_RETURNS = [
  { name: 'Home → Signals → Home', route: routePath('workSignals') },
  { name: 'Home → Café → Home', route: routePath('cafe') },
  { name: 'Home → Inbox → Home', route: routePath('inbox') },
] as const

// CafePageFrame owns the title on every Café route; cafe-page-frame.css hides its breadcrumb leaf.

function normalizeHref(href: string): string {
  const url = new URL(href)
  return `${stripE2eBasePath(url.pathname)}${url.search}`
}

// The areas the viewer can open from the always-present navigation. Work's four collections sit
// behind the Work area (the Work page lists them), so Work stands for them here.
async function visibleSurfaceHrefs(page: Page): Promise<Set<string>> {
  const width = page.viewportSize()?.width ?? 1440
  const hrefsOf = (selector: string) => page.locator(selector).evaluateAll((links) =>
    links.map((link) => (link as HTMLAnchorElement).href),
  )
  let hrefs: string[]
  if (width >= 920) {
    hrefs = await hrefsOf('nav[aria-label="Primary"] a[href]:not(.nav-item--child)')
  } else {
    const bottom = await hrefsOf('nav[aria-label="Primary"] a[href]')
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'More' }).click()
    const drawerHrefs = await hrefsOf('[role="dialog"][aria-label="More"] a[href]:not(.nav-item--child)')
    await page.keyboard.press('Escape')
    hrefs = [...bottom, ...drawerHrefs]
  }
  return new Set(hrefs.map(normalizeHref).map((href) => (href === '/work/tasks' ? '/work' : href)))
}

// The routes the navigation must expose for the admin: every visible root, with the Work
// collections folded into Work. Inbox is the top-bar bell and Personal profile sits in the account
// menu, so neither is a navigation row. The admin reaches Money only through budget/pricing when that flag is on.
function expectedAreaHrefs(width: number): string[] {
  const areas = new Set(ADMIN_VISIBLE_ROOT_ROUTES.map((route) => (route.startsWith('/work/') ? '/work' : route)))
  areas.delete('/inbox')
  // The desktop rail opens Admin from a flyout button, not a link.
  if (width >= 920) areas.delete('/admin/people')
  if (process.env.VITE_SHOW_PLAN_BUDGET === 'true') areas.add('/money/budget')
  return [...areas].sort()
}

async function assertCanonicalSurface(page: Page, route: string) {
  await page.goto(route === '/' ? '' : route.slice(1))
  await expect.poll(() => {
    const url = new URL(page.url())
    return stripE2eBasePath(url.pathname)
  }).toBe(route)
  const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' })
  const routeEntry = ROUTE_CATALOG.find((entry) => entry.path === route)
  // The agent-consent page is a focused decision: on a phone it hides the bottom tab bar.
  const focusedOnPhone = routeEntry?.owner === 'agent-consent' && (page.viewportSize()?.width ?? 1440) < 920
  if (focusedOnPhone) {
    await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(0)
  } else {
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible({ timeout: 15_000 })
  }
  // The shell can settle before a lazy route mounts. Wait for the destination landmark before
  // asserting shell chrome, so a phone breadcrumb is measured against the finished route.
  await expect(page.getByRole('main')).toBeVisible({ timeout: 15_000 })
  const settingsTab = ADMIN_SETTINGS_TABS[route]
  if (routeEntry?.owner === 'admin-settings' && !settingsTab) throw new Error(`No Admin settings tab named for ${route}`)
  if (settingsTab) {
    if ((page.viewportSize()?.width ?? 1440) < 920) {
      await expect(page.getByRole('navigation', { name: 'Admin settings sections' }).getByRole('combobox')).toContainText(settingsTab)
    } else {
      await expect(page.getByRole('link', { name: settingsTab, exact: true })).toHaveAttribute('aria-current', 'page')
    }
  } else if (routeEntry?.owner === 'agent-consent') {
    // #1069 added consent as a focused handoff without a shell destination. Its breadcrumb may be
    // omitted entirely at narrow widths; preserve the no-breadcrumb behavior, not an empty <nav>.
    await expect.poll(async () => (await breadcrumb.allTextContents()).join('').trim()).toBe('')
    await expect(page.getByRole('heading', { name: 'Connect an agent', level: 1 })).toBeVisible()
  } else if (routeEntry && (routeEntry.path === '/cafe' || routeEntry.path.startsWith('/cafe/'))) {
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible()
  } else {
    await expect(breadcrumb).toBeVisible()
  }
  if (routeEntry?.owner === 'breadcrumb') {
    // The breadcrumb names where the viewer is: the Profile page, or its Connected agents page.
    await expect(breadcrumb).toContainText(route === '/profile' ? 'Personal profile' : 'Connected agents')
  } else if (!settingsTab && routeEntry?.owner !== 'agent-consent') {
    await expect(page.locator('[aria-current="page"]')).toHaveCount(1)
  }
  // The phone shell never scrolls sideways on any destination (jsdom has no layout engine).
  if ((page.viewportSize()?.width ?? 1440) < 920) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${route}: no horizontal scroll`).toBe(true)
  }
}

test.describe('PROOF-02 canonical route and visible-root parity', () => {
  // 1440 = rail shell, 390 = bottom-tab shell + More drawer; 1300 re-ran the rail branch.
  for (const width of [1440, 390] as const) {
    test(`visible roots, canonical surfaces and Back ownership at ${width}px`, async ({ page }) => {
      test.setTimeout(120_000)
      await page.setViewportSize({ width, height: 900 })
      await loginAs(page, ADMIN.email, ADMIN.password)
      await page.goto('')
      await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible({ timeout: 15_000 })

      // The same roots are exposed at every width. Admin lacks Money's revenue-view role, so its
      // visible set excludes that role-gated root while the catalog retains it. Module-gated roots
      // appear once the org's module settings load.
      await expect.poll(
        async () => [...(await visibleSurfaceHrefs(page))].sort(),
        { message: 'route catalog parity from the rendered visible-root selector', timeout: 15_000 },
      ).toEqual(expectedAreaHrefs(width))
      if (width >= 920) await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Admin settings', exact: true })).toBeVisible()

      // Every Work collection in the catalog is reachable from the Work page.
      await page.goto('work')
      const workNav = page.getByRole('navigation', { name: 'Work destinations' })
      await expect(workNav).toBeVisible()
      const workDoors = await workNav.locator('a[href]')
        .evaluateAll((links) => links.map((link) => (link as HTMLAnchorElement).href))
      expect(workDoors.map(normalizeHref).sort()).toEqual(
        ADMIN_VISIBLE_ROOT_ROUTES.filter((route) => route.startsWith('/work/')).sort(),
      )

      for (const journey of CROSS_SECTION_RETURNS) {
        await test.step(journey.name, async () => {
          await page.goto('')
          await assertCanonicalSurface(page, journey.route)
          await page.goBack()
          await expect.poll(() => stripE2eBasePath(new URL(page.url()).pathname)).toBe('/')
          await expect(page.locator('[aria-current="page"]')).toHaveCount(1)
          await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText(/Home/)
        })
      }

      for (const route of CANONICAL_ROUTES.filter((path) => path !== '/money' && path !== '/money/pending-bills' && !isShipGated(path))) {
        await test.step(route, () => assertCanonicalSurface(page, route))
      }
      await loginAs(page, MANAGER.email, MANAGER.password)
      await assertCanonicalSurface(page, '/money')
      await loginAs(page, FINANCE.email, FINANCE.password)
      await assertCanonicalSurface(page, '/money/pending-bills')
    })
  }

  test('dark appearance applies the dark page surface and text tokens', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await loginAs(page, ADMIN.email, ADMIN.password)
    await page.goto('profile')

    const userMenu = page.locator('button[aria-haspopup="menu"]')
    await expect(userMenu).toHaveCount(1)
    await userMenu.click()
    await page.getByRole('menuitemradio', { name: 'Light', exact: true }).click()
    await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(false)
    const lightColors = await page.evaluate(() => ({
      background: getComputedStyle(document.body).backgroundColor,
      text: getComputedStyle(document.body).color,
    }))

    await page.getByRole('menuitemradio', { name: 'Dark', exact: true }).click()
    await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true)
    const darkColors = await page.evaluate(() => ({
      background: getComputedStyle(document.body).backgroundColor,
      text: getComputedStyle(document.body).color,
    }))

    expect(darkColors.background).not.toBe(lightColors.background)
    expect(darkColors.text).not.toBe(lightColors.text)
  })

  // Issue 1196: on a phone the Admin settings sections are one section switcher (the tab strip
  // clipped its last tab). It must reach every section with a 44px target and no sideways scroll.
  test('issue 1196: at 390 the Admin section switcher reaches every settings section', async ({ page }) => {
    test.setTimeout(60_000)
    await page.setViewportSize({ width: 390, height: 900 })
    await loginAs(page, ADMIN.email, ADMIN.password)
    await page.goto('admin/people')

    const nav = page.getByRole('navigation', { name: 'Admin settings sections' })
    await expect(nav).toBeVisible()
    const switcher = nav.getByRole('combobox')
    expect((await switcher.boundingBox())!.height, 'the switcher meets the 44px phone tap floor').toBeGreaterThanOrEqual(TAP_FLOOR)
    for (const [path, label] of [['/admin/teams', 'Teams'], ['/admin/access', 'Access levels'], ['/admin/agents', 'Agent apps'], ['/admin/people', 'People']]) {
      await chooseSelectOption(page, switcher, label)
      await expect.poll(() => stripE2eBasePath(new URL(page.url()).pathname)).toBe(path)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${path}: no horizontal scroll`).toBe(true)
    }
  })
})
