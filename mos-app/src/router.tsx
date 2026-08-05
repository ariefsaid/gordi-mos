import {
  lazy,
  Suspense,
  type ComponentType,
  type LazyExoticComponent,
  type ReactNode,
} from 'react'
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom'
import {
  SHOW_DAILY_LOG,
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
import { AppShell } from './shell/app-shell'
import { RouteRedirect } from './shell/route-redirect'
import { pageHandle, redirectHandle, infrastructureHandle } from './shell/route-classification'
import { LoadingShell } from './components/ui/state-kit'
// Eager, deliberately: both are above-the-fold first paints. HomePage is the index route (the
// screen every authenticated session opens on) and LoginPage is what a logged-out visitor lands
// on. Code-splitting either trades a bundle-size win for a visible blank frame on first paint.
import { HomePage } from './pages/home-page'
import { StackedUnionHome } from './pages/stacked-union-home'
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
const UpdatesPage = lazyPage(() => import('./pages/updates-page').then((m) => ({ default: m.UpdatesPage })))
const FollowUpsPage = lazyPage(() => import('./pages/follow-ups-page').then((m) => ({ default: m.FollowUpsPage })))
const ObjectivesPage = lazyPage(() => import('./pages/objectives-page').then((m) => ({ default: m.ObjectivesPage })))
const ProjectsProcessesPage = lazyPage(() =>
  import('./pages/projects-processes-page').then((m) => ({ default: m.ProjectsProcessesPage })),
)
const InboxPage = lazyPage(() => import('./pages/inbox-page').then((m) => ({ default: m.InboxPage })))
const OpsPage = lazyPage(() => import('./pages/ops-page').then((m) => ({ default: m.OpsPage })))
const OpsAddForm = lazyPage(() => import('./pages/ops-add-form').then((m) => ({ default: m.OpsAddForm })))
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
//     /ops[/new|/:id/edit]       Daily Log — still dev's surface, see the FR-018 note below
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
export const routeConfig: RouteObject[] = [
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
          // today) in whichever of Focused/Overview/List the viewer has chosen, replacing both
          // prior `dev` compositions this route used to switch between (SHOW_HOME_STACKED is
          // retired — see config/features.ts). Eager, still, for the same reason as the import
          // above: the index route is the first paint every session gets.
          {
            index: true,
            element: <HomePage />,
            handle: pageHandle('workspace'),
          },
          // DEV-only preview of the stacked-union Home, reachable regardless of the flag so
          // verification is deterministic. Stripped from the production build.
          ...(import.meta.env.DEV
            ? [
                {
                  path: '__home-stacked',
                  element: <StackedUnionHome />,
                  handle: infrastructureHandle('dev-only'),
                },
              ]
            : []),

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
          // here. The Signals archive itself has not been ported, so this serves `dev`'s
          // UpdatesPage (FR-018) and the surface ticket flips this one element.
          // SHOW_WEEKLY_UPDATES no longer gates it: Signals is a permanent entry in the ported
          // rail, and a rail entry that redirects home is worse than no rail entry.
          {
            path: 'work/signals',
            element: withSuspense(<UpdatesPage />),
            handle: pageHandle('workspace'),
          },
          {
            path: 'work/signals/:signalId',
            element: withSuspense(
              <SliceStubPage
                jobKey="job.signals"
                nameKey="nav.work.signals"
                family="focused-record"
              />,
            ),
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
          {
            path: 'work/follow-ups',
            element: <RouteRedirect to="/work/tasks?view=followups" />,
            handle: redirectHandle('/work/tasks?view=followups'),
          },
          {
            path: 'work/follow-ups/:id',
            element: SHOW_FOLLOWUPS ? withSuspense(<FollowUpsPage />) : <Navigate to="/" replace />,
            handle: pageHandle('focused-record'),
          },
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

          // ── Events ──────────────────────────────────────────────────────────────────────
          {
            path: 'events',
            element: withSuspense(<SliceStubPage jobKey="job.events" nameKey="dest.events" />),
            handle: pageHandle('workspace'),
          },

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
          {
            element: <RequireAccessRole anyOf={['ops_lead', 'admin']} />,
            handle: infrastructureHandle('capability'),
            children: [
              { path: 'cafe/review', element: withSuspense(<KitchenReviewPage />), handle: pageHandle('workspace') },
              { path: 'cafe/pushes', element: withSuspense(<KitchenPushesPage />), handle: pageHandle('workspace') },
              // Inside the gate, for the same reason as the catalog redirects above.
              {
                path: 'kitchen/review',
                element: <RouteRedirect to="/cafe/review" />,
                handle: redirectHandle('/cafe/review'),
              },
              {
                path: 'kitchen/pushes',
                element: <RouteRedirect to="/cafe/pushes" />,
                handle: redirectHandle('/cafe/pushes'),
              },
            ],
          },

          // ── Operate (Daily Log) ─────────────────────────────────────────────────────────
          // v4 retires these to `/`. This table does NOT, and the difference is deliberate:
          // Daily Log is a live `dev` surface with no v4 successor, and `dev`'s Home still links
          // to it. AC-020 says an unported surface renders what `dev` serves — turning it into a
          // redirect deletes a working screen, which is a surface ticket's call, not the route
          // table's. Left flag-gated exactly as `dev` has it.
          {
            path: 'ops',
            element: SHOW_DAILY_LOG ? withSuspense(<OpsPage />) : <Navigate to="/" replace />,
            handle: pageHandle('workspace'),
          },
          {
            path: 'ops/new',
            element: SHOW_DAILY_LOG ? withSuspense(<OpsAddForm />) : <Navigate to="/" replace />,
            handle: pageHandle('focused-record'),
          },
          {
            path: 'ops/:id/edit',
            element: SHOW_DAILY_LOG ? withSuspense(<OpsAddForm />) : <Navigate to="/" replace />,
            handle: pageHandle('focused-record'),
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
          {
            path: 'profile',
            element: withSuspense(
              <SliceStubPage jobKey="job.profile" nameKey="dest.profile" family="management" />,
            ),
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

export const router = createBrowserRouter(routeConfig, { basename: '/mos' })
