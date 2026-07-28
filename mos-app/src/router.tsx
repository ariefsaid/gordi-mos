import { lazy, Suspense, type ReactNode } from 'react'
import { createBrowserRouter, Navigate, useLocation, useParams, type RouteObject } from 'react-router-dom'
import { SHOW_USER_VIEWS, SHOW_FOLLOWUPS, SHOW_PLAN_BUDGET } from './config/features'
import { ProtectedRoute } from './auth/protected-route'
import { AdminRoute } from './auth/admin-route'
import { RequireAccessRole } from './auth/require-access-role'
import { RequireCapability } from './auth/require-capability'
import { RedirectIfAuthed } from './auth/redirect-if-authed'
import { AppShell } from './shell/app-shell'
import { HomePage } from './pages/home-page'
import { LoginPage } from './pages/login-page'
import { RouteErrorBoundary } from './components/RouteErrorBoundary'
import { LoadingShell } from './components/ui/state-kit'
import { v3Infrastructure, v3Page, v3Redirect } from './shell/route-classification'

// Perf (impeccable/optimize, 2026-07-28): every non-landing route is code-split via
// React.lazy — the pre-split bundle shipped all ~25 routes in one 1.27 MB entry chunk to
// every viewer regardless of which single screen they opened, a real cost on the primary
// persona's phone-on-café-wifi connection. HomePage (index route) and LoginPage (the
// unauthenticated landing screen) stay eager — both are above-the-fold first paints, so
// lazy-loading them would trade a bundle-size win for a perceived-load regression.
// `withSuspense` wraps each split route's element with the app's one sanctioned loading
// grammar (LoadingShell, state-kit.tsx) — router.tsx-local, no app-shell.tsx change needed.
const TasksLayout = lazy(() => import('./pages/tasks-layout').then((m) => ({ default: m.TasksLayout })))
const FollowUpsPage = lazy(() => import('./pages/follow-ups-page').then((m) => ({ default: m.FollowUpsPage })))
const FollowUpRecordPage = lazy(() =>
  import('./pages/follow-up-record-page').then((m) => ({ default: m.FollowUpRecordPage })),
)
const TaskDrawer = lazy(() => import('./components/tasks/task-drawer').then((m) => ({ default: m.TaskDrawer })))
const InboxPage = lazy(() => import('./pages/inbox-page').then((m) => ({ default: m.InboxPage })))
const CafeOpeningPage = lazy(() => import('./pages/cafe-opening-page').then((m) => ({ default: m.CafeOpeningPage })))
const KitchenLogPage = lazy(() => import('./pages/kitchen-log-page').then((m) => ({ default: m.KitchenLogPage })))
const KitchenPlanPage = lazy(() => import('./pages/kitchen-plan-page').then((m) => ({ default: m.KitchenPlanPage })))
const KitchenReviewPage = lazy(() =>
  import('./pages/kitchen-review-page').then((m) => ({ default: m.KitchenReviewPage })),
)
const KitchenStockPage = lazy(() => import('./pages/kitchen-stock-page').then((m) => ({ default: m.KitchenStockPage })))
const KitchenPushesPage = lazy(() =>
  import('./pages/kitchen-pushes-page').then((m) => ({ default: m.KitchenPushesPage })),
)
const AdminUsersPage = lazy(() => import('./pages/admin-users-page').then((m) => ({ default: m.AdminUsersPage })))
const ObjectivesPage = lazy(() => import('./pages/objectives-page').then((m) => ({ default: m.ObjectivesPage })))
const ProjectsProcessesPage = lazy(() =>
  import('./pages/projects-processes-page').then((m) => ({ default: m.ProjectsProcessesPage })),
)
const DashboardPage = lazy(() => import('./pages/dashboard-page').then((m) => ({ default: m.DashboardPage })))
const BudgetPage = lazy(() => import('./pages/budget-page').then((m) => ({ default: m.BudgetPage })))
const PricingPage = lazy(() => import('./pages/pricing-page').then((m) => ({ default: m.PricingPage })))
const SliceStubPage = lazy(() => import('./pages/slice-stub-page').then((m) => ({ default: m.SliceStubPage })))
const ProfilePage = lazy(() => import('@/pages/profile-page').then((m) => ({ default: m.ProfilePage })))
const EventsPage = lazy(() => import('./pages/events-page').then((m) => ({ default: m.EventsPage })))
const SignalsArchivePage = lazy(() =>
  import('./pages/signals-archive-page').then((m) => ({ default: m.SignalsArchivePage })),
)
const SignalRecordPage = lazy(() =>
  import('./pages/signals-archive-page').then((m) => ({ default: m.SignalRecordPage })),
)
const NotFoundPage = lazy(() => import('./pages/not-found-page').then((m) => ({ default: m.NotFoundPage })))
const RecoveryPage = lazy(() => import('./pages/recovery-page').then((m) => ({ default: m.RecoveryPage })))
const UiGallery = lazy(() => import('./pages/ui-gallery').then((m) => ({ default: m.UiGallery })))
const DevViewsPage = lazy(() => import('./pages/dev-views-page').then((m) => ({ default: m.DevViewsPage })))

