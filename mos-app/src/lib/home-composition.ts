import type { ViewerRole } from '@/lib/db/viewer'
import { can } from './capabilities'
import { buHeadsForViewer, isOwnerDirector, type RoleScopeNode } from './role-scope'

export interface HomeViewerScope {
  roles: readonly ViewerRole[]
  isManager: boolean
  accessRoles: readonly string[]
  affiliated: readonly string[]
}

/** Failed checks are a Café operational exception, not a proxy for route admission. */
export function canReviewCafeFailedChecks(viewer: Pick<HomeViewerScope, 'affiliated' | 'accessRoles'>): boolean {
  return viewer.affiliated.includes('cafe') || viewer.accessRoles.includes('admin')
}

// Objectives belong on the Home cockpit when the viewer can steer a scope: an actual reporting
// line, a root/director role, an Objective or work-line management grant, or a BU apex role.
// The route's read visibility is broader; this is only the Home composition decision.
export function holdsHomeCockpitScope(
  viewer: HomeViewerScope,
  orgRoles: readonly RoleScopeNode[] | null,
): boolean {
  const heldRoles = [...viewer.roles]
  return viewer.isManager
    || isOwnerDirector(heldRoles)
    || can(viewer.accessRoles, 'objective.manage')
    || can(viewer.accessRoles, 'workline.manage')
    || (orgRoles !== null && buHeadsForViewer(heldRoles, [...orgRoles]).length > 0)
}
