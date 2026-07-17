// Client capability derivation (ADR-0020 D4 — convenience only; RLS is the authority, FR-333).
// Mirrors the shared.role_capabilities seed (supabase/migrations/20260708000001) for the v1
// grants. Reuses auth.viewer.accessRoles (the JWT access_roles claim — same source the DB reads).
// TODO(admin-editable-roles, ADR-0020 D2): replace this static map with an RPC
// (shared.my_capabilities()) once grants become admin-editable. Until then the seed is static.
// Step 4 (ADR-0050 D7 / A2 seed) adds the Signal capabilities: signal.create_for_team,
// signal.mention_bu, signal.retract — all default-deny, granted per the A2 migration seed
// (member/ops_lead/finance/admin get signal.create implicitly — no client gate needed for it).
// Step 6 (ADR-0051 §3 / spec §6) adds process.start — ops_lead + admin only, no member grant in
// v1 (RATIFY-5); process.adopt is reserved (admin-only, unwired in v1).
export const ROLE_CAPABILITIES: Readonly<Record<string, readonly string[]>> = {
  admin: [
    'objective.manage', 'workline.manage', 'followup.confirm',
    'signal.create_for_team', 'signal.mention_bu', 'signal.retract',
    'process.start', 'process.adopt',
  ],
  finance: ['followup.confirm', 'signal.mention_bu', 'signal.retract'],
  ops_lead: ['workline.manage', 'signal.create_for_team', 'signal.mention_bu', 'signal.retract', 'process.start'],
}

/** True iff any of the viewer's accessRoles is granted `capability` (v1 seed). */
export function can(accessRoles: readonly string[], capability: string): boolean {
  return accessRoles.some((role) => (ROLE_CAPABILITIES[role] ?? []).includes(capability))
}
