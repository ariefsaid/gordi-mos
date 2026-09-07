import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './use-auth'
import { AccessBoundary } from '@/shell/access-boundary'
import { can } from '@/lib/capabilities'

// Capability route gate (ADR-0020 D4, FR-313). Nested under ProtectedRoute. A session whose
// accessRoles do not grant `capability` meets the shell's access boundary (OD-WAY-98 (8)) — a
// hidden route is convenience, not a security boundary (RLS via shared.can() is the real gate,
// FR-333).
//
// It used to bounce to `/work/tasks`, the one ungated Work surface, so the bounce could not
// dead-end. The boundary retires that problem rather than solving it: nothing is forwarded, so
// there is no landing route to keep reachable and no second hop to count (#220).
export function RequireCapability({ capability }: { capability: string }) {
  const auth = useAuth()
  // See RequireAccessRole: pre-auth is not a denial, so it stays a redirect.
  if (auth.status !== 'authenticated') return <Navigate to="/" replace />
  if (!can(auth.viewer.accessRoles, capability)) return <AccessBoundary />
  return <Outlet />
}
