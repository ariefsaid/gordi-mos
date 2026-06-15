import { createBrowserRouter, type RouteObject } from 'react-router-dom'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { RedirectIfAuthed } from './auth/RedirectIfAuthed'
import AppShell from './shell/AppShell'
import MyWeek from './pages/MyWeek'
import TasksLayout from './pages/TasksLayout'
import TaskDetail from './pages/TaskDetail'
import TaskCreate from './pages/TaskCreate'
import UpdatesPage from './pages/UpdatesPage'
import OpsPage from './pages/OpsPage'
import OpsAddForm from './pages/OpsAddForm'
import NotFoundPage from './pages/NotFoundPage'
import LoginPage from './pages/LoginPage'
import RecoveryPage from './pages/RecoveryPage'

// Route layout:
// / (RedirectIfAuthed gate) — unauthenticated users can access these
//   /login        → LoginPage
//   /recovery     → RecoveryPage
// / (ProtectedRoute gate) — authenticated viewers only
//   AppShell (layout route — rail + header + drawer, persistent across nav)
//     /           → MyWeek (index)
//     /tasks      → TasksLayout (ADR-0007 nested parent)
//                     (index)        → list (TasksPage, via TasksLayout)
//       /tasks/new      → TaskCreate (P2-1c create form)
//       /tasks/:taskId  → TaskDetail (P2-1c detail)
//     /updates    → UpdatesPage
//     /ops        → OpsPage (Daily Log)
//     /ops/new    → OpsAddForm (add log entry)
//     /ops/:id/edit → OpsAddForm (edit log entry, pre-filled)
//     *           → NotFoundPage (catch-all)
//
// basename: '/mos' matches the Caddy/Vite base (OD-P0-5).
// replace on every redirect so Back does not re-enter (FR-012 back-guard).
export const routeConfig: RouteObject[] = [
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
              { path: 'new', element: <TaskCreate /> },
              { path: ':taskId', element: <TaskDetail /> },
            ],
          },
          { path: 'updates', element: <UpdatesPage /> },
          { path: 'ops', element: <OpsPage /> },
          { path: 'ops/new', element: <OpsAddForm /> },
          { path: 'ops/:id/edit', element: <OpsAddForm /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]

export const router = createBrowserRouter(routeConfig, { basename: '/mos' })
