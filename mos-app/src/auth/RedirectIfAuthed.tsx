import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './useAuth'

// FR-011: when an authenticated user hits /login (or recovery), redirect to home.
// Orphan users are also authenticated (they have a valid JWT) — redirect them to /
// so ProtectedRoute can show the OrphanScreen rather than leaving them on the login form.
// Unauthenticated and loading → render the login/recovery route.
export function RedirectIfAuthed() {
  const auth = useAuth()

  if (auth.status === 'authenticated' || auth.status === 'orphan') {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
