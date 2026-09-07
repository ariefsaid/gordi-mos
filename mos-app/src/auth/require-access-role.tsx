import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './use-auth'
import { AccessBoundary } from '@/shell/access-boundary'

// Generic access-role route gate (OD-C-2). Nested under ProtectedRoute, so the session is already
// authenticated here; a session lacking ANY of `anyOf` meets the shell's access boundary instead
// of a silent bounce home (OD-WAY-98 (8)) — a hidden route is convenience, not a security
// boundary (RLS is the real gate, ADR-0011 D5). Sibling of AdminRoute (which is the admin-only
// special case); kept separate to avoid churning that feature's file.
export type RequireAccessRoleProps = { anyOf: readonly string[] }

export function RequireAccessRole({ anyOf }: RequireAccessRoleProps) {
  const auth = useAuth()
  // Not yet authenticated (loading, or an unauthenticated render racing ProtectedRoute) is not a
  // denial — there is no viewer to tell anything to. It stays a redirect so no boundary flashes
  // in front of a viewer who turns out to hold the role.
  if (auth.status !== 'authenticated') return <Navigate to="/" replace />
  if (!anyOf.some((r) => auth.viewer.accessRoles.includes(r))) return <AccessBoundary />
  return <Outlet />
}
