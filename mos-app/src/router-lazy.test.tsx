// router-lazy.test.tsx — the code-splitting contract (AC-019) and the "which surface is actually
// wired" contract (AC-020).
//
// Every feature flag is mocked ON here, deliberately. `router.test.tsx` owns the flag-OFF branch,
// where several page routes collapse to a redirect; with the flags on, every page route has to
// render its page, so "each entry except the index and login resolves through a lazy import" is
// asserted against the full table rather than the half of it the default configuration exposes.
import { describe, it, expect, vi } from 'vitest'
import { isValidElement } from 'react'

vi.mock('./config/features', () => ({
  SHOW_USER_VIEWS: true,
  SHOW_ASSISTANT: true,
  SHOW_FOLLOWUPS: true,
  SHOW_PLAN_BUDGET: true,
}))

import { describeRedirectMap, flattenRoutes, isRedirect, lazyPayloadOf, resolvePageAt } from './test/route-table'
import type { RouteHandle } from './shell/route-classification'
import { ungatedRouteTable } from './router'
import { isShipGated } from './lib/ship-gate'

import { HomePage } from './pages/home-page'
import { LoginPage } from './pages/login-page'
import { TasksLayout } from './pages/tasks-layout'
import { TaskDrawer } from './components/tasks/task-drawer'
import { SignalsArchivePage, SignalRecordPage } from './pages/signals-archive-page'
import { ProfilePage } from './pages/profile-page'
import { EventsWorkspacePage } from './pages/events-workspace-page'
import { FollowUpsPage } from './pages/follow-ups-page'
import { ObjectivesPage } from './pages/objectives-page'
import { ProjectsProcessesPage } from './pages/projects-processes-page'
import { InboxPage } from './pages/inbox-page'
import { KitchenLogPage } from './pages/kitchen-log-page'
import { KitchenPlanPage } from './pages/kitchen-plan-page'
import { KitchenStockPage } from './pages/kitchen-stock-page'
import { KitchenReviewPage } from './pages/kitchen-review-page'
import { KitchenPushesPage } from './pages/kitchen-pushes-page'
import { CafeOpeningPage } from './pages/cafe-opening-page'
import { DashboardPage } from './pages/dashboard-page'
import { BudgetPage } from './pages/budget-page'
import { PricingPage } from './pages/pricing-page'
import { AdminUsersPage } from './pages/admin-users-page'
import { RecoveryPage } from './pages/recovery-page'
import { SliceStubPage } from './pages/slice-stub-page'

// The two landing screens (AC-019's stated exemptions).
const EAGER_BY_DESIGN = new Set(['/', '/login'])

function handleOf(handle: unknown): RouteHandle | undefined {
  return handle as RouteHandle | undefined
}

/** Routes that load a SURFACE — pages, the not-found screen, and the public/DEV-only screens. */
function surfaceRoutes() {
  return flattenRoutes().filter(({ route }) => {
    if (route.element === undefined || isRedirect(route.element)) return false
    const handle = handleOf(route.handle)
    if (!handle) return false
    if (handle.kind === 'page') return true
    return (
      handle.kind === 'infrastructure' &&
      (handle.reason === 'not-found' || handle.reason === 'public' || handle.reason === 'dev-only')
    )
  })
}

// The same AC-017 enumeration router.test.tsx runs with the flags off. With them ON the map
// grows two rows — /plan/budget → /money/budget and /plan/pricing → /money/pricing — that are
// flag fallbacks to `/` in the other configuration and so are asserted nowhere else. Every row
// of the published redirect map is backed by one of these two runs.
describeRedirectMap('plan/budget + follow-ups flags ON')

describe('AC-019: every route but the index and login loads on demand, behind one loading shell', () => {
  const routes = surfaceRoutes()

  it('the sweep enumerates the whole table, so it cannot pass by finding nothing', () => {
    // Floor lowered from 25 with the ship gate (#444): ten page routes now forward home instead
    // of rendering, so they are no longer split-loading anything and drop out of this sweep. The
    // wiring ledger below still holds each of them to its page module in the written table.
    expect(routes.length).toBeGreaterThan(18)
    // Each exemption is really in the table — otherwise the exemption set is silently dead.
    for (const path of EAGER_BY_DESIGN) {
      expect(routes.some((r) => r.path === path), `${path} is not in the table`).toBe(true)
    }
  })

  it.each(
    surfaceRoutes()
      .filter((r) => !EAGER_BY_DESIGN.has(r.path))
      .map((r) => [r.path, r.route.element] as const),
  )('%s is a lazy import wrapped in the sanctioned LoadingShell', (_path, element) => {
    expect(lazyPayloadOf(element)).toBeDefined()
  })

  it.each(
    surfaceRoutes()
      .filter((r) => EAGER_BY_DESIGN.has(r.path))
      .map((r) => [r.path, r.route.element] as const),
  )('%s stays eager — it is an above-the-fold first paint', (_path, element) => {
    expect(lazyPayloadOf(element)).toBeUndefined()
    expect(isValidElement(element)).toBe(true)
  })

  it('the index route renders HomePage and /login renders LoginPage, both directly', () => {
    const index = surfaceRoutes().find((r) => r.path === '/')!
    const login = surfaceRoutes().find((r) => r.path === '/login')!
    expect(isValidElement(index.route.element) && index.route.element.type).toBe(HomePage)
    expect(isValidElement(login.route.element) && login.route.element.type).toBe(LoginPage)
  })
})

