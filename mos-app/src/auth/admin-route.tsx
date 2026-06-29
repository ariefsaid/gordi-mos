import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './use-auth'

// FR-001/AC-070: nested under ProtectedRoute. A session without the `admin` access
// role is bounced to home — a hidden route is not a security boundary (RLS is the
// real gate, ADR-0011 D5).
export function AdminRoute() {
  const auth = useAuth()
  const isAdmin =
    auth.status === 'authenticated' && auth.viewer.accessRoles.includes('admin')
  if (!isAdmin) return <Navigate to="/" replace />
  return <Outlet />
}
