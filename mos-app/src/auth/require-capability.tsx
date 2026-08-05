import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './use-auth'
import { can } from '@/lib/capabilities'

// Where a capability-miss lands. /work/tasks is the one Work surface every authenticated viewer
// can reach: no capability, no access-role gate, no feature flag — so the bounce can never
// dead-end. It replaces the cut /work/cascade path (#179, OD-WAY-32).
//
// It is the CANONICAL path, not the retired /tasks (#189). /tasks is now a redirect, so bouncing
// there would make every capability miss two hops — the exact defect the one-hop assertion in
// `src/test/route-table.ts` was tightened to catch (#220), and it caught this one.
export const CAPABILITY_FALLBACK_PATH = '/work/tasks'

// Capability route gate (ADR-0020 D4, FR-313). Nested under ProtectedRoute. A session whose
// accessRoles do not grant `capability` is bounced to the ungated Work surface — a hidden route
// is convenience, not a security boundary (RLS via shared.can() is the real gate, FR-333).
export function RequireCapability({ capability }: { capability: string }) {
  const auth = useAuth()
  const roles = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  if (!can(roles, capability)) return <Navigate to={CAPABILITY_FALLBACK_PATH} replace />
  return <Outlet />
}