// ── AC-020 ───────────────────────────────────────────────────────────────────────────────────
//
// The port lands the route table with `dev`'s page components wired wherever the v4 surface has
// not arrived yet. This is what proves it: each route's own module loader is RUN, and the export
// it yields is compared to a statically imported component by identity. A route re-pointed at a
// different module goes red here regardless of what its name, comment or handle claims — which is
// the whole reason the loader is kept on the lazy component instead of a label.
//
// It is also the ledger every later surface ticket edits: porting a surface flips exactly one row.
const WIRING: ReadonlyArray<readonly [path: string, component: unknown, provenance: string]> = [
  ['/work/tasks', TasksLayout, 'dev'],
  ['/work/tasks/:taskId', TaskDrawer, 'dev'],
  // Signals supersedes Weekly Updates (v4 redirects /updates here, and routes neither path at an
  // Updates surface). #193 ported the archive but never flipped these two rows, so this ledger
  // asserted the defect as the expected answer for the whole port — the row said `UpdatesPage`
  // and the route obliged. Flipped with the router in #267.
  ['/work/signals', SignalsArchivePage, 'v4'],
  ['/work/signals/:signalId', SignalRecordPage, 'v4'],
  ['/work/objectives', ObjectivesPage, 'dev'],
  ['/work/projects', ProjectsProcessesPage, 'dev'],
  ['/work/events', EventsWorkspacePage, 'dev'], 
  ['/money', DashboardPage, 'dev'],
  ['/money/detail', DashboardPage, 'dev'],
  ['/money/budget', BudgetPage, 'dev'],
  ['/money/pricing', PricingPage, 'dev'],
  ['/money/follow-ups', FollowUpsPage, 'dev'],
  ['/inbox', InboxPage, 'dev'],
  // /cafe has no dev counterpart — it is v4's own opening surface (#196, PORT-023), never a
  // dev-carried or stub component, so it gets a provenance of its own rather than a false 'dev'.
  ['/cafe', CafeOpeningPage, 'v4'],
  ['/cafe/log', KitchenLogPage, 'dev'],
  ['/cafe/plan', KitchenPlanPage, 'dev'],
  ['/cafe/stock', KitchenStockPage, 'dev'],
  ['/cafe/review', KitchenReviewPage, 'dev'],
  ['/cafe/pushes', KitchenPushesPage, 'dev'],
  ['/ecommerce', SliceStubPage, 'stub'],
  ['/roastery', SliceStubPage, 'stub'],
  // ProfilePage was built by #199 and the migration registry named it as this path's frame
  // component throughout — while this row asserted the stub. Routed in #269; it carries the only
  // locale control in the app, so the stub left the Indonesian catalog unreachable.
  ['/profile', ProfilePage, 'v4'],
  ['/admin/people', AdminUsersPage, 'dev'],
  ['/recovery', RecoveryPage, 'dev'],
]

describe('AC-020: a route whose surface is not yet ported serves the surface currently on dev', () => {
  it('every page route in the table is accounted for in the wiring ledger', () => {
    const declared = new Set(WIRING.map(([path]) => path))
    const missing = surfaceRoutes()
      .map((r) => r.path)
      .filter((p) => !EAGER_BY_DESIGN.has(p) && p !== '/dev/ui' && p !== '/dev/views')
      .filter((p) => !p.startsWith('/dev/views/'))
      .filter((p) => p !== '/*' && !p.endsWith('/*'))
      .filter((p) => !declared.has(p))
    expect(missing).toEqual([])
  })

  it.each(
    WIRING.filter(([path]) => !isShipGated(path)).map(
      ([path, component, provenance]) => [path, provenance, component] as const,
    ),
  )('%s renders the %s surface', async (path, _provenance, component) => {
    await expect(resolvePageAt(path)).resolves.toBe(component)
  })

  // A ship-gated path (#444) forwards home in the SHIPPED table, so `resolvePageAt` finds no
  // module there — that is the gate working, and `shell/ship-gate.test.tsx` asserts it from the
  // other side. What still has to be true is that the surface was HIDDEN, not deleted: the entry
  // as written is still pointed at its real page module, so removing the path from
  // SHIP_GATED_PATHS restores the screen with no edit to the table. That is what these two
  // assertions hold, read off the table BEFORE the gate is applied.
  const gatedWiring = WIRING.filter(([path]) => isShipGated(path))

  it('the gated set is non-empty — these assertions cannot pass by finding nothing', () => {
    expect(gatedWiring.length).toBeGreaterThan(5)
  })

  it.each(gatedWiring.map(([path, component]) => [path, component] as const))(
    '%s is hidden, not unwired — the table as written still points it at its page module',
    async (path, component) => {
      const leaf = flattenRoutes(ungatedRouteTable).find((f) => f.path === path)
      const payload = lazyPayloadOf(leaf?.route.element)
      expect(payload, `${path} is no longer a lazy page in the written table`).toBeDefined()
      await expect(payload!.preload!().then((m) => m.default)).resolves.toBe(component)
    },
  )

  it('no route falls through to the not-found surface (AC-020: and no not-found is shown)', () => {
    const fellThrough = WIRING.map(([path]) => path).filter((path) => {
      const leaf = flattenRoutes().find((f) => f.path === path)
      return leaf === undefined
    })
    expect(fellThrough).toEqual([])
  })
})
