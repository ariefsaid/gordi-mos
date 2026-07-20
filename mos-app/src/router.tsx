import { createBrowserRouter, Navigate, useLocation, useParams, type RouteObject } from 'react-router-dom'
import { SHOW_USER_VIEWS, SHOW_HOME_STACKED, SHOW_FOLLOWUPS, SHOW_PLAN_BUDGET } from './config/features'
import { ProtectedRoute } from './auth/protected-route'
import { AdminRoute } from './auth/admin-route'
import { RequireAccessRole } from './auth/require-access-role'
import { RequireCapability } from './auth/require-capability'
import { RedirectIfAuthed } from './auth/redirect-if-authed'
import { AppShell } from './shell/app-shell'
import { HomePage } from './pages/home-page'
import { StackedUnionHome } from './pages/stacked-union-home'
import { TasksLayout } from './pages/tasks-layout'
import { FollowUpsPage } from './pages/follow-ups-page'
import { TaskDrawer } from './components/tasks/task-drawer'
import { InboxPage } from './pages/inbox-page'
import { CafeOpeningPage } from './pages/cafe-opening-page'
import { KitchenLogPage } from './pages/kitchen-log-page'
import { KitchenPlanPage } from './pages/kitchen-plan-page'
import { KitchenReviewPage } from './pages/kitchen-review-page'
import { KitchenStockPage } from './pages/kitchen-stock-page'
import { KitchenPushesPage } from './pages/kitchen-pushes-page'
import { AdminUsersPage } from './pages/admin-users-page'
import { ObjectivesPage } from './pages/objectives-page'
import { ProjectsProcessesPage } from './pages/projects-processes-page'
import { DashboardPage } from './pages/dashboard-page'
import { BudgetPage } from './pages/budget-page'
import { PricingPage } from './pages/pricing-page'
import { SliceStubPage } from './pages/slice-stub-page'
import { ProfilePage } from '@/pages/profile-page'
import { EventsPage } from './pages/events-page'
import { SignalsArchivePage, SignalRecordPage } from './pages/signals-archive-page'
import { NotFoundPage } from './pages/not-found-page'
import { LoginPage } from './pages/login-page'
import { RecoveryPage } from './pages/recovery-page'
import { UiGallery } from './pages/ui-gallery'
import { DevViewsPage } from './pages/dev-views-page'
import { RouteErrorBoundary } from './components/RouteErrorBoundary'
import { v3Infrastructure, v3Page, v3Redirect } from './shell/route-classification'

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
//     /work/objectives         → ObjectivesPage (RequireCapability objective.manage)
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
    ? [{ path: '/dev/ui', element: <UiGallery />, handle: v3Infrastructure('dev-only') }]
    : []),
  {
    element: <RedirectIfAuthed />,
    errorElement: <RouteErrorBoundary />,
    handle: v3Infrastructure('auth'),
    children: [
      { path: '/login', element: <LoginPage />, handle: v3Infrastructure('public') },
      { path: '/recovery', element: <RecoveryPage />, handle: v3Infrastructure('public') },
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
          { index: true, element: SHOW_HOME_STACKED ? <StackedUnionHome /> : <HomePage />, handle: v3Page('workspace') },
          ...(import.meta.env.DEV
            ? [{ path: '__home-stacked', element: <StackedUnionHome />, handle: v3Infrastructure('dev-only') }]
            : []),

          // ── Work (canonical) ──
          { path: 'work', element: <Navigate to="/work/tasks" replace />, handle: v3Redirect('/work/tasks') },
          {
            path: 'work/tasks',
            element: <TasksLayout />,
            handle: v3Page('workspace'),
            children: [
              { path: 'new', element: <TaskDrawer mode="create" />, handle: v3Page('focused-record') },
              { path: ':taskId', element: <TaskDrawer mode="view" />, handle: v3Page('focused-record') },
            ],
          },
          { path: 'work/signals', element: <SignalsArchivePage />, handle: v3Page('workspace') },
          { path: 'work/signals/:signalId', element: <SignalRecordPage />, handle: v3Page('focused-record') },
          { path: 'work/projects-processes', element: <SearchRedirect to="/work/projects" />, handle: v3Redirect('/work/projects') },
          {
            element: <RequireCapability capability="workline.manage" />,
            handle: v3Infrastructure('capability'),
            children: [{ path: 'work/projects', element: <ProjectsProcessesPage />, handle: v3Page('management') }],
          },
          {
            element: <RequireCapability capability="objective.manage" />,
            handle: v3Infrastructure('capability'),
            children: [{ path: 'work/objectives', element: <ObjectivesPage />, handle: v3Page('management') }],
          },
          { path: 'work/cascade', element: <Navigate to="/work/tasks" replace />, handle: v3Redirect('/work/tasks') },
          { path: 'work/follow-ups', element: <Navigate to="/work/tasks?view=followups" replace />, handle: v3Redirect('/work/tasks?view=followups') },
          { path: 'work/follow-ups/:id', element: SHOW_FOLLOWUPS ? <FollowUpsPage /> : <Navigate to="/" replace />, handle: v3Page('focused-record') },

          // ── Events / Money / Inbox (canonical) ──
          { path: 'events', element: <EventsPage />, handle: v3Page('workspace') },
          {
            element: <RequireAccessRole anyOf={['finance', 'admin']} />,
            handle: v3Infrastructure('capability'),
            children: [
              { path: 'money', element: <DashboardPage />, handle: v3Page('workspace') },
              { path: 'money/detail', element: <DashboardPage defaultTab="detail" />, handle: v3Page('workspace') },
              { path: 'money/budget', element: SHOW_PLAN_BUDGET ? <BudgetPage /> : <Navigate to="/" replace />, handle: v3Page('workspace') },
              { path: 'money/pricing', element: SHOW_PLAN_BUDGET ? <PricingPage /> : <Navigate to="/" replace />, handle: v3Page('workspace') },
              { path: 'money/follow-ups', element: SHOW_FOLLOWUPS ? <FollowUpsPage /> : <Navigate to="/" replace />, handle: v3Page('focused-record') },
            ],
          },
          { path: 'inbox', element: <InboxPage />, handle: v3Page('workspace') },

          // ── Café (Kitchen re-homed, OD-15; Step 7 RATIFY-7D — /cafe hosts the opening home) ──
          { path: 'cafe', element: <CafeOpeningPage />, handle: v3Page('workspace') },
          { path: 'cafe/log', element: <KitchenLogPage />, handle: v3Page('workspace') },
          { path: 'cafe/plan', element: <KitchenPlanPage />, handle: v3Page('workspace') },
          { path: 'cafe/stock', element: <KitchenStockPage />, handle: v3Page('workspace') },
          {
            element: <RequireAccessRole anyOf={['ops_lead', 'admin']} />,
            handle: v3Infrastructure('capability'),
            children: [
              { path: 'cafe/review', element: <KitchenReviewPage />, handle: v3Page('workspace') },
              { path: 'cafe/pushes', element: <KitchenPushesPage />, handle: v3Page('workspace') },
            ],
          },

          // ── Ecommerce / Roastery / Profile (stubs) ──
          { path: 'ecommerce', element: <SliceStubPage jobKey="job.ecommerce" nameKey="dest.ecommerce" />, handle: v3Page('workspace') },
          { path: 'roastery', element: <SliceStubPage jobKey="job.roastery" nameKey="dest.roastery" />, handle: v3Page('workspace') },
          { path: 'profile', element: <ProfilePage />, handle: v3Page('management') }, // OD-70: real page (language selection lives here)

          // ── Admin (canonical; /admin → /admin/people) ──
          { path: 'admin', element: <Navigate to="/admin/people" replace />, handle: v3Redirect('/admin/people') },
          {
            element: <AdminRoute />,
            handle: v3Infrastructure('capability'),
            children: [{ path: 'admin/people', element: <AdminUsersPage />, handle: v3Page('management') }],
          },

          // ADR-0018 P1 — view-composition dev harness (DEV + SHOW_USER_VIEWS).
          {
            path: 'dev/views',
            element: import.meta.env.DEV && SHOW_USER_VIEWS ? <DevViewsPage /> : <Navigate to="/" replace />,
            handle: v3Infrastructure('dev-only'),
          },
          {
            path: 'dev/views/:viewId',
            element: import.meta.env.DEV && SHOW_USER_VIEWS ? <DevViewsPage /> : <Navigate to="/" replace />,
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

          { path: '*', element: <NotFoundPage />, handle: v3Infrastructure('not-found') },
        ],
      },
    ],
  },
]

// eslint-disable-next-line react-refresh/only-export-components -- app router singleton
export const router = createBrowserRouter(routeConfig, { basename: '/mos' })
