// Client mirror of mos.can_manage_definition(business_unit_id) (#801, OD-WAY-97). Decides what the
// UI offers; RLS decides what lands. Same arms, same order as the database predicate.

import { buHeadsForViewer, type RoleScopeNode } from './role-scope'

export interface DefinitionViewer {
  /** Stored access-role grants (the JWT claim). */
  accessRoles: string[]
  /** Holds at least one report in the reporting line — ViewerResult.isManager. */
  isManager: boolean
  /** Roles the viewer holds. */
  roles: RoleScopeNode[]
  /** Every role in the org, so a held role can be judged a unit head. */
  allRoles: RoleScopeNode[]
  /** Business units of the viewer's live Team memberships. */
  teamBuIds?: string[]
}

/**
 * admin and ops_lead manage a definition anywhere, a null unit included. A lead — holds a report,
 * or heads a Business unit — manages a definition in a unit where they hold a role or a live Team
 * membership. Nobody else; a definition with no unit is admin/ops_lead only.
 */
export function canManageDefinition(viewer: DefinitionViewer, buId: string | null): boolean {
  if (viewer.accessRoles.includes('admin') || viewer.accessRoles.includes('ops_lead')) return true
  if (buId === null) return false
  const isLead = viewer.isManager || buHeadsForViewer(viewer.roles, viewer.allRoles).length > 0
  if (!isLead) return false
  return (
    viewer.roles.some((r) => r.business_unit_id === buId) ||
    (viewer.teamBuIds ?? []).includes(buId)
  )
}
