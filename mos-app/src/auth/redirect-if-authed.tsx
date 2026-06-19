import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './use-auth'

// FR-011: when an authenticated user hits /login (or recovery), redirect to home.
// Orphan users are also authenticated (they have a valid JWT) — redirect them to /
// so ProtectedRoute can show the OrphanScreen rather than leaving them on the login form.
// Unauthenticated and loading → render the login/recovery route.
//
// PASSWORD_RECOVERY: while recovering, /recovery must render (not bounce), but all other
// routes under this gate redirect to /recovery so the user sets a new password first.
export function RedirectIfAuthed() {
  const auth = useAuth()
  const location = useLocation()

  if (auth.status === 'recovering') {
    // Already on /recovery — render the set-password form.
    if (location.pathname.endsWith('/recovery')) {
      return <Outlet />
    }
    // Anywhere else → force to /recovery.
    return <Navigate to="/recovery" replace />
  }

  if (auth.status === 'authenticated' || auth.status === 'orphan') {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
