import { test, expect, type Page } from '@playwright/test'
import { ADMIN } from './fixtures/users'
import { loginAs } from './helpers/login'
import { TAP_FLOOR } from './helpers/tap-floor'
import { stripE2eBasePath } from './helpers/app-path'
import { ROUTE_PARITY_CATALOG, type RouteParityId } from '../src/shell/route-parity'

// This catalog is the production route manifest's parity policy. The route census compares it
// with the live router, while this browser proof checks the rendered ownership at every width.
const ROUTE_CATALOG = ROUTE_PARITY_CATALOG

const VISIBLE_ROOT_ROUTES = ROUTE_CATALOG.filter((route) => route.kind === 'visible-root').map((route) => route.path)
const CANONICAL_ROUTES = ROUTE_CATALOG.map((route) => route.path)

// The active tab each Admin settings route owns. The tab and the rail's Admin link both mark the
// place, so these routes are checked by their tab instead of the single-aria-current count.
const ADMIN_SETTINGS_TABS: Record<string, string> = {
  '/admin/people': 'People',
  '/admin/teams': 'Teams',
  '/admin/access': 'Roles & permissions',
  '/admin/agents': 'Connected agents',
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

// Café capture pages own their visible title (kitchen-log-page.css hides the breadcrumb leaf), and
// below rail-collapse the breadcrumb has no ancestors, so the nav is CSS-hidden by design there.
const CAPTURE_TITLE_ROUTES: readonly RouteParityId[] = ['cafe', 'cafeProduction', 'cafeTransfer', 'cafeWaste']

function normalizeHref(href: string): string {
  const url = new URL(href)
  return `${stripE2eBasePath(url.pathname)}${url.search}`
}

async function visibleSurfaceHrefs(page: Page): Promise<Set<string>> {
  const width = page.viewportSize()?.width ?? 1440
  if (width >= 920) {
    const hrefs = await page.locator('nav[aria-label="Primary"] a[href]').evaluateAll((links) =>
      links.map((link) => (link as HTMLAnchorElement).href),
    )
    return new Set(hrefs.map(normalizeHref))
  }

  const bottom = await page.locator('nav[aria-label="Primary"] a[href]').evaluateAll((links) =>
    links.map((link) => (link as HTMLAnchorElement).href),
  )
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'More' }).click()
  const drawer = page.getByRole('navigation', { name: 'More destinations' })
  const drawerHrefs = await drawer.locator('a[href]').evaluateAll((links) =>
    links.map((link) => (link as HTMLAnchorElement).href),
  )
  await page.keyboard.press('Escape')
  return new Set([...bottom, ...drawerHrefs].map(normalizeHref))
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
  const settingsTab = ADMIN_SETTINGS_TABS[route]
  if (routeEntry?.owner === 'admin-settings' && !settingsTab) throw new Error(`No Admin settings tab named for ${route}`)
  if (settingsTab) {
    const settings = page.getByRole('navigation', { name: 'Admin settings sections' })
    await expect(settings).toBeVisible()
    await expect(settings.getByRole('link', { name: settingsTab, exact: true })).toHaveAttribute('aria-current', 'page')
  } else if (routeEntry?.owner === 'agent-consent') {
    // #1069 added consent as a focused handoff without a shell destination. Its breadcrumb may be
    // omitted entirely at narrow widths; preserve the no-breadcrumb behavior, not an empty <nav>.
    await expect.poll(async () => (await breadcrumb.allTextContents()).join('').trim()).toBe('')
    await expect(page.getByRole('heading', { name: 'Connect an agent', level: 1 })).toBeVisible()
  } else if (routeEntry && CAPTURE_TITLE_ROUTES.includes(routeEntry.id)) {
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible()
  } else {
    await expect(breadcrumb).toBeVisible()
  }
  if (routeEntry?.owner === 'breadcrumb') {
    await expect(breadcrumb).toContainText('Personal Profile')
  } else if (!settingsTab && routeEntry?.owner !== 'agent-consent') {
    await expect(page.locator('[aria-current="page"]')).toHaveCount(1)
  }
  await expect(page.getByRole('main')).toBeVisible()
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

      const hrefs = await visibleSurfaceHrefs(page)
      // The same visible-root selector must expose the same admitted route set at every width.
      // At this committed candidate ADMIN admits Café, while ship-gated roots remain absent from
      // every surface. The set is captured from rendered links, never retyped per UI.
      expect([...hrefs].sort(), 'route catalog parity from the rendered visible-root selector').toEqual(
        [...VISIBLE_ROOT_ROUTES].sort(),
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

      for (const route of CANONICAL_ROUTES) {
        await assertCanonicalSurface(page, route)
      }
    })
  }

  // Issue 1196: the phone strip forced one nowrap row behind overflow-x with edge fades, so at
  // 390px the last tab was clipped with no scroll cue. Asserted on rendered geometry, not CSS
  // values: every tab's box must sit fully inside the visible settings-nav viewport, with no
  // hidden scroll to reach it and no fade painted over it. One visit proves the shared strip;
  // the width loop above already visits each admin settings route.
  test('issue 1196: at 390 every Admin settings tab is fully visible — no hidden scroll, no fade, ≥44px', async ({ page }) => {
    test.setTimeout(60_000)
    await page.setViewportSize({ width: 390, height: 900 })
    await loginAs(page, ADMIN.email, ADMIN.password)
    await page.goto('admin/people')

    const nav = page.getByRole('navigation', { name: 'Admin settings sections' })
    await expect(nav).toBeVisible()

    const strip = await nav.evaluate((el) => {
      const visible = el.getBoundingClientRect()
      return {
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        frameClass: el.parentElement?.className ?? '',
        left: visible.left,
        right: visible.right,
        tabs: Array.from(el.querySelectorAll('a')).map((a) => {
          const box = a.getBoundingClientRect()
          return { label: (a.textContent ?? '').trim(), left: box.left, right: box.right, height: box.height }
        }),
      }
    })

    expect(strip.tabs.map((tab) => tab.label), 'the four Admin settings tabs render in nav order').toEqual(
      Object.values(ADMIN_SETTINGS_TABS),
    )
    expect(strip.scrollWidth, 'settings nav keeps no hidden horizontal scroll at 390').toBeLessThanOrEqual(
      strip.clientWidth + 0.5,
    )
    for (const tab of strip.tabs) {
      expect(tab.left, `"${tab.label}" starts inside the visible nav`).toBeGreaterThanOrEqual(strip.left - 0.5)
      expect(tab.right, `"${tab.label}" ends inside the visible nav`).toBeLessThanOrEqual(strip.right + 0.5)
      expect(tab.height, `"${tab.label}" meets the 44px phone tap floor`).toBeGreaterThanOrEqual(TAP_FLOOR)
    }
    expect(strip.frameClass, 'no more-content fade renders over the strip').not.toContain('admin-settings-nav-frame--more')
  })
})
