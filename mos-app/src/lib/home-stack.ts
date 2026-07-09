// home-stack.ts — the pure role-union → ordered-sections selector for the stacked-union Home
// (Issue E, docs/specs/home-stacked-union.spec.md). Pure + unit-tested: takes the viewer's held
// roles + the full org role tree + access signals and returns the ordered stack of sections, no I/O.
//
// Model (binding, docs/decisions.md "Home composition"): Home composes the UNION of the role-scopes a
// person holds, widest-scope-first — owner-cockpit → function-cockpit(s) → my-week (or capture-first).
// NOT a toggle, NOT a separate login. Reuses the existing role tree (shared.roles) — no schema change.
//
// Role-scope detection (compose over shared.roles, already read by resolveViewer):
//  - owner-director: holds a role with reports_to_role_id IS NULL (top-of-chain).
//  - function-owner/BU-head: holds the apex role of a BU (parent null/missing/in a different BU).
//  - lead/manager: viewer.isManager (derived from the role chain, OD-P1-7).
//  - contributor/member: none of the above.
//
// Visibility direction (§3.6): money is BU-scoped. This selector only decides WHICH sections render +
// their scope; the money-position section enforces "BU scope ⇒ no whole-company tiles" (see
// MoneyPositionSection). A member gets no cockpit ⇒ no finance section at all.

export type HomeSection =
  | { kind: 'owner-cockpit' }
  | { kind: 'function-cockpit'; buId: string; buName: string }
  | { kind: 'my-week' }
  | { kind: 'capture-first' }

export interface RoleScopeNode {
  id: string
  business_unit_id: string | null
  reports_to_role_id: string | null
}

export interface BusinessUnitRef {
  id: string
  name: string
}

export interface DeriveHomeStackInput {
  /** the viewer's held roles (viewer.roles from resolveViewer) */
  viewerRoles: RoleScopeNode[]
  /** the full org role tree (shared.roles) — needed to test BU apex (parent's business_unit_id) */
  allRoles: RoleScopeNode[]
  /** viewer.isManager (derived) */
  isManager: boolean
  /** viewer.accessRoles (admin/ops_lead/finance/member/manager) — reserved for future scope rules */
  accessRoles: string[]
  /** shared.business_units — to resolve buId → buName for the function-cockpit headings */
  businessUnits: BusinessUnitRef[]
}

/** owner-director ↔ holds the top-of-chain role (reports_to_role_id IS NULL). */
export function isOwnerDirector(viewerRoles: RoleScopeNode[]): boolean {
  return viewerRoles.some((r) => r.reports_to_role_id === null)
}

/**
 * The distinct BUs the viewer HEADS — one entry per BU whose apex role the viewer holds.
 * A role R is the apex of its BU iff its parent (reports_to) is null, missing, or in a DIFFERENT BU
 * (incl. null-BU). Deduped by business_unit_id. (The owner-director role has business_unit_id null,
 * so it is never counted as a BU-head.)
 */
export function buHeadsForViewer(
  viewerRoles: RoleScopeNode[],
  allRoles: RoleScopeNode[],
): { buId: string }[] {
  const byId = new Map<string, RoleScopeNode>()
  for (const r of allRoles) byId.set(r.id, r)

  const seen = new Set<string>()
  const out: { buId: string }[] = []
  for (const r of viewerRoles) {
    if (!r.business_unit_id) continue
    if (seen.has(r.business_unit_id)) continue
    const parent = r.reports_to_role_id ? byId.get(r.reports_to_role_id) ?? null : null
    const isApex =
      r.reports_to_role_id === null || // no parent
      parent === null || // parent missing from the tree
      parent.business_unit_id !== r.business_unit_id // parent in a different BU
    if (isApex) {
      seen.add(r.business_unit_id)
      out.push({ buId: r.business_unit_id })
    }
  }
  return out
}

/**
 * Compose the ordered stacked-union sections for a viewer (widest-scope-first):
 * owner-cockpit → function-cockpit(s, BU-name order) → my-week | capture-first.
 *
 * Personal-section rule: owner OR bu-head OR manager → my-week (the existing MyWeekPanel); a pure
 * contributor/member (no wider scope) → capture-first. A viewer holding several scopes sees the union
 * stacked (e.g. BU-head + manager → function-cockpit THEN my-week, no duplicate my-week).
 */
export function deriveHomeStack(input: DeriveHomeStackInput): HomeSection[] {
  const { viewerRoles, allRoles, isManager, businessUnits } = input
  const sections: HomeSection[] = []

  const owner = isOwnerDirector(viewerRoles)

  const buHeads = buHeadsForViewer(viewerRoles, allRoles)
    .map((b) => ({
      buId: b.buId,
      buName: businessUnits.find((u) => u.id === b.buId)?.name ?? '',
    }))
    .sort((a, b) => a.buName.localeCompare(b.buName))

  if (owner) sections.push({ kind: 'owner-cockpit' })
  for (const bu of buHeads) {
    sections.push({ kind: 'function-cockpit', buId: bu.buId, buName: bu.buName })
  }

  if (owner || buHeads.length > 0 || isManager) {
    sections.push({ kind: 'my-week' })
  } else {
    sections.push({ kind: 'capture-first' })
  }

  return sections
}
