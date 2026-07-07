import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom'
import { SHOW_WEEKLY_UPDATES, SHOW_DAILY_LOG, SHOW_USER_VIEWS, SHOW_INBOX, SHOW_HOME_STACKED, SHOW_FOLLOWUPS } from './config/features'
import { ProtectedRoute } from './auth/protected-route'
import { AdminRoute } from './auth/admin-route'
import { RequireAccessRole } from './auth/require-access-role'
import { RequireCapability } from './auth/require-capability'
import { RedirectIfAuthed } from './auth/redirect-if-authed'
import { AppShell } from './shell/app-shell'
import { HomePage } from './pages/home-page'
import { StackedUnionHome } from './pages/stacked-union-home'
import { TasksLayout } from './pages/tasks-layout'
import { CascadePage } from './pages/cascade-page'
import { FollowUpsPage } from './pages/follow-ups-page'
import { TaskDrawer } from './components/tasks/task-drawer'
import { UpdatesPage } from './pages/updates-page'
import { OpsPage } from './pages/ops-page'
import { InboxPage } from './pages/inbox-page'
import { OpsAddForm } from './pages/ops-add-form'
import { KitchenLogPage } from './pages/kitchen-log-page'
import { KitchenPlanPage } from './pages/kitchen-plan-page'
import { KitchenReviewPage } from './pages/kitchen-review-page'
import { KitchenStockPage } from './pages/kitchen-stock-page'
import { KitchenPushesPage } from './pages/kitchen-pushes-page'
import { AdminUsersPage } from './pages/admin-users-page'
import { ObjectivesPage } from './pages/objectives-page'
import { ProjectsProcessesPage } from './pages/projects-processes-page'
import { SalesDashboardPage } from './pages/sales-dashboard-page'
import { NotFoundPage } from './pages/not-found-page'
import { LoginPage } from './pages/login-page'
import { RecoveryPage } from './pages/recovery-page'
import { UiGallery } from './pages/ui-gallery'
import { DevViewsPage } from './pages/dev-views-page'

