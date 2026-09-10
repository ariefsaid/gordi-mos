import { test, expect, type Page } from '@playwright/test'
import { ADMIN } from './fixtures/users'
import { loginAs } from './helpers/login'

// The route catalog is intentionally small and canonical. It covers every live Work child,
// the live module children exposed by the shell, and utility routes with a rendered way in.
// Ship-gated roots are excluded because the router intentionally forwards them to Home.
const ROUTE_CATALOG = [
  { path: '/', visibleRoot: true },
  { path: '/work/tasks', visibleRoot: true },
  { path: '/work/signals', visibleRoot: true },
  { path: '/work/projects', visibleRoot: true },
  { path: '/work/objectives', visibleRoot: true },
  { path: '/inbox', visibleRoot: true },
  { path: '/cafe', visibleRoot: true },
  { path: '/cafe/log', visibleRoot: false },
  { path: '/cafe/plan', visibleRoot: false },
  { path: '/cafe/stock', visibleRoot: false },
  { path: '/cafe/review', visibleRoot: false },
  { path: '/cafe/pushes', visibleRoot: false },
  { path: '/admin/people', visibleRoot: true },
  { path: '/profile', visibleRoot: false, owner: 'breadcrumb' },
] as const

const VISIBLE_ROOT_ROUTES = ROUTE_CATALOG.filter((route) => route.visibleRoot).map((route) => route.path)
const CANONICAL_ROUTES = ROUTE_CATALOG.map((route) => route.path)

const CROSS_SECTION_RETURNS = [
  { name: 'Home → Signals → Home', route: '/work/signals' },
  { name: 'Home → Café → Home', route: '/cafe/log' },
  { name: 'Home → Inbox → Home', route: '/inbox' },
] as const

const LEGACY_REDIRECTS = [
  { oldPath: 'tasks', canonical: /\/work\/tasks$/ },
  { oldPath: 'updates', canonical: /\/work\/signals\?layout=feed$/ },
  { oldPath: 'kitchen', canonical: /\/cafe\/log$/ },
] as const

function normalizeHref(href: string): string {
  const url = new URL(href)
  return `${url.pathname.replace(/^\/mos/, '') || '/'}${url.search}`
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
    return url.pathname.replace(/^\/mos/, '') || '/'
  }).toBe(route)
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible({ timeout: 15_000 })
  const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' })
  await expect(breadcrumb).toBeVisible()
  const routeEntry = ROUTE_CATALOG.find((entry) => entry.path === route)
  if (routeEntry && 'owner' in routeEntry && routeEntry.owner === 'breadcrumb') {
    await expect(breadcrumb).toContainText('Personal Profile')
  } else {
    await expect(page.locator('[aria-current="page"]')).toHaveCount(1)
  }
  await expect(page.getByRole('main')).toBeVisible()
}

test.describe('PROOF-02 canonical route and visible-root parity', () => {
  for (const width of [1440, 1300, 390] as const) {
    test(`visible roots, canonical surfaces and Back ownership at ${width}px`, async ({ page }, testInfo) => {
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
          await expect(page).toHaveURL(/\/mos\/?$/)
          await expect(page.locator('[aria-current="page"]')).toHaveCount(1)
          await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText(/Home/)
        })
      }

      for (const route of CANONICAL_ROUTES) {
        await assertCanonicalSurface(page, route)
      }

      await testInfo.attach('visible-root-hrefs', {
        body: JSON.stringify({ width, hrefs: [...hrefs].sort(), canonicalRoutes: CANONICAL_ROUTES }, null, 2),
        contentType: 'application/json',
      })
      await page.screenshot({ path: testInfo.outputPath(`route-parity-${width}.png`), fullPage: true })
    })

    test(`legacy redirects and Back never re-enter retired URLs at ${width}px`, async ({ page }) => {
      test.setTimeout(90_000)
      await page.setViewportSize({ width, height: 900 })
      await loginAs(page, ADMIN.email, ADMIN.password)
      for (const redirect of LEGACY_REDIRECTS) {
        await page.goto('')
        await page.goto(redirect.oldPath, { waitUntil: 'commit' })
        await expect(page).toHaveURL(redirect.canonical)
        await expect(page.locator('[aria-current="page"]')).toHaveCount(1)
        await page.goBack()
        await expect(page).not.toHaveURL(new RegExp(`/mos/${redirect.oldPath.replaceAll('/', '\\/')}$`))
      }
    })
  }
})
