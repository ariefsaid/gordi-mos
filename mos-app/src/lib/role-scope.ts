// Pure role-scope predicates used by the shipped Home's Objectives door.

export type RoleScopeNode = {
  id: string
  business_unit_id: string | null
  reports_to_role_id: string | null
}

/** The viewer holds the top-of-chain role. */
export function isOwnerDirector(viewerRoles: RoleScopeNode[]): boolean {
  return viewerRoles.some((r) => r.reports_to_role_id === null)
}

/** Return each business unit whose apex role the viewer holds. */
export function buHeadsForViewer(viewerRoles: RoleScopeNode[], allRoles: RoleScopeNode[]): { buId: string }[] {
  const byId = new Map<string, RoleScopeNode>()
  for (const role of allRoles) byId.set(role.id, role)

  const seen = new Set<string>()
  const heads: { buId: string }[] = []
  for (const role of viewerRoles) {
    if (!role.business_unit_id || seen.has(role.business_unit_id)) continue
    const parent = role.reports_to_role_id ? byId.get(role.reports_to_role_id) ?? null : null
    const isApex =
      role.reports_to_role_id === null ||
      parent === null ||
      parent.business_unit_id !== role.business_unit_id
    if (isApex) {
      seen.add(role.business_unit_id)
      heads.push({ buId: role.business_unit_id })
    }
  }
  return heads
}
