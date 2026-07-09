import type { RolesRow } from '@/lib/database.types'

export type FollowUpLane = 'b2b_sales' | 'retail_ops'

export function roleBusinessUnitCodes(roles: readonly Pick<RolesRow, 'business_unit_id'>[], businessUnits: readonly { id: string; code?: string | null }[]): Set<string> {
  const codeByBu = new Map(businessUnits.map((bu) => [bu.id, bu.code ?? null]))
  const codes = new Set<string>()
  for (const role of roles) {
    const code = role.business_unit_id ? codeByBu.get(role.business_unit_id) : null
    if (code) codes.add(code)
  }
  return codes
}

export function canWorkLane(lane: FollowUpLane, roles: readonly Pick<RolesRow, 'business_unit_id'>[], businessUnits: readonly { id: string; code?: string | null }[], accessRoles: readonly string[] = []): boolean {
  if (accessRoles.includes('admin')) return true
  return roleBusinessUnitCodes(roles, businessUnits).has(lane)
}

export function canWorkAnyLane(roles: readonly Pick<RolesRow, 'business_unit_id'>[], businessUnits: readonly { id: string; code?: string | null }[], accessRoles: readonly string[] = []): boolean {
  return canWorkLane('b2b_sales', roles, businessUnits, accessRoles) || canWorkLane('retail_ops', roles, businessUnits, accessRoles)
}