// Route layout:
// / (RedirectIfAuthed gate) — unauthenticated users can access these
//   /login        → LoginPage
//   /recovery     → RecoveryPage
// / (ProtectedRoute gate) — authenticated viewers only
//   AppShell (layout route — rail + header + drawer, persistent across nav)
//     /           → HomePage (index) — ADR-0019 D2/D3; MyWeek survives as a component
//                   (rendered inline via MyWeekPanel) but is no longer routed here.
//     /tasks      → TasksLayout (ADR-0007 split-view shell — persistent table + <Outlet> drawer)
//                     (index)        → table full width (.split.nodrawer)
//       /tasks/new      → TaskDrawer (create mode, beside the table)
//       /tasks/:taskId  → TaskDrawer (view mode, beside the table)
//     /updates    → UpdatesPage
//     /ops        → OpsPage (Daily Log)
//     /ops/new    → OpsAddForm (add log entry)
//     /ops/:id/edit → OpsAddForm (edit log entry, pre-filled)
//     *           → NotFoundPage (catch-all)
//
// basename: '/mos' matches the Caddy/Vite base (OD-P0-5).
// replace on every redirect so Back does not re-enter (FR-012 back-guard).
export const routeConfig: RouteObject[] = [
  // DEV-only primitives gallery (AC-147). Bare route — no auth gate, no shell —
  // for design review. Stripped from the production build via import.meta.env.DEV.
  ...(import.meta.env.DEV
    ? [{ path: '/dev/ui', element: <UiGallery /> }]
    : []),
  {
    element: <RedirectIfAuthed />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/recovery', element: <RecoveryPage /> },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: SHOW_HOME_STACKED ? <StackedUnionHome /> : <HomePage /> },
          // Issue E — DEV-only preview of the stacked-union Home, reachable regardless of the
          // SHOW_HOME_STACKED flag so e2e + visual verification is deterministic. Production `/`
          // still branches on the flag (above). Stripped from the production build via DEV.
          ...(import.meta.env.DEV
            ? [{ path: '__home-stacked', element: <StackedUnionHome /> }]
            : []),
          {
            path: 'tasks',
            element: <TasksLayout />,
            children: [
              { path: 'new', element: <TaskDrawer mode="create" /> },
              { path: ':taskId', element: <TaskDrawer mode="view" /> },
            ],
          },
          { path: 'work/cascade', element: <CascadePage /> },
          { path: 'work/follow-ups', element: SHOW_FOLLOWUPS ? <FollowUpsPage /> : <Navigate to="/" replace /> },
          // Flag-hidden for the first rollout (config/features.ts): the routes stay mounted
          // but redirect to My Week so a stale deep-link can't reach a hidden section.
          { path: 'updates', element: SHOW_WEEKLY_UPDATES ? <UpdatesPage /> : <Navigate to="/" replace /> },
          { path: 'ops', element: SHOW_DAILY_LOG ? <OpsPage /> : <Navigate to="/" replace /> },
          { path: 'inbox', element: SHOW_INBOX ? <InboxPage /> : <Navigate to="/" replace /> },
          { path: 'ops/new', element: SHOW_DAILY_LOG ? <OpsAddForm /> : <Navigate to="/" replace /> },
          { path: 'ops/:id/edit', element: SHOW_DAILY_LOG ? <OpsAddForm /> : <Navigate to="/" replace /> },
          // Kitchen Module (S1 — Log capture; S2 — Plan editor (ops_lead/admin) +
          // read-only "pesanan" horizon (member); S3 — Review/approve queue, ops_lead/admin;
          // S4 — Stock view, read-only, any authed member;
          // S5 — Pushes/outbox, ops_lead/admin, read-only dead-letter monitoring)
          { path: 'kitchen/log', element: <KitchenLogPage /> },
          { path: 'kitchen/plan', element: <KitchenPlanPage /> },
          { path: 'kitchen/review', element: <KitchenReviewPage /> },
          { path: 'kitchen/stock', element: <KitchenStockPage /> },
          { path: 'kitchen/pushes', element: <KitchenPushesPage /> },
          // Admin module (FR-001, AC-070). AdminRoute bounces non-admins to /.
          // RLS / RPC authz is the real security boundary (ADR-0011 D5).
          {
            element: <AdminRoute />,
            children: [{ path: 'admin/people', element: <AdminUsersPage /> }],
          },
          // Cascade catalog = Work's manage-mode (nav-five-destinations FR-421). The retired
          // top-level paths redirect into the cascade (decisions.md: "direct visits redirect into
          // it"); the manage pages are relocated under /work/ behind RequireCapability (which
          // bounces non-holders to /work/cascade). Page components are reused unchanged (NFR-404).
          { path: 'objectives', element: <Navigate to="/work/cascade" replace /> },
          { path: 'projects-processes', element: <Navigate to="/work/cascade" replace /> },
          {
            element: <RequireCapability capability="objective.manage" />,
            children: [{ path: 'work/objectives', element: <ObjectivesPage /> }],
          },
          {
            element: <RequireCapability capability="workline.manage" />,
            children: [{ path: 'work/projects-processes', element: <ProjectsProcessesPage /> }],
          },
          // Sales dashboard (Issue 1, reporting read-model). FR-001/AC-001/002:
          // finance/admin only; RequireAccessRole bounces non-permitted viewers to /.
          // RLS on reporting.sales_daily_revenue is the real security boundary.
          {
            element: <RequireAccessRole anyOf={['finance', 'admin']} />,
            children: [{ path: 'sales', element: <SalesDashboardPage /> }],
          },
          // ADR-0018 P1 — view-composition dev harness (zero-agent proof). DEV-only +
          // feature-flagged; redirects to / otherwise. Auth-gated by ProtectedRoute (reads/
          // writes user_views via the viewer's own JWT — RLS is the real security boundary).
          {
            path: 'dev/views',
            element: import.meta.env.DEV && SHOW_USER_VIEWS ? <DevViewsPage /> : <Navigate to="/" replace />,
          },
          {
            path: 'dev/views/:viewId',
            element: import.meta.env.DEV && SHOW_USER_VIEWS ? <DevViewsPage /> : <Navigate to="/" replace />,
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]

export const router = createBrowserRouter(routeConfig, { basename: '/mos' })
