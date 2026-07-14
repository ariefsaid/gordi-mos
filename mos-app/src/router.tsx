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
import { NotFoundPage } from './pages/not-found-page'
import { LoginPage } from './pages/login-page'
import { RecoveryPage } from './pages/recovery-page'
import { UiGallery } from './pages/ui-gallery'
import { DevViewsPage } from './pages/dev-views-page'
import { RouteErrorBoundary } from './components/RouteErrorBoundary'

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
//     /work/signals            → SliceStubPage (Signals archive — Step 4)
//     /work/projects           → ProjectsProcessesPage (RequireCapability workline.manage)
//     /work/objectives         → ObjectivesPage (RequireCapability objective.manage)
//     /events /ecommerce /roastery /profile → SliceStubPage (later steps)
//     /money/*                 → DashboardPage/Budget/Pricing (RequireAccessRole finance/admin)
//     /inbox                   → InboxPage (always live)
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
    ? [{ path: '/dev/ui', element: <UiGallery /> }]
    : []),
  {
    element: <RedirectIfAuthed />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/recovery', element: <RecoveryPage /> },
    ],
  },
  {
    element: <ProtectedRoute />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: SHOW_HOME_STACKED ? <StackedUnionHome /> : <HomePage /> },
          ...(import.meta.env.DEV
            ? [{ path: '__home-stacked', element: <StackedUnionHome /> }]
            : []),

          // ── Work (canonical) ──
          { path: 'work', element: <Navigate to="/work/tasks" replace /> },
          {
            path: 'work/tasks',
            element: <TasksLayout />,
            children: [
              { path: 'new', element: <TaskDrawer mode="create" /> },
              { path: ':taskId', element: <TaskDrawer mode="view" /> },
            ],
          },
          { path: 'work/signals', element: <SliceStubPage jobKey="job.signals" name="Signals" /> },
          { path: 'work/projects-processes', element: <Navigate to="/work/projects" replace /> },
          {
            element: <RequireCapability capability="workline.manage" />,
            children: [{ path: 'work/projects', element: <ProjectsProcessesPage /> }],
          },
          {
            element: <RequireCapability capability="objective.manage" />,
            children: [{ path: 'work/objectives', element: <ObjectivesPage /> }],
          },
          { path: 'work/cascade', element: <Navigate to="/work/tasks" replace /> },
          { path: 'work/follow-ups', element: <Navigate to="/work/tasks?view=followups" replace /> },
          { path: 'work/follow-ups/:id', element: SHOW_FOLLOWUPS ? <FollowUpsPage /> : <Navigate to="/" replace /> },

          // ── Events / Money / Inbox (canonical) ──
          { path: 'events', element: <SliceStubPage jobKey="job.events" name="Events" /> },
          {
            element: <RequireAccessRole anyOf={['finance', 'admin']} />,
            children: [
              { path: 'money', element: <DashboardPage /> },
              { path: 'money/detail', element: <DashboardPage defaultTab="detail" /> },
              { path: 'money/budget', element: SHOW_PLAN_BUDGET ? <BudgetPage /> : <Navigate to="/" replace /> },
              { path: 'money/pricing', element: SHOW_PLAN_BUDGET ? <PricingPage /> : <Navigate to="/" replace /> },
            ],
          },
          { path: 'inbox', element: <InboxPage /> },

          // ── Café (Kitchen re-homed, OD-15) ──
          { path: 'cafe', element: <Navigate to="/cafe/log" replace /> },
          { path: 'cafe/log', element: <KitchenLogPage /> },
          { path: 'cafe/plan', element: <KitchenPlanPage /> },
          { path: 'cafe/stock', element: <KitchenStockPage /> },
          {
            element: <RequireAccessRole anyOf={['ops_lead', 'admin']} />,
            children: [
              { path: 'cafe/review', element: <KitchenReviewPage /> },
              { path: 'cafe/pushes', element: <KitchenPushesPage /> },
            ],
          },

          // ── Ecommerce / Roastery / Profile (stubs) ──
          { path: 'ecommerce', element: <SliceStubPage jobKey="job.ecommerce" name="Ecommerce" /> },
          { path: 'roastery', element: <SliceStubPage jobKey="job.roastery" name="Roastery" /> },
          { path: 'profile', element: <SliceStubPage jobKey="job.profile" name="Personal Profile" /> },

          // ── Admin (canonical; /admin → /admin/people) ──
          { path: 'admin', element: <Navigate to="/admin/people" replace /> },
          {
            element: <AdminRoute />,
            children: [{ path: 'admin/people', element: <AdminUsersPage /> }],
          },

          // ADR-0018 P1 — view-composition dev harness (DEV + SHOW_USER_VIEWS).
          {
            path: 'dev/views',
            element: import.meta.env.DEV && SHOW_USER_VIEWS ? <DevViewsPage /> : <Navigate to="/" replace />,
          },
          {
            path: 'dev/views/:viewId',
            element: import.meta.env.DEV && SHOW_USER_VIEWS ? <DevViewsPage /> : <Navigate to="/" replace />,
          },

          // ── Redirects from every old route (FR-009/010, spec §7) ──
          { path: 'tasks', element: <SearchRedirect to="/work/tasks" /> },
          { path: 'tasks/new', element: <SearchRedirect to="/work/tasks/new" /> },
          { path: 'tasks/:taskId', element: <TasksIdRedirect /> },
          { path: 'updates', element: <Navigate to="/work/signals" replace /> },
          { path: 'ops', element: <Navigate to="/" replace /> },
          { path: 'ops/new', element: <Navigate to="/" replace /> },
          { path: 'ops/:id/edit', element: <Navigate to="/" replace /> },
          { path: 'kitchen', element: <Navigate to="/cafe" replace /> },
          { path: 'kitchen/log', element: <SearchRedirect to="/cafe/log" /> },
          { path: 'kitchen/plan', element: <SearchRedirect to="/cafe/plan" /> },
          { path: 'kitchen/stock', element: <SearchRedirect to="/cafe/stock" /> },
          { path: 'kitchen/review', element: <SearchRedirect to="/cafe/review" /> },
          { path: 'kitchen/pushes', element: <SearchRedirect to="/cafe/pushes" /> },
          { path: 'objectives', element: <Navigate to="/work/objectives" replace /> },
          { path: 'projects-processes', element: <Navigate to="/work/projects" replace /> },
          { path: 'dashboard', element: <SearchRedirect to="/money" /> },
          { path: 'dashboard/detail', element: <SearchRedirect to="/money/detail" /> },
          // /sales → /money directly (no chained redirect via /dashboard — spec §16).
          { path: 'sales', element: <SearchRedirect to="/money" /> },
          { path: 'plan/budget', element: <SearchRedirect to="/money/budget" /> },
          { path: 'plan/pricing', element: <SearchRedirect to="/money/pricing" /> },

          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]

// eslint-disable-next-line react-refresh/only-export-components -- app router singleton
export const router = createBrowserRouter(routeConfig, { basename: '/mos' })
