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
  // process.start (ADR-0051 D8 / OD-REDESIGN-71(iii), supabase/migrations/20260805000006):
  // the person who runs the floor starts the day. Safe client-side because
  // mos.spawn_process_run ALSO requires membership of the owning Team.
  member: ['process.start'],
}

// The two money-read sets (ADR-0051 D4; #797 / OD-WAY-98 dropped admin from both). `admin` is the
// users-and-settings role and reads no money of its own — the Director reads Money by holding
// manager beside admin. The database policies on reporting.sales_daily_revenue and
// reporting.sales_margin_daily (MONEY_READ_POLICY_MIGRATION) state the same two lists, and
// capabilities.test.ts reads that file to pin them equal. Every shell surface that decides whether
// Money renders reads these through canViewRevenue / REVENUE_VIEW_ROLES, never its own literal.
export const MONEY_READ_POLICY_MIGRATION = '20260907000002_reporting_money_read_roles.sql'

/** Roles that admit to Revenue VIEW. supervisor is scoped by RLS to their own grants. */
export const REVENUE_VIEW_ROLES = ['finance', 'manager', 'supervisor'] as const

/** Roles that admit to Margin/COGS VIEW — supervisor excluded, revenue-only. */
export const MARGIN_VIEW_ROLES = ['finance', 'manager'] as const

/** True iff any of the viewer's accessRoles is granted `capability` (v1 seed). */
export function can(accessRoles: readonly string[], capability: string): boolean {
  return accessRoles.some((role) => (ROLE_CAPABILITIES[role] ?? []).includes(capability))
}

/** Revenue-VIEW visibility — the one answer every Money door reads. RLS is the hard boundary. */
export function canViewRevenue(accessRoles: readonly string[]): boolean {
  return REVENUE_VIEW_ROLES.some((r) => accessRoles.includes(r))
}

/** Margin/COGS-VIEW visibility — the narrower tier inside the revenue read. */
export function canViewMargin(accessRoles: readonly string[]): boolean {
  return MARGIN_VIEW_ROLES.some((r) => accessRoles.includes(r))
}
