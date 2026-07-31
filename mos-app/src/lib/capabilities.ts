// Client capability derivation (ADR-0020 D4 — convenience only; RLS is the authority, FR-333).
// Mirrors the shared.role_capabilities seed (supabase/migrations/20260708000001) for the v1
// grants. Reuses auth.viewer.accessRoles (the JWT access_roles claim — same source the DB reads).
// TODO(admin-editable-roles, ADR-0020 D2): replace this static map with an RPC
// (shared.my_capabilities()) once grants become admin-editable. Until then the seed is static.
export const ROLE_CAPABILITIES: Readonly<Record<string, readonly string[]>> = {
  admin: ['objective.manage', 'workline.manage', 'followup.confirm'],
  finance: ['followup.confirm'],
  ops_lead: ['workline.manage'],
}

/** Roles that admit to Revenue VIEW (ADR-0051 D4). Exported for router/destinations consistency. */
export const REVENUE_VIEW_ROLES = ['finance', 'admin', 'manager', 'supervisor'] as const

/** Roles that admit to Margin/COGS VIEW (ADR-0051 D4 — supervisor excluded, revenue-only). Exported for consistency. */
export const MARGIN_VIEW_ROLES = ['finance', 'admin', 'manager'] as const

/** True iff any of the viewer's accessRoles is granted `capability` (v1 seed). */
export function can(accessRoles: readonly string[], capability: string): boolean {
  return accessRoles.some((role) => (ROLE_CAPABILITIES[role] ?? []).includes(capability))
}

/** Revenue-VIEW visibility: finance | admin | manager | supervisor (ADR-0051 D4). RLS is the hard boundary. */
export function canViewRevenue(accessRoles: readonly string[]): boolean {
  return REVENUE_VIEW_ROLES.some((r) => accessRoles.includes(r))
}

/** Margin/COGS-VIEW visibility: finance | admin | manager (ADR-0051 D4 — supervisor excluded, revenue-only). */
export function canViewMargin(accessRoles: readonly string[]): boolean {
  return MARGIN_VIEW_ROLES.some((r) => accessRoles.includes(r))
}
