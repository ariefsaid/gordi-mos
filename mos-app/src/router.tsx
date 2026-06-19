import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom'
import { SHOW_WEEKLY_UPDATES, SHOW_DAILY_LOG } from './config/features'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { RedirectIfAuthed } from './auth/RedirectIfAuthed'
import AppShell from './shell/AppShell'
import MyWeek from './pages/MyWeek'
import TasksLayout from './pages/TasksLayout'
import TaskDrawer from './components/tasks/TaskDrawer'
import UpdatesPage from './pages/UpdatesPage'
import OpsPage from './pages/OpsPage'
import OpsAddForm from './pages/OpsAddForm'
import NotFoundPage from './pages/NotFoundPage'
import LoginPage from './pages/LoginPage'
import RecoveryPage from './pages/RecoveryPage'
import { UiGallery } from './pages/UiGallery'

// Route layout:
// / (RedirectIfAuthed gate) — unauthenticated users can access these
//   /login        → LoginPage
//   /recovery     → RecoveryPage
// / (ProtectedRoute gate) — authenticated viewers only
//   AppShell (layout route — rail + header + drawer, persistent across nav)
//     /           → MyWeek (index)
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
          { index: true, element: <MyWeek /> },
          {
            path: 'tasks',
            element: <TasksLayout />,
            children: [
              { path: 'new', element: <TaskDrawer mode="create" /> },
              { path: ':taskId', element: <TaskDrawer mode="view" /> },
            ],
          },
          // Flag-hidden for the first rollout (config/features.ts): the routes stay mounted
          // but redirect to My Week so a stale deep-link can't reach a hidden section.
          { path: 'updates', element: SHOW_WEEKLY_UPDATES ? <UpdatesPage /> : <Navigate to="/" replace /> },
          { path: 'ops', element: SHOW_DAILY_LOG ? <OpsPage /> : <Navigate to="/" replace /> },
          { path: 'ops/new', element: SHOW_DAILY_LOG ? <OpsAddForm /> : <Navigate to="/" replace /> },
          { path: 'ops/:id/edit', element: SHOW_DAILY_LOG ? <OpsAddForm /> : <Navigate to="/" replace /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]

export const router = createBrowserRouter(routeConfig, { basename: '/mos' })