function withSuspense(element: ReactNode) {
  return <Suspense fallback={<LoadingShell />}>{element}</Suspense>
}

// Route layout (Redesign Step 2 — the IA move):
// / (RedirectIfAuthed gate) — unauthenticated users
//   /login        → LoginPage
//   /recovery     → RecoveryPage
// / (ProtectedRoute gate) — authenticated viewers only
//   AppShell (layout route — rail + header + context-row + drawer, persistent across nav)
//     /                        → HomePage (index) — ADR-0019 D2/D3
//     /work/tasks              → TasksLayout (split-view shell — persistent table + <Outlet> drawer)
//       /work/tasks/new        → TaskDrawer (create mode)
//       /work/tasks/:taskId    → TaskDrawer (view mode)
//     /work/signals             → SignalsArchivePage (Signals archive/search; ?record=<id> opens the shared RecordPanelHost drawer)
//       /work/signals/:signalId → SignalRecordPage (full canonical record page — OD-63; ?record= hard-loads redirect here)
//     /work/projects           → ProjectsProcessesPage (RequireCapability workline.manage)
//     /work/objectives         → ObjectivesPage (no read gate — OD-V4-1; write behind can('objective.manage'))
//     /events                   → EventsPage (Step 10 — job sentence + sanctioned empty state)
//     /ecommerce /roastery /profile → SliceStubPage (later steps)
//     /money/*                 → Money page (DashboardPage)/Budget/Pricing (RequireAccessRole finance/admin);
//                                /dashboard + /sales are legacy redirect aliases → /money
//     /inbox                   → InboxPage (always live)
//     /cafe                    → CafeOpeningPage (Step 7 — "Start today's opening" home, RATIFY-7D)
//     /cafe/*                  → Kitchen* pages (re-homed from /kitchen/*)
//     /admin/people            → AdminUsersPage (AdminRoute)
//     + redirect map from every old route (§7)
//     *                        → NotFoundPage
//
// basename: '/mos' matches the Caddy/Vite base (OD-P0-5).
// replace on every redirect so Back does not re-enter (FR-012 back-guard).
// No chained redirects (spec §16): each old route maps directly to its final canonical route.

// Preserve ?view=/?record= across a redirect (FR-009). Route plumbing, not a new surface (Rule 11).
export function SearchRedirect({ to }: { to: string }) {
  const { search } = useLocation()
  return <Navigate to={{ pathname: to, search }} replace />
}
// /tasks/:taskId → /work/tasks/:taskId (preserve param + query).
export function TasksIdRedirect() {
  const { taskId } = useParams()
  const { search } = useLocation()
  return <Navigate to={{ pathname: `/work/tasks/${taskId}`, search }} replace />
}

