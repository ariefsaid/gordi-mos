import {
  isValidElement,
  lazy,
  Suspense,
  type ComponentType,
  type LazyExoticComponent,
  type ReactNode,
} from 'react'
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom'
import {
  SHOW_USER_VIEWS,
  SHOW_FOLLOWUPS,
  SHOW_PLAN_BUDGET,
} from './config/features'
import { ProtectedRoute } from './auth/protected-route'
import { AdminRoute } from './auth/admin-route'
import { RequireAccessRole } from './auth/require-access-role'
import { RequireCapability } from './auth/require-capability'
import { RedirectIfAuthed } from './auth/redirect-if-authed'
import { REVENUE_VIEW_ROLES } from './lib/capabilities'
import { isShipGated } from './lib/ship-gate'
import { AppShell } from './shell/app-shell'
import { RouteRedirect } from './shell/route-redirect'
import { pageHandle, redirectHandle, infrastructureHandle, type RouteHandle } from './shell/route-classification'
import { LoadingShell } from './components/ui/state-kit'
// Eager, deliberately: both are above-the-fold first paints. HomePage is the index route (the
// screen every authenticated session opens on) and LoginPage is what a logged-out visitor lands
// on. Code-splitting either trades a bundle-size win for a visible blank frame on first paint.
import { HomePage } from './pages/home-page'
import { LoginPage } from './pages/login-page'
import { RouteErrorBoundary } from './components/RouteErrorBoundary'

// ── Code splitting (NFR-012 / AC-019) ────────────────────────────────────────────────────────
// Every route except the index and login loads on demand. Before this, all ~25 route surfaces
// shipped in one entry chunk to every viewer regardless of which single screen they opened — a
// real cost for the floor personas, who open one capture screen on café wifi.
//
// `lazyPage` is `React.lazy` plus the loader kept on the component. That is what lets the route
// tests prove WHICH module a split route resolves to — `preload()` and compare the export by
// identity — instead of trusting a name or a comment; it also gives a future prefetch-on-hover
// somewhere to hook in. `withSuspense` wraps each split element in the app's one sanctioned
// loading grammar (LoadingShell), so no route invents its own spinner.

/* eslint-disable @typescript-eslint/no-explicit-any -- mirrors React.lazy's own type parameter */
type Preloadable<T extends ComponentType<any>> = LazyExoticComponent<T> & {
  /** The module loader, exposed so a test can resolve what this route actually renders. */
  preload: () => Promise<{ default: T }>
}

