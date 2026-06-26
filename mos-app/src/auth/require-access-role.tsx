import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './use-auth'

// Generic access-role route gate (OD-C-2). Nested under ProtectedRoute, so the
// session is already authenticated here; a session lacking ANY of `anyOf` is
// bounced home — a hidden route is convenience, not a security boundary (RLS is
// the real gate, ADR-0011 D5). Sibling of AdminRoute (which is the admin-only
// special case); kept separate to avoid churning that feature's file.
export function RequireAccessRole({ anyOf }: { anyOf: string[] }) {
  const auth = useAuth()
  const roles = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  const allowed = anyOf.some((r) => roles.includes(r))
  if (!allowed) return <Navigate to="/" replace />
  return <Outlet />
}