// eslint-disable-next-line react-refresh/only-export-components -- exported for route-table tests
export const routeConfig: RouteObject[] = [
  // DEV-only primitives gallery (AC-147). Bare route — no auth gate, no shell.
  ...(import.meta.env.DEV
    ? [{ path: '/dev/ui', element: withSuspense(<UiGallery />), handle: v3Infrastructure('dev-only') }]
    : []),
  {
    element: <RedirectIfAuthed />,
    errorElement: <RouteErrorBoundary />,
    handle: v3Infrastructure('auth'),
    children: [
      // LoginPage stays eager (above-the-fold first paint for logged-out users).
      { path: '/login', element: <LoginPage />, handle: v3Infrastructure('public') },
      { path: '/recovery', element: withSuspense(<RecoveryPage />), handle: v3Infrastructure('public') },
    ],
  },
  {
    element: <ProtectedRoute />,
    errorElement: <RouteErrorBoundary />,
    handle: v3Infrastructure('auth'),
    children: [
      {
        element: <AppShell />,
        handle: v3Infrastructure('layout'),
        children: [
          { index: true, element: <HomePage />, handle: v3Page('workspace') },

          // ── Work (canonical) ──
          { path: 'work', element: <Navigate to="/work/tasks" replace />, handle: v3Redirect('/work/tasks') },
          {
            path: 'work/tasks',
            element: withSuspense(<TasksLayout />),
            handle: v3Page('workspace'),
            children: [
              { path: 'new', element: withSuspense(<TaskDrawer mode="create" />), handle: v3Page('focused-record') },
              { path: ':taskId', element: withSuspense(<TaskDrawer mode="view" />), handle: v3Page('focused-record') },
            ],
          },
          { path: 'work/signals', element: withSuspense(<SignalsArchivePage />), handle: v3Page('workspace') },
          { path: 'work/signals/:signalId', element: withSuspense(<SignalRecordPage />), handle: v3Page('focused-record') },
          { path: 'work/projects-processes', element: <SearchRedirect to="/work/projects" />, handle: v3Redirect('/work/projects') },
          {
            element: <RequireCapability capability="workline.manage" />,
            handle: v3Infrastructure('capability'),
            children: [{ path: 'work/projects', element: withSuspense(<ProjectsProcessesPage />), handle: v3Page('management') }],
          },
          // OD-V4-1 (owner-ratified 2026-07-27, docs/v4-inheritance.md INC-1): "Objectives are
          // visible to everyone" — NO RequireCapability read gate. mos.objectives SELECT RLS has
          // no role check (only org_id tenancy), so gating the route hid a screen RLS already let
          // every authenticated viewer read (the bug: a direct hit on /work/objectives silently
          // redirected to /work/tasks). Write (create/rename/archive) stays behind
          // `can('objective.manage')` inside ObjectivesPage's own mutation handlers.
          { path: 'work/objectives', element: withSuspense(<ObjectivesPage />), handle: v3Page('management') },
          { path: 'work/cascade', element: <Navigate to="/work/tasks" replace />, handle: v3Redirect('/work/tasks') },
          { path: 'work/follow-ups', element: <Navigate to="/work/tasks?view=followups" replace />, handle: v3Redirect('/work/tasks?view=followups') },
          // The follow-up RECORD door (focused-record) — the canonical FollowUpRecordHost via
          // the shared RecordViewer, not the queue page's bespoke in-flow aside (audit fix).
          { path: 'work/follow-ups/:id', element: SHOW_FOLLOWUPS ? withSuspense(<FollowUpRecordPage />) : <Navigate to="/" replace />, handle: v3Page('focused-record') },

          // ── Events / Money / Inbox (canonical) ──
          { path: 'events', element: withSuspense(<EventsPage />), handle: v3Page('workspace') },
          {
            element: <RequireAccessRole anyOf={['finance', 'admin']} />,
            handle: v3Infrastructure('capability'),
            children: [
              { path: 'money', element: withSuspense(<DashboardPage />), handle: v3Page('workspace') },
              { path: 'money/detail', element: withSuspense(<DashboardPage defaultTab="detail" />), handle: v3Page('workspace') },
              { path: 'money/budget', element: SHOW_PLAN_BUDGET ? withSuspense(<BudgetPage />) : <Navigate to="/" replace />, handle: v3Page('workspace') },
              { path: 'money/pricing', element: SHOW_PLAN_BUDGET ? withSuspense(<PricingPage />) : <Navigate to="/" replace />, handle: v3Page('workspace') },
              // R-OWNER-5 (provisional Director ruling): the follow-ups QUEUE is a workspace
              // destination — it renders a record count + overdue meta, which is workspace grammar.
              // The follow-up RECORD (/work/follow-ups/:id) stays focused-record.
              { path: 'money/follow-ups', element: SHOW_FOLLOWUPS ? withSuspense(<FollowUpsPage />) : <Navigate to="/" replace />, handle: v3Page('workspace') },
            ],
          },
          { path: 'inbox', element: withSuspense(<InboxPage />), handle: v3Page('workspace') },

          // ── Café (Kitchen re-homed, OD-15; Step 7 RATIFY-7D — /cafe hosts the opening home) ──
          { path: 'cafe', element: withSuspense(<CafeOpeningPage />), handle: v3Page('workspace') },
          { path: 'cafe/log', element: withSuspense(<KitchenLogPage />), handle: v3Page('workspace') },
          { path: 'cafe/plan', element: withSuspense(<KitchenPlanPage />), handle: v3Page('workspace') },
          { path: 'cafe/stock', element: withSuspense(<KitchenStockPage />), handle: v3Page('workspace') },
          {
            element: <RequireAccessRole anyOf={['ops_lead', 'admin']} />,
            handle: v3Infrastructure('capability'),
            children: [
              { path: 'cafe/review', element: withSuspense(<KitchenReviewPage />), handle: v3Page('workspace') },
              { path: 'cafe/pushes', element: withSuspense(<KitchenPushesPage />), handle: v3Page('workspace') },
            ],
          },

          // ── Ecommerce / Roastery / Profile (stubs) ──
          { path: 'ecommerce', element: withSuspense(<SliceStubPage jobKey="job.ecommerce" nameKey="dest.ecommerce" />), handle: v3Page('workspace') },
          { path: 'roastery', element: withSuspense(<SliceStubPage jobKey="job.roastery" nameKey="dest.roastery" />), handle: v3Page('workspace') },
          { path: 'profile', element: withSuspense(<ProfilePage />), handle: v3Page('management') }, // OD-70: real page (language selection lives here)

          // ── Admin (canonical; /admin → /admin/people) ──
          { path: 'admin', element: <Navigate to="/admin/people" replace />, handle: v3Redirect('/admin/people') },
          {
            element: <AdminRoute />,
            handle: v3Infrastructure('capability'),
            children: [{ path: 'admin/people', element: withSuspense(<AdminUsersPage />), handle: v3Page('management') }],
          },

          // ADR-0018 P1 — view-composition dev harness (DEV + SHOW_USER_VIEWS).
          {
            path: 'dev/views',
            element: import.meta.env.DEV && SHOW_USER_VIEWS ? withSuspense(<DevViewsPage />) : <Navigate to="/" replace />,
            handle: v3Infrastructure('dev-only'),
          },
          {
            path: 'dev/views/:viewId',
            element: import.meta.env.DEV && SHOW_USER_VIEWS ? withSuspense(<DevViewsPage />) : <Navigate to="/" replace />,
            handle: v3Infrastructure('dev-only'),
          },

          // ── Redirects from every old route (FR-009/010, spec §7) ──
          { path: 'tasks', element: <SearchRedirect to="/work/tasks" />, handle: v3Redirect('/work/tasks') },
          { path: 'tasks/new', element: <SearchRedirect to="/work/tasks/new" />, handle: v3Redirect('/work/tasks/new') },
          { path: 'tasks/:taskId', element: <TasksIdRedirect />, handle: v3Redirect('/work/tasks/:taskId') },
          { path: 'updates', element: <Navigate to="/work/signals" replace />, handle: v3Redirect('/work/signals') },
          { path: 'ops', element: <Navigate to="/" replace />, handle: v3Redirect('/') },
          { path: 'ops/new', element: <Navigate to="/" replace />, handle: v3Redirect('/') },
          { path: 'ops/:id/edit', element: <Navigate to="/" replace />, handle: v3Redirect('/') },
          { path: 'kitchen', element: <Navigate to="/cafe" replace />, handle: v3Redirect('/cafe') },
          { path: 'kitchen/log', element: <SearchRedirect to="/cafe/log" />, handle: v3Redirect('/cafe/log') },
          { path: 'kitchen/plan', element: <SearchRedirect to="/cafe/plan" />, handle: v3Redirect('/cafe/plan') },
          { path: 'kitchen/stock', element: <SearchRedirect to="/cafe/stock" />, handle: v3Redirect('/cafe/stock') },
          { path: 'kitchen/review', element: <SearchRedirect to="/cafe/review" />, handle: v3Redirect('/cafe/review') },
          { path: 'kitchen/pushes', element: <SearchRedirect to="/cafe/pushes" />, handle: v3Redirect('/cafe/pushes') },
          { path: 'objectives', element: <SearchRedirect to="/work/objectives" />, handle: v3Redirect('/work/objectives') },
          { path: 'projects-processes', element: <SearchRedirect to="/work/projects" />, handle: v3Redirect('/work/projects') },
          { path: 'dashboard', element: <SearchRedirect to="/money" />, handle: v3Redirect('/money') },
          { path: 'dashboard/detail', element: <SearchRedirect to="/money/detail" />, handle: v3Redirect('/money/detail') },
          // /sales → /money directly (no chained redirect via /dashboard — spec §16).
          { path: 'sales', element: <SearchRedirect to="/money" />, handle: v3Redirect('/money') },
          { path: 'plan/budget', element: <SearchRedirect to="/money/budget" />, handle: v3Redirect('/money/budget') },
          { path: 'plan/pricing', element: <SearchRedirect to="/money/pricing" />, handle: v3Redirect('/money/pricing') },

          { path: '*', element: withSuspense(<NotFoundPage />), handle: v3Infrastructure('not-found') },
        ],
      },
    ],
  },
]

// eslint-disable-next-line react-refresh/only-export-components -- app router singleton
export const router = createBrowserRouter(routeConfig, { basename: '/mos' })
