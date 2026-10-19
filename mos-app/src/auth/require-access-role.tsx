import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './use-auth'
import { AccessBoundary, type AccessBoundaryProps } from '@/shell/access-boundary'
import type { ModuleId } from '@/lib/db/module-settings'
import { useModuleAvailability } from '@/lib/module-availability'

// Generic access-role route gate (OD-C-2). Nested under ProtectedRoute, so the session is already
// authenticated here; a session lacking ANY of `anyOf` meets the shell's access boundary instead
// of a silent bounce home (OD-WAY-98 (8)) — a hidden route is convenience, not a security
// boundary (RLS is the real gate, ADR-0011 D5). Sibling of AdminRoute (which is the admin-only
// special case); kept separate to avoid churning that feature's file.
export type RequireAccessRoleProps = {
  anyOf: readonly string[]
  /** Name the denied child link when the gate sits inside an admitted module. */
  scope?: AccessBoundaryProps['scope']
  /** Module presentation admission may be broadened by a personal Allow; data/action authority is unchanged. */
  moduleId?: ModuleId
}

export function RequireAccessRole({ anyOf, scope, moduleId }: RequireAccessRoleProps) {
  const auth = useAuth()
  const { isOn } = useModuleAvailability()
  // Not yet authenticated (loading, or an unauthenticated render racing ProtectedRoute) is not a
  // denial — there is no viewer to tell anything to. It stays a redirect so no boundary flashes
  // in front of a viewer who turns out to hold the role.
  if (auth.status !== 'authenticated') return <Navigate to="/" replace />
  const roleAdmitted = anyOf.some((role) => auth.viewer.accessRoles.includes(role))
  if (moduleId ? !isOn(moduleId, roleAdmitted) : !roleAdmitted) return <AccessBoundary scope={scope} />
  return <Outlet />
}
