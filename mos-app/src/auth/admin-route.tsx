import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './use-auth'
import { AccessBoundary } from '@/shell/access-boundary'

// FR-001/AC-070: nested under ProtectedRoute. A session without the `admin` access role meets the
// shell's access boundary (OD-WAY-98 (8)) — a hidden route is not a security boundary (RLS is the
// real gate, ADR-0011 D5).
export function AdminRoute() {
  const auth = useAuth()
  // See RequireAccessRole: pre-auth is not a denial, so it stays a redirect.
  if (auth.status !== 'authenticated') return <Navigate to="/" replace />
  if (!auth.viewer.accessRoles.includes('admin')) return <AccessBoundary />
  return <Outlet />
}
