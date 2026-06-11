import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './useAuth'

// FR-011: when an authenticated user hits /login (or recovery), redirect to home.
// Unauthenticated and loading → render the login/recovery route.
export function RedirectIfAuthed() {
  const auth = useAuth()

  if (auth.status === 'authenticated') {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
