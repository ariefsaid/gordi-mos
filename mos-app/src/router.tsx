import { createBrowserRouter } from 'react-router-dom'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { RedirectIfAuthed } from './auth/RedirectIfAuthed'
import Home from './pages/Home'
import LoginPage from './pages/LoginPage'
import RecoveryPage from './pages/RecoveryPage'

// Route layout:
// / (RedirectIfAuthed gate) — unauthenticated users can access these
//   /login        → LoginPage
//   /recovery     → RecoveryPage
// / (ProtectedRoute gate) — authenticated viewers only
//   /             → Home
//
// basename: '/mos' matches the Caddy/Vite base (OD-P0-5).
// replace on every redirect so Back does not re-enter (FR-012 back-guard).
export const router = createBrowserRouter(
  [
    {
      element: <RedirectIfAuthed />,
      children: [
        { path: '/login', element: <LoginPage /> },
        { path: '/recovery', element: <RecoveryPage /> },
      ],
    },
    {
      element: <ProtectedRoute />,
      children: [{ path: '/', element: <Home /> }],
    },
  ],
  { basename: '/mos' },
)
