import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './use-auth'
import { can } from '@/lib/capabilities'

// Capability route gate (ADR-0020 D4, FR-313). Nested under ProtectedRoute. A session whose
// accessRoles do not grant `capability` is bounced to the everyone cascade view — a hidden route
// is convenience, not a security boundary (RLS via shared.can() is the real gate, FR-333).
export function RequireCapability({ capability }: { capability: string }) {
  const auth = useAuth()
  const roles = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  if (!can(roles, capability)) return <Navigate to="/work/tasks" replace />
  return <Outlet />
}