function lazyPage<T extends ComponentType<any>>(
  loader: () => Promise<{ default: T }>,
): Preloadable<T> {
  const Component = lazy(loader) as Preloadable<T>
  Component.preload = loader
  return Component
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function withSuspense(element: ReactNode) {
  return <Suspense fallback={<LoadingShell />}>{element}</Suspense>
}

const TasksLayout = lazyPage(() => import('./pages/tasks-layout').then((m) => ({ default: m.TasksLayout })))
const TaskDrawer = lazyPage(() => import('./components/tasks/task-drawer').then((m) => ({ default: m.TaskDrawer })))
// Signals replaces Weekly Updates (v4): `/updates` redirects here and the retired page is not routed.
const SignalsArchivePage = lazyPage(() =>
  import('./pages/signals-archive-page').then((m) => ({ default: m.SignalsArchivePage })),
)
const SignalRecordPage = lazyPage(() =>
  import('./pages/signals-archive-page').then((m) => ({ default: m.SignalRecordPage })),
)
const FollowUpsPage = lazyPage(() => import('./pages/follow-ups-page').then((m) => ({ default: m.FollowUpsPage })))
const ObjectivesPage = lazyPage(() => import('./pages/objectives-page').then((m) => ({ default: m.ObjectivesPage })))
const ProjectsProcessesPage = lazyPage(() =>
  import('./pages/projects-processes-page').then((m) => ({ default: m.ProjectsProcessesPage })),
)
const InboxPage = lazyPage(() => import('./pages/inbox-page').then((m) => ({ default: m.InboxPage })))

const CafeOpeningPage = lazyPage(() =>
  import('./pages/cafe-opening-page').then((m) => ({ default: m.CafeOpeningPage })),
)
const KitchenLogPage = lazyPage(() => import('./pages/kitchen-log-page').then((m) => ({ default: m.KitchenLogPage })))
const KitchenPlanPage = lazyPage(() => import('./pages/kitchen-plan-page').then((m) => ({ default: m.KitchenPlanPage })))
const KitchenReviewPage = lazyPage(() =>
  import('./pages/kitchen-review-page').then((m) => ({ default: m.KitchenReviewPage })),
)
const KitchenStockPage = lazyPage(() =>
  import('./pages/kitchen-stock-page').then((m) => ({ default: m.KitchenStockPage })),
)
const KitchenPushesPage = lazyPage(() =>
  import('./pages/kitchen-pushes-page').then((m) => ({ default: m.KitchenPushesPage })),
)
const DashboardPage = lazyPage(() => import('./pages/dashboard-page').then((m) => ({ default: m.DashboardPage })))
const BudgetPage = lazyPage(() => import('./pages/budget-page').then((m) => ({ default: m.BudgetPage })))
const PricingPage = lazyPage(() => import('./pages/pricing-page').then((m) => ({ default: m.PricingPage })))
const AdminUsersPage = lazyPage(() => import('./pages/admin-users-page').then((m) => ({ default: m.AdminUsersPage })))
const SliceStubPage = lazyPage(() => import('./pages/slice-stub-page').then((m) => ({ default: m.SliceStubPage })))
const ProfilePage = lazyPage(() => import('./pages/profile-page').then((m) => ({ default: m.ProfilePage })))
const EventsWorkspacePage = lazyPage(() => import('./pages/events-workspace-page').then((m) => ({ default: m.EventsWorkspacePage })))
const NotFoundPage = lazyPage(() => import('./pages/not-found-page').then((m) => ({ default: m.NotFoundPage })))
const RecoveryPage = lazyPage(() => import('./pages/recovery-page').then((m) => ({ default: m.RecoveryPage })))
const UiGallery = lazyPage(() => import('./pages/ui-gallery').then((m) => ({ default: m.UiGallery })))
const DevViewsPage = lazyPage(() => import('./pages/dev-views-page').then((m) => ({ default: m.DevViewsPage })))

// ── The route table ──────────────────────────────────────────────────────────────────────────
//
// / (RedirectIfAuthed) — unauthenticated
//   /login /recovery
// / (ProtectedRoute) — authenticated
//   AppShell (layout route — rail + header + context row, persistent across navigation)
//     /                          Home
//     /work/tasks[/new|/:taskId] Tasks (split-view shell + drawer children)
//     /work/signals              Signals
//     /work/objectives           Objectives (no read gate — OD-V4-1)
//     /work/projects             Projects & Processes (capability: workline.manage)
//     /events /ecommerce /roastery /profile
//     /money[/detail|/budget|/pricing|/follow-ups]
//     /inbox
//     /cafe[/log|/plan|/stock|/review|/pushes]
//     /admin/people
//     *                          not-found, INSIDE the shell (AC-021)
//
// basename '/mos' matches the Caddy/Vite base (OD-P0-5).
//
// **This table lands with `dev`'s page components wired wherever the v4 surface has not arrived**
// (FR-018/AC-020). That is what makes the port surface-by-surface: the paths, gates, redirects,
// classification and splitting land once, here, and each later surface PR flips exactly one
// element. A route with no `dev` counterpart at all gets SliceStubPage — a real placeholder, never
// the 404 — so a rail entry never leads to a screen claiming the page does not exist.
//
// **No chained redirects.** Every retired path names its FINAL destination. A retired path whose
// destination is gated is parked INSIDE that gate, so a viewer without the role is turned away
// once at the source instead of being forwarded to a page that turns them away again.
//
// **The ship gate is applied to this table, not written into it** (#444). See `applyShipGate`
// below the array: the paths stay declared exactly as they are, with their real components,
// gates and handles — one transform decides which of them route. That is what makes deleting a
// path from `SHIP_GATED_PATHS` restore its surface with no edit here.
const routeTable: RouteObject[] = [
  // DEV-only primitives gallery (AC-147). Bare route — no auth gate, no shell — for design
  // review. Stripped from the production build via import.meta.env.DEV.
  ...(import.meta.env.DEV
    ? [
        {
          path: '/dev/ui',
          element: withSuspense(<UiGallery />),
          handle: infrastructureHandle('dev-only'),
        },
      ]
    : []),
  {
    element: <RedirectIfAuthed />,
    errorElement: <RouteErrorBoundary />,
    handle: infrastructureHandle('auth'),
    children: [
      { path: '/login', element: <LoginPage />, handle: infrastructureHandle('public') },
      {
        path: '/recovery',
        element: withSuspense(<RecoveryPage />),
        handle: infrastructureHandle('public'),
      },
    ],
  },
  {
    element: <ProtectedRoute />,
    errorElement: <RouteErrorBoundary />,
    handle: infrastructureHandle('auth'),
    children: [
      {
        element: <AppShell />,
        handle: infrastructureHandle('layout'),
        children: [
          // Home (#191, PORT-023 — the one entry this PR changes). HomePage is now v4's ported
          // design: the region/attention model (needs-you, failed checks, mentions, my work
          // today) in whichever of Focused/Overview/List the viewer has chosen. Eager, still,
          // for the same reason as the import above: the index route is the first paint every
          // session gets.
          {
            index: true,
            element: <HomePage />,
            handle: pageHandle('workspace'),
          },
          // ── Work ────────────────────────────────────────────────────────────────────────
          {
            path: 'work',
            element: <RouteRedirect to="/work/tasks" />,
            handle: redirectHandle('/work/tasks'),
          },
          {
            path: 'work/tasks',
            element: withSuspense(<TasksLayout />),
            handle: pageHandle('workspace'),
            children: [
              {
                path: 'new',
                element: withSuspense(<TaskDrawer mode="create" />),
                handle: pageHandle('focused-record'),
              },
              {
                path: ':taskId',
                element: withSuspense(<TaskDrawer mode="view" />),
                handle: pageHandle('focused-record'),
              },
            ],
          },
          // Signals is v4's replacement for Weekly Updates — v4's own map redirects /updates
          // here, and routes this path at SignalsArchivePage as the replacement archive surface.
          {
            path: 'work/signals',
            element: withSuspense(<SignalsArchivePage />),
            handle: pageHandle('workspace'),
          },
          {
            path: 'work/signals/:signalId',
            element: withSuspense(<SignalRecordPage />),
            handle: pageHandle('focused-record'),
          },
          // OD-V4-1: Objectives are visible to everyone, so there is NO read gate here. The
          // SELECT policy on the objectives table carries no role check — only org tenancy — so
          // the capability gate was hiding a screen the database already lets every authenticated
          // viewer read. Write stays behind `can('objective.manage')` inside the page's own
          // mutation handlers, and the database is the boundary either way (NFR-004). The rail
          // dropped this gate in #188; the route follows, or the rail links somewhere that
          // bounces.
          {
            path: 'work/objectives',
            element: withSuspense(<ObjectivesPage />),
            handle: pageHandle('management'),
          },
          {
            element: <RequireCapability capability="workline.manage" />,
            handle: infrastructureHandle('capability'),
            children: [
              {
                path: 'work/projects',
                element: withSuspense(<ProjectsProcessesPage />),
                handle: pageHandle('management'),
              },
              // Both retired spellings live INSIDE the gate they forward into. Outside it, a
              // viewer without `workline.manage` would be forwarded to /work/projects and
              // bounced from there — two hops. Inside, they are bounced once, at the source.
              {
                path: 'work/projects-processes',
                element: <RouteRedirect to="/work/projects" />,
                handle: redirectHandle('/work/projects'),
              },
              {
                path: 'projects-processes',
                element: <RouteRedirect to="/work/projects" />,
                handle: redirectHandle('/work/projects'),
              },
            ],
          },
          // The cascade SCREEN is cut (OD-WAY-32) — "cascade" is vocabulary, never a surface. The
          // path keeps its doormat: a redirect entry is not a screen, and every other retired
          // path in this table redirects in one hop (#217/#218).
          {
            path: 'work/cascade',
            element: <RouteRedirect to="/work/tasks" />,
            handle: redirectHandle('/work/tasks'),
          },
          // /work/follow-ups is DELETED, not redirected (DD-WAY-36, #369): the queue lives at
          // /money/follow-ups behind its finance gate; a Work visit falls through to not-found.
          {
            path: 'objectives',
            element: <RouteRedirect to="/work/objectives" />,
            handle: redirectHandle('/work/objectives'),
          },
          {
            path: 'tasks',
            element: <RouteRedirect to="/work/tasks" />,
            handle: redirectHandle('/work/tasks'),
          },
          {
            path: 'tasks/new',
            element: <RouteRedirect to="/work/tasks/new" />,
            handle: redirectHandle('/work/tasks/new'),
          },
          {
            path: 'tasks/:taskId',
            element: <RouteRedirect to="/work/tasks/:taskId" />,
            handle: redirectHandle('/work/tasks/:taskId'),
          },
          {
            path: 'updates',
            element: <RouteRedirect to="/work/signals" />,
            handle: redirectHandle('/work/signals'),
          },

          // ── Events (Work calendar) ───────────────────────────────────────────────────────
          { path: 'work/events', element: withSuspense(<EventsWorkspacePage />), handle: pageHandle('workspace') },

          // ── Money ───────────────────────────────────────────────────────────────────────
          // The gate is `dev`'s, not v4's. v4 collapsed all of Money to finance|admin, which
          // would revoke the financial VIEW tier `dev` grants manager (AC-127, ADR-0050 D8) and
          // the revenue-only VIEW tier it grants supervisor (AC-326, ADR-0051) — a security
          // series that exists only on this line. Read admits the VIEW tiers; planning
          // (budget/pricing) stays finance|admin, and that split is why there are two gates.
          {
            element: <RequireAccessRole anyOf={REVENUE_VIEW_ROLES} />,
            handle: infrastructureHandle('capability'),
            children: [
              { path: 'money', element: withSuspense(<DashboardPage />), handle: pageHandle('workspace') },
              {
                path: 'money/detail',
                element: withSuspense(<DashboardPage defaultTab="detail" />),
                handle: pageHandle('workspace'),
              },
              // /sales names /money directly — never chained through /dashboard.
              { path: 'sales', element: <RouteRedirect to="/money" />, handle: redirectHandle('/money') },
              { path: 'dashboard', element: <RouteRedirect to="/money" />, handle: redirectHandle('/money') },
              {
                path: 'dashboard/detail',
                element: <RouteRedirect to="/money/detail" />,
                handle: redirectHandle('/money/detail'),
              },
            ],
          },
          {
            element: <RequireAccessRole anyOf={['finance', 'admin']} />,
            handle: infrastructureHandle('capability'),
            children: [
              {
                path: 'money/budget',
                element: SHOW_PLAN_BUDGET ? withSuspense(<BudgetPage />) : <Navigate to="/" replace />,
                handle: pageHandle('workspace'),
              },
              {
                path: 'money/pricing',
                element: SHOW_PLAN_BUDGET ? withSuspense(<PricingPage />) : <Navigate to="/" replace />,
                handle: pageHandle('workspace'),
              },
              // The follow-ups QUEUE moved out of Work and into Money with the object itself
              // (DD-WAY-16 — it belongs to finance, deferred past the MVP). Still dark behind
              // SHOW_FOLLOWUPS.
              {
                path: 'money/follow-ups',
                element: SHOW_FOLLOWUPS ? withSuspense(<FollowUpsPage />) : <Navigate to="/" replace />,
                handle: pageHandle('workspace'),
              },
              // The retired paths follow the flag their destination follows. Pointing them at
              // /money/budget unconditionally would forward a viewer onto a route that is itself
              // switched off and redirects home — two hops, and the second one invisible until
              // someone flips the flag off in production.
              {
                path: 'plan/budget',
                element: SHOW_PLAN_BUDGET ? <RouteRedirect to="/money/budget" /> : <Navigate to="/" replace />,
                handle: redirectHandle(SHOW_PLAN_BUDGET ? '/money/budget' : '/'),
              },
              {
                path: 'plan/pricing',
                element: SHOW_PLAN_BUDGET ? <RouteRedirect to="/money/pricing" /> : <Navigate to="/" replace />,
                handle: redirectHandle(SHOW_PLAN_BUDGET ? '/money/pricing' : '/'),
              },
            ],
          },

          // ── Inbox ───────────────────────────────────────────────────────────────────────
          // SHOW_INBOX is retired. #188 already made the rail entry, the bottom tab and the
          // header bell unconditional; a flag that hides only the route leaves three live doors
          // onto a redirect home.
          { path: 'inbox', element: withSuspense(<InboxPage />), handle: pageHandle('workspace') },

          // ── Café (Kitchen re-homed) ─────────────────────────────────────────────────────
          // /cafe is v4's opening surface ("Start today's opening", RATIFY-7D): the Café Module
          // home hosts CafeOpeningPanel, then links out to the working screens (#196, PORT-023).
          {
            path: 'cafe',
            element: withSuspense(<CafeOpeningPage />),
            handle: pageHandle('workspace'),
          },
          { path: 'cafe/log', element: withSuspense(<KitchenLogPage />), handle: pageHandle('workspace') },
          { path: 'cafe/plan', element: withSuspense(<KitchenPlanPage />), handle: pageHandle('workspace') },
          { path: 'cafe/stock', element: withSuspense(<KitchenStockPage />), handle: pageHandle('workspace') },
          // Names /cafe/log, not /cafe: /cafe is now the opening surface itself (see above),
          // and a redirect that lands on a redirect is two hops.
          { path: 'kitchen', element: <RouteRedirect to="/cafe/log" />, handle: redirectHandle('/cafe/log') },
          { path: 'kitchen/log', element: <RouteRedirect to="/cafe/log" />, handle: redirectHandle('/cafe/log') },
          { path: 'kitchen/plan', element: <RouteRedirect to="/cafe/plan" />, handle: redirectHandle('/cafe/plan') },
          {
            path: 'kitchen/stock',
            element: <RouteRedirect to="/cafe/stock" />,
            handle: redirectHandle('/cafe/stock'),
          },
          // REVIEW admits the stream supervisor as well (#236 FR-040, wired through by #238).
          // #236 opened this surface to stream supervisors on the server (ops.can_review_stream)
          // and in the page (which renders a supervisor's own-stream decision controls and an
          // ops-lead marker on everyone else's) — but this route gate still named ops_lead/admin
          // only, so the person the slice was built for could never reach it. Caught by AC-014's
          // cross-stack journey, which is exactly the join no unit or policy test can see.
          //
          // The page keeps its own forbidden panel for anyone past this gate without standing,
          // and NFR-002 still holds: which rows a supervisor may DECIDE is the server's, never
          // this route's. A route gate decides what is worth showing; it authorises nothing.
          {
            element: <RequireAccessRole anyOf={['ops_lead', 'admin', 'supervisor']} />,
            handle: infrastructureHandle('capability'),
            children: [
              { path: 'cafe/review', element: withSuspense(<KitchenReviewPage />), handle: pageHandle('workspace') },
              // Inside the gate, for the same reason as the catalog redirects above.
              {
                path: 'kitchen/review',
                element: <RouteRedirect to="/cafe/review" />,
                handle: redirectHandle('/cafe/review'),
              },
            ],
          },
          // PUSHES stays ops_lead/admin: it is the dispatch/outbox surface, not a review queue —
          // #236 opened review per stream, and nothing about that opened posting state.
          {
            element: <RequireAccessRole anyOf={['ops_lead', 'admin']} />,
            handle: infrastructureHandle('capability'),
            children: [
              { path: 'cafe/pushes', element: withSuspense(<KitchenPushesPage />), handle: pageHandle('workspace') },
              {
                path: 'kitchen/pushes',
                element: <RouteRedirect to="/cafe/pushes" />,
                handle: redirectHandle('/cafe/pushes'),
              },
            ],
          },


          // ── Slices with no surface yet ──────────────────────────────────────────────────
          {
            path: 'ecommerce',
            element: withSuspense(<SliceStubPage jobKey="job.ecommerce" nameKey="dest.ecommerce" />),
            handle: pageHandle('workspace'),
          },
          {
            path: 'roastery',
            element: withSuspense(<SliceStubPage jobKey="job.roastery" nameKey="dest.roastery" />),
            handle: pageHandle('workspace'),
          },
          // #199 ported ProfilePage but left this route on the stub, and the migration registry
          // has named `ProfilePage` as this path's frame component the whole time — so the
          // registry was describing a page the table did not serve (#269).
          //
          // Load-bearing, not cosmetic: the locale control lives on this page and `LocaleToggle`
          // was deleted from the shell in the same change. With the route on the stub there is no
          // mounted language control anywhere in the app, so the Indonesian catalog is complete
          // and unreachable. Serving the real page is what restores it.
          {
            path: 'profile',
            element: withSuspense(<ProfilePage />),
            handle: pageHandle('management'),
          },

          // ── Admin ───────────────────────────────────────────────────────────────────────
          // RLS / RPC authz is the real security boundary (ADR-0011 D5); AdminRoute is affordance.
          {
            element: <AdminRoute />,
            handle: infrastructureHandle('capability'),
            children: [
              {
                path: 'admin/people',
                element: withSuspense(<AdminUsersPage />),
                handle: pageHandle('management'),
              },
              { path: 'admin', element: <RouteRedirect to="/admin/people" />, handle: redirectHandle('/admin/people') },
            ],
          },

          // ADR-0018 P1 — view-composition dev harness. DEV-only + feature-flagged.
          {
            path: 'dev/views',
            element:
              import.meta.env.DEV && SHOW_USER_VIEWS ? withSuspense(<DevViewsPage />) : <Navigate to="/" replace />,
            handle: infrastructureHandle('dev-only'),
          },
          {
            path: 'dev/views/:viewId',
            element:
              import.meta.env.DEV && SHOW_USER_VIEWS ? withSuspense(<DevViewsPage />) : <Navigate to="/" replace />,
            handle: infrastructureHandle('dev-only'),
          },

          // Not-found sits INSIDE the AppShell layout route (AC-021), so a mistyped path keeps
          // the rail and the header and the viewer can navigate out of it.
          { path: '*', element: withSuspense(<NotFoundPage />), handle: infrastructureHandle('not-found') },
        ],
      },
    ],
  },
]

// ── The ship gate, applied (#444) ────────────────────────────────────────────────────────────
//
// A gated path does not route. Its entry keeps its place in the table above — same path, same
// gates, same handle metadata, same lazy import sitting untouched in the bundle graph — but its
// ELEMENT is swapped for a forward to Home, so the component behind it never mounts. That is the
// difference between hiding a surface and deleting one, and it is why switch day is a one-line
// edit to `SHIP_GATED_PATHS` rather than a revert.
//
// Two kinds of entry are rewritten, and the second is the one that is easy to miss:
//
//  1. the gated surface itself (`/money`, `/work/objectives`, …);
//  2. every RETIRED path whose redirect names a gated surface (`/dashboard` → `/money`,
//     `/objectives` → `/work/objectives`). Left alone, those forward a viewer onto a path that
//     forwards them again — the chained redirect the whole table is built to avoid — so they
//     name Home directly instead, and their `redirect` handle is re-declared to match. A handle
//     that disagrees with its element is a comment that lies (route-classification.test.ts).
//
// A gated SURFACE keeps its `page` handle: it is still a page, still registered in the page-family
// registry, still wired to a real component — it is merely closed. That is the same shape the
// existing SHOW_PLAN_BUDGET fallbacks already have, so nothing downstream learns a new case.
function joinRoutePath(parent: string, segment: string): string {
  const joined = segment.startsWith('/') ? segment : `${parent}/${segment}`
  const collapsed = joined.replace(/\/+/g, '/')
  return collapsed === '/' ? collapsed : collapsed.replace(/\/$/, '')
}

/** The `to` of a redirect element (`<RouteRedirect>` / `<Navigate>`), or undefined. */
function redirectTargetOf(element: ReactNode): string | undefined {
  if (!isValidElement(element)) return undefined
  const to = (element.props as { to?: unknown }).to
  return typeof to === 'string' ? to : undefined
}

export function applyShipGate(routes: RouteObject[], parent = ''): RouteObject[] {
  return routes.map((route): RouteObject => {
    const path =
      route.index || route.path === undefined ? parent || '/' : joinRoutePath(parent, route.path)
    const target = redirectTargetOf(route.element)
    const gated = isShipGated(path) || (target !== undefined && isShipGated(target))
    // A `redirect` handle declares a target and must keep matching what the element does. A `page`
    // handle declares no target and is left alone — a gated surface is still a page, merely closed
    // (the shape the SHOW_PLAN_BUDGET fallbacks already have), and re-classifying it would drop it
    // out of the page-family registry as though the screen had been deleted.
    const declaresTarget = (route.handle as RouteHandle | undefined)?.kind === 'redirect'
    const closed = gated
      ? { element: <Navigate to="/" replace />, ...(declaresTarget ? { handle: redirectHandle('/') } : {}) }
      : {}
    // Index and non-index routes are a discriminated union (an index route may carry no
    // `children`), so they are rebuilt on separate branches rather than through one spread.
    if (route.index) return { ...route, ...closed }
    return {
      ...route,
      ...(route.children ? { children: applyShipGate(route.children, path) } : {}),
      ...closed,
    }
  })
}

/**
 * The table as WRITTEN, before the gate — the app never routes through this.
 *
 * Exported for the wiring assertions (`router-lazy.test.tsx` AC-020), which prove each path is
 * still pointed at the right page module. Those are the tests that make "hidden, not deleted"
 * checkable: they keep failing if someone unwires or deletes a gated surface, which the gated
 * table alone can no longer tell you — every gated entry forwards home there by design.
 */
export const ungatedRouteTable: RouteObject[] = routeTable

export const routeConfig: RouteObject[] = applyShipGate(routeTable)

export const router = createBrowserRouter(routeConfig, { basename: '/mos' })
