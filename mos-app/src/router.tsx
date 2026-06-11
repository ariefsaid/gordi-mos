import { createBrowserRouter } from 'react-router-dom'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { RedirectIfAuthed } from './auth/RedirectIfAuthed'
import AppShell from './shell/AppShell'
import MyWeek from './pages/MyWeek'
import TasksPage from './pages/TasksPage'
import TaskDetail from './pages/TaskDetail'
import TaskCreate from './pages/TaskCreate'
import UpdatesPage from './pages/UpdatesPage'
import OpsPage from './pages/OpsPage'
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
//     /tasks      → TasksPage (list)
//     /tasks/new  → TaskCreate (P2-1c create form)
//     /tasks/:taskId → TaskDetail (P2-1c detail)
//     /updates    → UpdatesPage
//     /ops        → OpsPage
//     *           → NotFoundPage (catch-all)
//
// basename: '/mos' matches the Caddy/Vite base (OD-P0-5).
// replace on every redirect so Back does not re-enter (FR-012 back-guard).
export const routeConfig = [
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
          { path: 'tasks', element: <TasksPage /> },
          { path: 'tasks/new', element: <TaskCreate /> },
          { path: 'tasks/:taskId', element: <TaskDetail /> },
          { path: 'updates', element: <UpdatesPage /> },
          { path: 'ops', element: <OpsPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]

export const router = createBrowserRouter(routeConfig, { basename: '/mos' })
