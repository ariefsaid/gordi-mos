// Client capability derivation (ADR-0020 D4 — convenience only; RLS is the authority, FR-333).
// Mirrors the shared.role_capabilities seed for the v1 grants. Reuses auth.viewer.accessRoles (the
// JWT access_roles claim — same source the DB reads).
//
// The seed now lives in the squashed baseline, `supabase/migrations/20260805000006_mos_access_control.sql`
// (the old 20260708000001 chain was discarded by Stage 1). The signal.* rows below are copied from
// that file, role for role — grep `signal.create_for_team` there and the three blocks line up. This
// map is a MIRROR, so it is only ever as true as the last person who checked it; the boundary is
// RLS and `shared.can()` (ADR-0020 D4 / FR-333 / NFR-004), and a wrong entry here costs an affordance,
// never an authorization.
//
// Ported from v4-redesign (#192, Tasks): `process.start` / `process.adopt` (ADR-0051 D8 — member
// holds process.start per OD-REDESIGN-71iii, a Team-membership gate on the server keeps it scoped
// to the member's own Team) and the ops_lead extension of `objective.manage` (OD-V4-1) already
// exist in the squashed baseline's seed (20260805000006_mos_access_control.sql) — this mirror was
// simply stale relative to it; #192 brought it current, so the rows below are no longer deferred.
//
// TODO(admin-editable-roles, ADR-0020 D2): replace this static map with an RPC
// (shared.my_capabilities()) once grants become admin-editable. Until then the seed is static.
export const ROLE_CAPABILITIES: Readonly<Record<string, readonly string[]>> = {
  admin: [
    'objective.manage', 'workline.manage', 'followup.confirm',
    'signal.create_for_team', 'signal.mention_bu', 'signal.retract',
    'process.start', 'process.adopt',
  ],
  finance: ['followup.confirm', 'signal.mention_bu', 'signal.retract'],
  ops_lead: [
    'objective.manage', 'workline.manage',
    'signal.create_for_team', 'signal.mention_bu', 'signal.retract', 'process.start',
  ],
  member: ['process.start'],
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
