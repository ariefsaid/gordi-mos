// Client capability derivation (ADR-0020 D4 — convenience only; RLS is the authority, FR-333).
// Mirrors the shared.role_capabilities seed (supabase/migrations/20260708000001, as amended by
// later migrations below) for the v1 grants. Reuses auth.viewer.accessRoles (the JWT access_roles
// claim — same source the DB reads).
// TODO(admin-editable-roles, ADR-0020 D2): replace this static map with an RPC
// (shared.my_capabilities()) once grants become admin-editable. Until then the seed is static.
// Step 4 (ADR-0050 D7 / A2 seed) adds the Signal capabilities: signal.create_for_team,
// signal.mention_bu, signal.retract — all default-deny, granted per the A2 migration seed
// (member/ops_lead/finance/admin get signal.create implicitly — no client gate needed for it).
// Step 6 adds process.start — ops_lead + admin. OD-REDESIGN-71iii (2026-07-19) EXTENDS it to
// member: a barista on the café Team starts their own opening (OD-66 front). Safe via the server's
// double gate (can('process.start') AND Team membership) — a member can start only their Team's
// process. process.adopt stays admin-only.
// OD-V4-1 (2026-07-27, supabase/migrations/20260727000001_od_v4_1_objective_lead_write.sql) EXTENDS
// objective.manage to ops_lead: Objectives are writeable at lead level, not admin-only. Read was
// never capability-gated (mos.objectives SELECT RLS has no role check) — only the rail/route client
// gate was wrong; this mirror fix is what makes the Objectives destination visible to ops_lead.
export const ROLE_CAPABILITIES: Readonly<Record<string, readonly string[]>> = {
  admin: [
    'objective.manage', 'workline.manage', 'followup.confirm',
    'signal.create_for_team', 'signal.mention_bu', 'signal.retract',
    'process.start', 'process.adopt',
  ],
  finance: ['followup.confirm', 'signal.mention_bu', 'signal.retract'],
  // OD-V4-1: ops_lead gains objective.manage — write at lead level, matches admin.
  ops_lead: [
    'objective.manage', 'workline.manage',
    'signal.create_for_team', 'signal.mention_bu', 'signal.retract', 'process.start',
  ],
  // OD-71iii: member gets process.start — Team-membership gate on the server keeps it scoped.
  member: ['process.start'],
}

/** True iff any of the viewer's accessRoles is granted `capability` (v1 seed). */
export function can(accessRoles: readonly string[], capability: string): boolean {
  return accessRoles.some((role) => (ROLE_CAPABILITIES[role] ?? []).includes(capability))
}
